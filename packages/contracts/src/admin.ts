/**
 * Admin analytics contracts — read-only launch dashboard.
 *
 * Endpoints are gated server-side to the project owner (matched by GitHub
 * login against the ADMIN_GITHUB_LOGIN Worker env var). The web client is
 * also gated, but the API gate is the source of truth.
 */
import { z } from "zod";

/* ----------------------- GET /v1/admin/signups --------------------------- */
/**
 * Cumulative signups per UTC day for the last 30 days, plus the all-time
 * total. The series always includes 30 entries — days with no new signups
 * carry the previous day's cumulative count.
 */
export const AdminSignupsDay = z.object({
  day: z.string(), // YYYY-MM-DD UTC
  /** Newly created users on this day. */
  newUsers: z.number().int().nonnegative(),
  /** Running total of users created up to and including this day. */
  cumulative: z.number().int().nonnegative(),
});
export type AdminSignupsDay = z.infer<typeof AdminSignupsDay>;

export const AdminSignupsResponse = z.object({
  totalUsers: z.number().int().nonnegative(),
  /** Length = 30, ordered oldest -> newest. */
  series: z.array(AdminSignupsDay),
  generatedAt: z.number().int().positive(),
});
export type AdminSignupsResponse = z.infer<typeof AdminSignupsResponse>;

/* ----------------------- GET /v1/admin/activity -------------------------- */
/**
 * Distinct active users per UTC day for the last 30 days.
 *
 * "Active" is defined as: has a `daily_rollup` row for that day **on or
 * after** the user's signup day. The signup-day clamp matters because the
 * CLI uploads the user's local log history on first sync — those
 * pre-signup sessions are real local work, but they don't represent
 * platform engagement, so they're filtered out of admin activity.
 *
 * This is the strongest platform-activity signal available — login events
 * are not persisted (auth only mints cookies), and webapp views are not
 * logged.
 */
export const AdminActivityDay = z.object({
  day: z.string(), // YYYY-MM-DD UTC
  activeUsers: z.number().int().nonnegative(),
});
export type AdminActivityDay = z.infer<typeof AdminActivityDay>;

export const AdminActivityResponse = z.object({
  /** Length = 30, ordered oldest -> newest. */
  series: z.array(AdminActivityDay),
  /** Distinct users active in the full 30-day window. */
  activeUsers30d: z.number().int().nonnegative(),
  generatedAt: z.number().int().positive(),
});
export type AdminActivityResponse = z.infer<typeof AdminActivityResponse>;

/* ----------------------- GET /v1/admin/referrers ------------------------- */
/**
 * Referral attribution is not tracked yet — there is no `referrer` column on
 * `users` and no signup-attribution table. The endpoint returns
 * `tracked = false` and a best-effort fallback: the breakdown of new users
 * per CLI source (claude-code vs cursor) over the last 30 days, derived
 * from whichever source they first synced from. This is a proxy for
 * "where the user came from" until proper attribution lands.
 */
export const AdminReferrerRow = z.object({
  /** A label describing the source of the signal. */
  label: z.string(),
  /** Number of users (or events) attributed to this label. */
  count: z.number().int().nonnegative(),
});
export type AdminReferrerRow = z.infer<typeof AdminReferrerRow>;

export const AdminReferrersResponse = z.object({
  /** True iff a real referral attribution column / table exists. */
  tracked: z.boolean(),
  /** Description of what `rows` represents (e.g. "First CLI source"). */
  signal: z.string(),
  rows: z.array(AdminReferrerRow),
  generatedAt: z.number().int().positive(),
});
export type AdminReferrersResponse = z.infer<typeof AdminReferrersResponse>;
