import { z } from "zod";

/** Select text by published version and line numbers, never by arbitrary quote text. */
export const ProfileShareQuery = z
  .object({
    version: z.string().min(1).max(100).optional(),
    file: z.coerce.number().int().min(0).max(9).optional(),
    start: z.coerce.number().int().min(1).max(20_001).optional(),
    end: z.coerce.number().int().min(1).max(20_001).optional(),
  })
  .refine((value) => value.end === undefined || value.end >= (value.start ?? 1), {
    message: "The last line must come after the first line.",
  });
export type ProfileShareQuery = z.infer<typeof ProfileShareQuery>;

export interface ProfileShare {
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  period: { start: number; end: number };
  tokens: number;
  topModel: string | null;
  topProvider: string | null;
  instructions: {
    setupId: string;
    versionId: string;
    file: number;
    fileName: string;
    start: number;
    end: number;
    text: string;
  } | null;
}

export function profileShareSearch(selection: ProfileShareQuery = {}): string {
  const params = new URLSearchParams();
  for (const key of ["version", "file", "start", "end"] as const) {
    if (selection[key] !== undefined) params.set(key, String(selection[key]));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
