/**
 * GET /v1/u/:handle — public profile (auth optional).
 * GET /v1/u/:handle/autobiography — richer stats for the onboarding flow.
 * GET /v1/u/:handle/share — public instructions and rolling 30-day share stats.
 *
 * Returns user info + today/week/allTime token + cost totals
 * aggregated from daily_rollup.
 */
import {
  GetHeatmapQuery,
  type ProfileShare,
  ProfileShareQuery,
  activityBounds,
  buildActivityHeatmap,
} from "@token-rats/contracts";
import { Hono } from "hono";
import type { Env } from "../env.js";
import { notFound, validationError } from "../lib/errors.js";
import { modelProvider } from "../lib/profile-share.js";
import { parseGithubProjects, parseProfileFavorites } from "../lib/profile-social.js";
import { ensureReferralCode } from "../lib/referral.js";
import { VERSION_SELECT, type VersionRow, serializeVersion } from "../lib/setups.js";
import { MONTH_MS } from "../lib/time.js";
import type { AuthVariables } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const profiles = new Hono<HonoEnv>();

// Deliberately public-only, even for the owner: image URLs can be fetched by anyone.
profiles.get("/:handle/share", async (c) => {
  c.header("Cache-Control", "no-store");
  const parsed = ProfileShareQuery.safeParse(c.req.query());
  if (!parsed.success) return validationError(c, parsed.error.issues);
  const query = parsed.data;
  const user = await c.env.DB.prepare(
    "SELECT id,handle,avatar_url,bio FROM users WHERE handle=? AND public_profile=1",
  )
    .bind(c.req.param("handle"))
    .first<{
      id: string;
      handle: string;
      avatar_url: string | null;
      bio: string | null;
    }>();
  if (!user || (await c.env.CACHE.get(`banned:handle:${user.handle.toLowerCase()}`)) !== null)
    return notFound(c, "Profile not found");

  const version = await c.env.DB.prepare(
    `${VERSION_SELECT} WHERE s.user_id=? AND v.published_at IS NOT NULL AND v.visibility='public'
     ${query.version ? "AND v.id=?" : "AND v.number=(SELECT MAX(number) FROM setup_versions WHERE setup_id=s.id AND published_at IS NOT NULL AND visibility='public')"}
     ORDER BY s.featured DESC,v.published_at DESC LIMIT 1`,
  )
    .bind("", user.id, ...(query.version ? [query.version] : []))
    .first<VersionRow>();
  if (!version && (query.version || query.file !== undefined || query.start || query.end))
    return notFound(c, "Published instructions not found");

  let instructions: ProfileShare["instructions"] = null;
  if (version) {
    const { files } = serializeVersion(version).bundle;
    const fileIndex =
      query.file ??
      Math.max(
        0,
        files.findIndex((f) => f.name.toLowerCase() === "agents.md"),
      );
    const file = files[fileIndex];
    if (!file) return validationError(c, "Instruction file not found");
    const lines = file.content.replace(/\r\n?/g, "\n").split("\n");
    const start = query.start ?? 1;
    const end = query.end ?? Math.min(start + 7, lines.length);
    if (start > lines.length || end > lines.length)
      return validationError(c, "Choose lines within the instruction file");
    instructions = {
      setupId: version.setup_id,
      versionId: version.id,
      file: fileIndex,
      fileName: file.name,
      start,
      end,
      text: lines.slice(start - 1, end).join("\n"),
    };
  }

  const end = Date.now();
  const start = end - MONTH_MS;
  const rows = await c.env.DB.prepare(
    `SELECT model,provider,SUM(in_tokens + out_tokens) AS tokens FROM sessions
     WHERE user_id=? AND started_at>=? AND started_at<=?
     GROUP BY model,provider HAVING SUM(in_tokens + out_tokens)>0`,
  )
    .bind(user.id, start, end)
    .all<{ model: string; provider: string; tokens: number }>();
  const models = new Map<string, number>();
  const providers = new Map<string, number>();
  let tokens = 0;
  for (const row of rows.results) {
    tokens += row.tokens;
    models.set(row.model, (models.get(row.model) ?? 0) + row.tokens);
    const provider = modelProvider(row.model, row.provider);
    providers.set(provider, (providers.get(provider) ?? 0) + row.tokens);
  }
  const top = (values: Map<string, number>) =>
    [...values].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const share: ProfileShare = {
    handle: user.handle,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    period: { start, end },
    tokens,
    topModel: top(models),
    topProvider: top(providers),
    instructions,
  };
  return c.json({ share });
});

