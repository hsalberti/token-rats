import { z } from "zod";

/** v1.2 Track Y — generalized heatmap scope: per-user or per-room. */
export const HeatmapScope = z.enum(["user", "room"]);
export type HeatmapScope = z.infer<typeof HeatmapScope>;

/** Heatmap window length in days. Default is 60; 364 is the legacy 52w toggle. */
export const HeatmapRangeDays = z.union([z.literal(60), z.literal(364)]);
export type HeatmapRangeDays = z.infer<typeof HeatmapRangeDays>;

/**
 * Quartile-based intensity bin computed server-side over the scope's non-zero
 * days. 0 = empty day; 1–4 = quartiles of the active distribution.
 */
export const HeatmapLevel = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type HeatmapLevel = z.infer<typeof HeatmapLevel>;

export const HeatmapCell = z.object({
  /** UTC day, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  level: HeatmapLevel,
});
export type HeatmapCell = z.infer<typeof HeatmapCell>;

export const HeatmapResponse = z.object({
  scope: HeatmapScope,
  /** User handle when scope='user', room code when scope='room'. */
  id: z.string(),
  /** Inclusive start date YYYY-MM-DD UTC. */
  from: z.string(),
  /** Inclusive end date YYYY-MM-DD UTC. */
  to: z.string(),
  rangeDays: HeatmapRangeDays,
  cells: z.array(HeatmapCell),
});
export type HeatmapResponse = z.infer<typeof HeatmapResponse>;
