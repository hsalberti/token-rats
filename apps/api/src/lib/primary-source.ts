/**
 * primary-source — compute the kebab-case "primary source" label for a user
 * (v1.2 Track AF).
 *
 * Given a list of `(source, sourcePlan, cost)` rows aggregated over the
 * scoring window (typically last 30 days, by USD cost), return a label like
 * `claude-max` / `cursor-ide` / `codex-api` if one source-plan combination
 * holds ≥50% of the total cost. Otherwise return `null` and the UI renders
 * no pill.
 *
 * Label vocabulary:
 *   - `claude-code` + `max`     → `claude-max`
 *   - `claude-code` + `pro`     → `claude-pro`
 *   - `claude-code` + `api`     → `claude-api`
 *   - `claude-code` + `unknown` → `claude-code` (bare source)
 *   - `cursor`      + `ide`     → `cursor-ide`
 *   - `cursor`      + `unknown` → `cursor`
 *   - `codex`       + `pro`     → `codex-pro`
 *   - `codex`       + `api`     → `codex-api`
 *   - `codex`       + `unknown` → `codex`
 *
 * Threshold rule: strictly **>= 50%** of total cost. If a row has 50% exactly
 * (tie at 50/50), the first-listed row wins per Array.prototype.sort
 * stability (the caller should pre-sort by cost desc so the dominant entry
 * wins ties).
 *
 * Below the threshold, or with zero total cost, we return `null`.
 */

export interface PrimarySourceRow {
  source: string;
  sourcePlan: string | null;
  /** Total cost in USD cents over the scoring window. */
  cost: number;
}

/** Threshold (inclusive) for a source-plan combo to claim the primary label. */
export const PRIMARY_SOURCE_THRESHOLD = 0.5;

/**
 * Translate a `(source, plan)` pair to the kebab-case label rendered in the
 * pill. When `plan` is null/`unknown`, we fall back to a normalised bare
 * source name (`claude-code` → `claude`, others unchanged).
 */
export function formatPrimarySourceLabel(source: string, plan: string | null): string {
  // Normalise the source slug used in pill labels. We drop the `-code` suffix
  // from `claude-code` so the pill reads `claude-max` etc. Other sources keep
  // their canonical slug.
  const sourceSlug = source === "claude-code" ? "claude" : source;
  if (plan === null || plan === "unknown" || plan === "") {
    // Bare source label when we lack a plan tier — e.g. `claude-code` for a
    // user whose sessions all carry `sourcePlan = unknown` (old CLI, missing
    // filesystem signal).
    return source;
  }
  return `${sourceSlug}-${plan}`;
}

/**
 * Compute the primary-source label for a user given per-(source, plan)
 * aggregated cost rows. Returns `null` when no single source-plan combo
 * claims ≥50% of the total cost, or when the input is empty / zero-cost.
 *
 * The caller is responsible for the scoring window (typically last 30 days)
 * and for passing rows already grouped by `(source, source_plan)`.
 */
export function computePrimarySource(rows: PrimarySourceRow[]): string | null {
  if (rows.length === 0) return null;

  let total = 0;
  for (const r of rows) total += Math.max(0, r.cost);
  if (total <= 0) return null;

  // Find the top row by cost. Stable iteration order means ties resolve to
  // whichever row appears first in the input — callers should sort by cost
  // descending if they want a deterministic tie-break.
  let top: PrimarySourceRow | null = null;
  for (const r of rows) {
    if (top === null || r.cost > top.cost) {
      top = r;
    }
  }
  if (top === null) return null;

  const share = top.cost / total;
  if (share < PRIMARY_SOURCE_THRESHOLD) return null;

  return formatPrimarySourceLabel(top.source, top.sourcePlan);
}

/* -------------------------------------------------------------------------- */
/* D1-backed lookup                                                            */
/* -------------------------------------------------------------------------- */
/*
 * The helpers below fetch the (source, source_plan, cost) rows for a user over
 * the last 30 days from D1 and pass them through `computePrimarySource`.
 * Results are cached in KV for 5 minutes under `ps:<userId>` and busted by
 * `recordSession` whenever the user lands a new session.
 *
 * Decoupled from a `Hono.Context` so it stays unit-testable.
 */

