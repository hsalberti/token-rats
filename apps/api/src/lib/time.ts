/**
 * Time constants used across the Worker.
 *
 * Prefer importing these over inlining `86_400_000` / `7 * 24 * 60 * 60 * 1000`
 * literals — easier to grep, harder to typo, and one place to flip if we ever
 * need a different bucketing granularity.
 */
export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS;