profiles.get("/:handle", optionalAuth, async (c) => {
  const handle = c.req.param("handle");

  const user = await c.env.DB.prepare(
    "SELECT id, handle, avatar_url, public_profile, bio, twitter_handle, agent_instructions, publish_agent_instructions, agent_workflow, github_projects, profile_favorites FROM users WHERE handle = ?",
  )
    .bind(handle)
    .first<{
      id: string;
      handle: string;
      avatar_url: string | null;
      public_profile: number;
      bio: string | null;
      twitter_handle: string | null;
      agent_instructions: string | null;
      publish_agent_instructions: number;
      agent_workflow: string | null;
      github_projects: string | null;
      profile_favorites: string | null;
    }>();

  if (!user) {
    return notFound(c, "User not found");
  }

  // Check banlist — drop public-facing views for banned handles
  const banned = await c.env.CACHE.get(`banned:handle:${handle.toLowerCase()}`);
  if (banned !== null) {
    return notFound(c, "User not found");
  }

  // Private-profile guard: only the user themselves may view
  const callerId = c.var.userId ?? null;
  if (user.public_profile !== 1 && callerId !== user.id) {
    return notFound(c, "This profile is private");
  }

  // Determine if caller is the owner (so we can include sensitive fields)
  const isOwner = callerId === user.id;
  const isPublic = user.public_profile === 1;

  const todayUtc = new Date().toISOString().slice(0, 10);

  // Compute today, last 7 days (week), and all-time in one query using CASE
  const row = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN day = ?  THEN tokens         ELSE 0 END), 0) AS today_tokens,
       COALESCE(SUM(CASE WHEN day = ?  THEN cost_usd_cents ELSE 0 END), 0) AS today_cost,
       COALESCE(SUM(CASE WHEN day >= ? THEN tokens         ELSE 0 END), 0) AS week_tokens,
       COALESCE(SUM(CASE WHEN day >= ? THEN cost_usd_cents ELSE 0 END), 0) AS week_cost,
       COALESCE(SUM(tokens),         0) AS all_tokens,
       COALESCE(SUM(cost_usd_cents), 0) AS all_cost
     FROM daily_rollup
     WHERE user_id = ?`,
  )
    .bind(
      todayUtc, // today_tokens
      todayUtc, // today_cost
      weekStart(todayUtc), // week_tokens
      weekStart(todayUtc), // week_cost
      user.id,
    )
    .first<{
      today_tokens: number;
      today_cost: number;
      week_tokens: number;
      week_cost: number;
      all_tokens: number;
      all_cost: number;
    }>();

  const totals = row ?? {
    today_tokens: 0,
    today_cost: 0,
    week_tokens: 0,
    week_cost: 0,
    all_tokens: 0,
    all_cost: 0,
  };

  // Per-client all-time breakdown for the profile tile grid. Reads `sessions`
  // (not daily_rollup, which has no source column). Keep ORDER BY tokens DESC
  // so the UI can show the dominant tool first.
  const sourcesRows = await c.env.DB.prepare(
    `SELECT COALESCE(client, source) AS source,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ?
      GROUP BY COALESCE(client, source)
      ORDER BY tokens DESC`,
  )
    .bind(user.id)
    .all<{ source: string; tokens: number; cost: number; sessions: number }>();

  const sources = (sourcesRows.results ?? []).map((r) => ({
    source: r.source,
    tokens: r.tokens,
    costUsdCents: r.cost,
    sessions: r.sessions,
  }));

  const channelsRows = await c.env.DB.prepare(
    `SELECT COALESCE(channel, 'unknown') AS source,
            COALESCE(SUM(in_tokens + out_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_cents), 0)         AS cost,
            COUNT(*)                                  AS sessions
       FROM sessions
      WHERE user_id = ?
      GROUP BY COALESCE(channel, 'unknown')
      ORDER BY tokens DESC`,
  )
    .bind(user.id)
    .all<{ source: string; tokens: number; cost: number; sessions: number }>();

  const channels = (channelsRows.results ?? []).map((r) => ({
    source: r.source,
    tokens: r.tokens,
    costUsdCents: r.cost,
    sessions: r.sessions,
  }));

  // Referrals (migration 0007). Count is public — readable by anyone who
  // can already see the profile. The code itself is owner-only so the page
  // can render a copy-able invite link without a second fetch.
  const referralCountRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM referrals WHERE referrer_user_id = ?",
  )
    .bind(user.id)
    .first<{ n: number }>();
  const referredCount = referralCountRow?.n ?? 0;

  const referralCode = isOwner ? await ensureReferralCode(c.env.DB, user.id) : undefined;

  return c.json({
    profile: {
      id: user.id,
      handle: user.handle,
      avatarUrl: user.avatar_url,
      ...(isPublic || isOwner
        ? {
            bio: user.bio,
            twitterHandle: user.twitter_handle,
            agentInstructionsPreview: null,
            agentInstructions: null,
            agentWorkflow: null,
            githubProjects: parseGithubProjects(user.github_projects),
            profileFavorites: parseProfileFavorites(user.profile_favorites),
          }
        : {}),
      ...(isOwner ? { publicProfile: user.public_profile === 1 } : {}),
      referredCount,
      ...(referralCode ? { referralCode } : {}),
      totals: {
        today: {
          tokens: totals.today_tokens,
          costUsdCents: totals.today_cost,
        },
        week: {
          tokens: totals.week_tokens,
          costUsdCents: totals.week_cost,
        },
        allTime: {
          tokens: totals.all_tokens,
          costUsdCents: totals.all_cost,
        },
      },
      sources,
      channels,
    },
  });
});

/**
 * GET /v1/u/:handle/autobiography
 *
 * Returns rich aggregated stats derived from `sessions` and `daily_rollup`
 * to power the onboarding "Token Autobiography" moment.
 * No new tables needed — everything is computed from existing data.
 */
profiles.get("/:handle/autobiography", optionalAuth, async (c) => {
  const handle = c.req.param("handle");

  const user = await c.env.DB.prepare(
    "SELECT id, handle, avatar_url, public_profile FROM users WHERE handle = ?",
  )
    .bind(handle)
    .first<{ id: string; handle: string; avatar_url: string | null; public_profile: number }>();

  if (!user) {
    return notFound(c, "User not found");
  }

  const callerId = c.var.userId ?? null;
  if (user.public_profile !== 1 && callerId !== user.id) {
    return notFound(c, "This profile is private");
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const monthStart = `${todayUtc.slice(0, 7)}-01`; // first of current month

  // --- All-time totals + month totals from daily_rollup ---
  const rollupRow = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(tokens), 0)                                              AS all_tokens,
       COALESCE(SUM(cost_usd_cents), 0)                                      AS all_cost,
       COALESCE(SUM(CASE WHEN day >= ? THEN tokens         ELSE 0 END), 0)   AS month_tokens,
       COALESCE(SUM(CASE WHEN day >= ? THEN cost_usd_cents ELSE 0 END), 0)   AS month_cost,
       COALESCE(SUM(sessions), 0)                                            AS all_sessions,
       COUNT(DISTINCT day)                                                   AS active_days,
       MIN(day)                                                              AS first_day
     FROM daily_rollup
     WHERE user_id = ?`,
  )
    .bind(monthStart, monthStart, user.id)
    .first<{
      all_tokens: number;
      all_cost: number;
      month_tokens: number;
      month_cost: number;
      all_sessions: number;
      active_days: number;
      first_day: string | null;
    }>();

  // --- Biggest single session (sum in_tokens + out_tokens) from sessions ---
  const biggestRow = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(in_tokens + out_tokens), 0) AS biggest
     FROM sessions
     WHERE user_id = ?`,
  )
    .bind(user.id)
    .first<{ biggest: number }>();

  // --- Dominant model (most total tokens across all sessions) ---
  const dominantRow = await c.env.DB.prepare(
    `SELECT model, SUM(in_tokens + out_tokens) AS tok
     FROM sessions
     WHERE user_id = ?
     GROUP BY model
     ORDER BY tok DESC
     LIMIT 1`,
  )
    .bind(user.id)
    .first<{ model: string; tok: number }>();

  // --- Most active day-of-week (0=Sun … 6=Sat) from daily_rollup ---
  // SQLite strftime('%w', day) returns 0=Sunday … 6=Saturday
  const dowRow = await c.env.DB.prepare(
    `SELECT CAST(strftime('%w', day) AS INTEGER) AS dow, SUM(tokens) AS tok
     FROM daily_rollup
     WHERE user_id = ?
     GROUP BY dow
     ORDER BY tok DESC
     LIMIT 1`,
  )
    .bind(user.id)
    .first<{ dow: number; tok: number }>();

  const allTokens = rollupRow?.all_tokens ?? 0;
  const allCost = rollupRow?.all_cost ?? 0;
  const monthTokens = rollupRow?.month_tokens ?? 0;
  const monthCost = rollupRow?.month_cost ?? 0;
  const allSessions = rollupRow?.all_sessions ?? 0;
  const activeDays = rollupRow?.active_days ?? 0;
  const firstDay = rollupRow?.first_day ?? null;

  const biggestSessionTokens = biggestRow?.biggest ?? 0;
  const dominantModel = dominantRow?.model ?? "unknown";
  const mostActiveDayOfWeek = dowRow?.dow ?? 0;

  // sessions per day = total sessions / days that had ≥1 session
  const sessionsPerDay = activeDays > 0 ? allSessions / activeDays : 0;

  // coffees this month: $5/cup, cost is in cents
  const monthlyCoffees = monthCost / (5 * 100);

  return c.json({
    autobiography: {
      handle: user.handle,
      avatarUrl: user.avatar_url,
      totalTokens: allTokens,
      totalCostUsdCents: allCost,
      monthTokens,
      monthCostUsdCents: monthCost,
      biggestSessionTokens,
      dominantModel,
      mostActiveDayOfWeek,
      sessionsPerDay: Math.round(sessionsPerDay * 10) / 10,
      totalSessions: allSessions,
      firstSyncDate: firstDay,
      monthlyCoffees: Math.round(monthlyCoffees * 10) / 10,
    },
  });
});

/** Return the Monday of the ISO week containing `yyyy_mm_dd`. */
function weekStart(yyyy_mm_dd: string): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const day = d.getUTCDay();
  // days since Monday (handle Sunday wrapping)
  const offset = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* GET /v1/u/:handle/heatmap?range=4w|12w                                    */
/* -------------------------------------------------------------------------- */
/* Returns the requested range of `(day, tokens, sessions)` for the calendar  */
/* heatmap. 4w (default) = trailing 28 days; 12w = trailing 84 days. Same   */
/* visibility gates as the main profile. Missing days are omitted; the client */
/* fills zeros.                                                               */
/* -------------------------------------------------------------------------- */

profiles.get("/:handle/heatmap", optionalAuth, async (c) => {
  const handle = c.req.param("handle");

  const user = await c.env.DB.prepare("SELECT id, public_profile FROM users WHERE handle = ?")
    .bind(handle)
    .first<{ id: string; public_profile: number }>();

  if (!user) return notFound(c, "User not found");

  const banned = await c.env.CACHE.get(`banned:handle:${handle.toLowerCase()}`);
  if (banned !== null) return notFound(c, "User not found");

  const callerId = c.var.userId ?? null;
  if (user.public_profile !== 1 && callerId !== user.id) {
    return notFound(c, "This profile is private");
  }

  const parsed = GetHeatmapQuery.safeParse(c.req.query());
  if (!parsed.success) return validationError(c, parsed.error.issues);
  const { range } = parsed.data;
  const to = new Date(Date.now()).toISOString().slice(0, 10);
  const { queryFrom } = activityBounds(range, to);
  const first = await c.env.DB.prepare(
    "SELECT MIN(day) AS day FROM daily_rollup WHERE user_id = ? AND day <= ?",
  )
    .bind(user.id, to)
    .first<{ day: string | null }>();

  const result = await c.env.DB.prepare(
    `SELECT day,
            SUM(tokens)   AS tokens,
            SUM(sessions) AS sessions
       FROM daily_rollup
      WHERE user_id = ? AND day >= ? AND day <= ?
      GROUP BY day
      ORDER BY day`,
  )
    .bind(user.id, queryFrom, to)
    .all<{ day: string; tokens: number; sessions: number }>();

  const days = (result.results ?? []).map((r) => ({
    day: r.day,
    tokens: r.tokens,
    sessions: r.sessions,
  }));

  return c.json({ heatmap: buildActivityHeatmap(range, days, first?.day ?? null, to) });
});

export default profiles;
