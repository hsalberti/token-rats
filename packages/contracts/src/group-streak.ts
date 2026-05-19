import { z } from "zod";

/**
 * v1.2 Track Y — room-level streak.
 *
 * - `active` = consecutive UTC days where ≥1 room member has a `daily_rollup` row.
 * - `unanimous` = consecutive UTC days where every *currently* room-member has a row.
 *   Members joining mid-streak don't retroactively break unanimous — only days
 *   from the latest join onward count.
 */
export const GroupStreak = z.object({
  activeStreakDays: z.number().int().nonnegative(),
  longestStreakDays: z.number().int().nonnegative(),
  unanimousActiveStreakDays: z.number().int().nonnegative(),
  unanimousLongestStreakDays: z.number().int().nonnegative(),
});
export type GroupStreak = z.infer<typeof GroupStreak>;

export const GroupStreakResponse = z.object({ streak: GroupStreak });
export type GroupStreakResponse = z.infer<typeof GroupStreakResponse>;
