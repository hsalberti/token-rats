import { z } from "zod";

/** Public, shareable room identifier. Slug-shaped, ~6–10 chars. */
export const RoomCode = z
  .string()
  .min(4)
  .max(16)
  .regex(/^[a-z0-9-]+$/);
export type RoomCode = z.infer<typeof RoomCode>;

/** v1.2 Track AE — ISO 3166-1 alpha-2 country code (e.g. `BR`, `US`). */
export const CountryCode = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/);
export type CountryCode = z.infer<typeof CountryCode>;

export const Room = z.object({
  id: z.string(),
  code: RoomCode,
  name: z.string().min(1).max(64),
  ownerId: z.string(),
  orgId: z.string().nullable(),
  createdAt: z.number().int().positive(),
  /** v1.2 Track AE — discoverable in `/groups` if true. */
  isPublic: z.boolean().optional(),
  /** v1.2 Track AE — required when isPublic = true. */
  country: CountryCode.nullable().optional(),
});
export type Room = z.infer<typeof Room>;

export const RoomMember = z.object({
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  joinedAt: z.number().int().positive(),
});
export type RoomMember = z.infer<typeof RoomMember>;
