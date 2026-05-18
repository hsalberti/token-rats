import { z } from "zod";

export const User = z.object({
  id: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
});
export type User = z.infer<typeof User>;

export const Profile = User.extend({
  totals: z.object({
    today: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
    week: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
    allTime: z.object({ tokens: z.number().int(), costUsdCents: z.number().int() }),
  }),
});
export type Profile = z.infer<typeof Profile>;
