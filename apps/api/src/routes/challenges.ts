import { CreateChallengeRequest } from "@token-rats/contracts";
import type { ChallengeKind } from "@token-rats/contracts";
/**
 * Challenge routes:
 *   POST /v1/rooms/:code/challenges  – create an active challenge (member-only)
 *   GET  /v1/rooms/:code/challenges  – list active + past challenges with computed leaderboards
 *
 * Leaderboard scores per challenge kind:
 *   most-tokens     → SUM(tokens) from daily_rollup WHERE day BETWEEN starts_at_day AND ends_at_day
 *   most-sessions   → SUM(sessions) from daily_rollup WHERE day BETWEEN starts_at_day AND ends_at_day
 *   longest-streak  → computed in JS from daily_rollup days (reuses computeStreaks helper)
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { forbidden, notFound, validationError } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { computeStreaks } from "./streaks.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const challenges = new Hono<HonoEnv>();

/** Convert a Unix ms timestamp to a UTC YYYY-MM-DD string. */
function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* POST /v1/rooms/:code/challenges                                             */
/* -------------------------------------------------------------------------- */

challenges.post("/:code/challenges", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  let body: { kind: ChallengeKind; durationDays: number };
  try {
    const raw: unknown = await c.req.json();
    body = CreateChallengeRequest.parse(raw);
  } catch (e) {
    return validationError(c, e instanceof Error ? e.message : e);
  }

  const room = await c.env.DB.prepare("SELECT id FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ id: string }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Must be a member to create a challenge
  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) {
    return forbidden(c, "You are not a member of this room");
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const startsAt = now;
  const endsAt = now + body.durationDays * 86_400_000;

  await c.env.DB.prepare(
    `INSERT INTO challenges (id, room_id, kind, starts_at, ends_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, room.id, body.kind, startsAt, endsAt, now)
    .run();

  return c.json(
    {
      challenge: {
        id,
        roomId: room.id,
        kind: body.kind,
        startsAt,
        endsAt,
        createdAt: now,
      },
    },
    201,
  );
});

/* -------------------------------------------------------------------------- */
/* GET /v1/rooms/:code/challenges                                              */
/* -------------------------------------------------------------------------- */

challenges.get("/:code/challenges", requireAuth, async (c) => {
  const userId = c.var.userId;
  const code = c.req.param("code");

  const room = await c.env.DB.prepare("SELECT id FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ id: string }>();

  if (!room) {
    return notFound(c, "Room not found");
  }

  // Check membership
  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?",
  )
    .bind(room.id, userId)
    .first();

  if (!membership) {
    return forbidden(c, "You are not a member of this room");
  }

  const now = Date.now();

  // Fetch all challenges for the room
  const challengeResult = await c.env.DB.prepare(
    `SELECT id, room_id, kind, starts_at, ends_at, created_at
     FROM challenges
     WHERE room_id = ?
     ORDER BY ends_at DESC`,
  )
    .bind(room.id)
    .all<{
      id: string;
      room_id: string;
      kind: ChallengeKind;
      starts_at: number;
      ends_at: number;
      created_at: number;
    }>();

  const allChallenges = challengeResult.results ?? [];
  if (allChallenges.length === 0) {
    return c.json({ active: [], past: [] });
  }

  // Fetch room members with handles + avatars
  const membersResult = await c.env.DB.prepare(
    `SELECT rm.user_id, u.handle, u.avatar_url
     FROM room_members rm
     JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = ?`,
  )
    .bind(room.id)
    .all<{ user_id: string; handle: string; avatar_url: string | null }>();

  const members = membersResult.results ?? [];
  const memberIds = members.map((m) => m.user_id);

  if (memberIds.length === 0) {
    return c.json({ active: [], past: [] });
  }

  // We need to compute leaderboards per challenge.
  // For most-tokens and most-sessions: SUM daily_rollup within challenge window.
  // For longest-streak: compute from daily_rollup days within the window.

  // Fetch all daily_rollup rows for all members (we'll filter in JS per challenge window)
  const placeholders = memberIds.map(() => "?").join(",");
  const rollupResult = await c.env.DB.prepare(
    `SELECT user_id, day, tokens, sessions
     FROM daily_rollup
     WHERE user_id IN (${placeholders})
     ORDER BY user_id, day ASC`,
  )
    .bind(...memberIds)
    .all<{ user_id: string; day: string; tokens: number; sessions: number }>();

  const rollupRows = rollupResult.results ?? [];

  // Group rollup by user_id
  const rollupByUser = new Map<string, { day: string; tokens: number; sessions: number }[]>();
  for (const row of rollupRows) {
    if (!rollupByUser.has(row.user_id)) rollupByUser.set(row.user_id, []);
    rollupByUser
      .get(row.user_id)!
      .push({ day: row.day, tokens: row.tokens, sessions: row.sessions });
  }

  /** Build a leaderboard for a single challenge. */
  function buildLeaderboard(
    kind: ChallengeKind,
    startsAt: number,
    endsAt: number,
  ): { rank: number; userId: string; handle: string; avatarUrl: string | null; score: number }[] {
    const startDay = toDay(startsAt);
    const endDay = toDay(endsAt);
    const todayUtc = new Date().toISOString().slice(0, 10);

    const scored = members.map((m) => {
      const rows = (rollupByUser.get(m.user_id) ?? []).filter(
        (r) => r.day >= startDay && r.day <= endDay,
      );

      let score = 0;
      if (kind === "most-tokens") {
        score = rows.reduce((s, r) => s + r.tokens, 0);
      } else if (kind === "most-sessions") {
        score = rows.reduce((s, r) => s + r.sessions, 0);
      } else if (kind === "longest-streak") {
        const days = rows.map((r) => r.day);
        // For a past challenge, the "today" for streak purposes is the end day
        const effectiveToday = endDay < todayUtc ? endDay : todayUtc;
        score = computeStreaks(days, effectiveToday).longestStreak;
      }

      return {
        userId: m.user_id,
        handle: m.handle,
        avatarUrl: m.avatar_url,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.map((row, i) => ({ rank: i + 1, ...row }));
  }

  const active = [];
  const past = [];

  for (const ch of allChallenges) {
    const rows = buildLeaderboard(ch.kind, ch.starts_at, ch.ends_at);
    const isPast = ch.ends_at < now;
    const winnerHandle = isPast && rows.length > 0 ? (rows[0]?.handle ?? null) : null;

    const entry = {
      id: ch.id,
      roomId: ch.room_id,
      kind: ch.kind,
      startsAt: ch.starts_at,
      endsAt: ch.ends_at,
      createdAt: ch.created_at,
      rows,
      winnerHandle,
    };

    if (isPast) {
      past.push(entry);
    } else {
      active.push(entry);
    }
  }

  return c.json({ active, past });
});

export default challenges;