/** Minimal D1 surface used by the primary-source helpers. */
interface PrimarySourceD1 {
  prepare(sql: string): {
    bind(...args: (string | number | null)[]): {
      all<T>(): Promise<{ results?: T[] }>;
    };
  };
}

/** Minimal KV surface — read/write/delete. */
interface PrimarySourceKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** KV TTL (seconds) for the per-user primary-source label. */
export const PRIMARY_SOURCE_KV_TTL = 300;

/**
 * Fetch the last-30d source-plan-cost rows for one user from D1 and compute
 * the kebab-case primary-source label. Results are not cached here — call
 * `getPrimarySourceForUser` if you want the KV-backed read path.
 */
export async function fetchPrimarySourceForUser(
  db: PrimarySourceD1,
  userId: string,
  nowMs: number = Date.now(),
): Promise<string | null> {
  // 30d window in UTC, inclusive of today.
  const todayUtc = new Date(nowMs).toISOString().slice(0, 10);
  const since = offsetDay(todayUtc, -29);
  const sinceMs = Date.parse(`${since}T00:00:00Z`);

  const result = await db
    .prepare(
      `SELECT
         source,
         source_plan AS source_plan,
         COALESCE(SUM(cost_usd_cents), 0) AS cost
       FROM sessions
       WHERE user_id = ?
         AND started_at >= ?
       GROUP BY source, source_plan
       ORDER BY cost DESC`,
    )
    .bind(userId, sinceMs)
    .all<{ source: string; source_plan: string | null; cost: number }>();

  const rows: PrimarySourceRow[] = (result.results ?? []).map((r) => ({
    source: r.source,
    sourcePlan: r.source_plan,
    cost: r.cost,
  }));

  return computePrimarySource(rows);
}

/**
 * Cached variant of `fetchPrimarySourceForUser`. Uses KV key `ps:<userId>`
 * with a 5-minute TTL. The ingest path deletes this key when the user lands
 * a new session, so the staleness window in practice is bounded by sync
 * frequency.
 *
 * The cached value is a JSON-encoded `{ label: string | null }` so we can
 * distinguish "miss" from "cached null".
 */
export async function getPrimarySourceForUser(
  db: PrimarySourceD1,
  kv: PrimarySourceKV,
  userId: string,
  nowMs: number = Date.now(),
): Promise<string | null> {
  const cacheKey = `ps:${userId}`;
  const cached = await kv.get(cacheKey);
  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached) as { label: string | null };
      return parsed.label ?? null;
    } catch {
      // Fall through and recompute on bad cache content.
    }
  }

  const label = await fetchPrimarySourceForUser(db, userId, nowMs);
  await kv.put(cacheKey, JSON.stringify({ label }), {
    expirationTtl: PRIMARY_SOURCE_KV_TTL,
  });
  return label;
}

/**
 * Batch variant — fetch primary-source labels for a set of users. Returns a
 * map of userId → label-or-null. Cache reads are issued in parallel; cache
 * misses fall back to per-user D1 queries (also in parallel).
 */
export async function getPrimarySourceMap(
  db: PrimarySourceD1,
  kv: PrimarySourceKV,
  userIds: string[],
  nowMs: number = Date.now(),
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (userIds.length === 0) return out;

  // De-dup the input — callers may pass repeated ids for repeated leaderboard rows.
  const uniqIds = Array.from(new Set(userIds));
  const labels = await Promise.all(uniqIds.map((id) => getPrimarySourceForUser(db, kv, id, nowMs)));
  for (let i = 0; i < uniqIds.length; i++) {
    out.set(uniqIds[i] as string, labels[i] ?? null);
  }
  return out;
}

/** Offset a YYYY-MM-DD string by `days` days (positive or negative). */
function offsetDay(yyyy_mm_dd: string, days: number): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
