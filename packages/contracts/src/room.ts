import { z } from "zod";

/** Public, shareable room identifier. Slug-shaped, ~6–10 chars. */
export const RoomCode = z
  .string()
  .min(4)
  .max(16)
  .regex(/^[a-z0-9-]+$/);
export type RoomCode = z.infer<typeof RoomCode>;

export const Room = z.object({
  id: z.string(),
  code: RoomCode,
  name: z.string().min(1).max(64),
  ownerId: z.string(),
  orgId: z.string().nullable(),
  createdAt: z.number().int().positive(),
});
export type Room = z.infer<typeof Room>;

export const RoomMember = z.object({
  userId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().url().nullable(),
  joinedAt: z.number().int().positive(),
  /** OAuth-verified X handle, when present. Manual handles are not surfaced. */
  twitterHandle: z.string().max(50).nullable().optional(),
});
export type RoomMember = z.infer<typeof RoomMember>;
