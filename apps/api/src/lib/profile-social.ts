import type { GithubProject, ProfileFavorite } from "@token-rats/contracts";
import { GithubProject as GithubProjectSchema, ProfileFavorites } from "@token-rats/contracts";

export function parseProfileFavorites(value: string | null): ProfileFavorite[] {
  if (!value) return [];
  try {
    const result = ProfileFavorites.safeParse(JSON.parse(value));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function parseGithubProjects(value: string | null): GithubProject[] {
  if (!value) return [];

  try {
    const result = GithubProjectSchema.array().max(3).safeParse(JSON.parse(value));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function agentInstructionsPreview(value: string | null): string | null {
  if (!value) return null;
  return value.split(/\r?\n/).slice(0, 10).join("\n").slice(0, 4_000);
}
