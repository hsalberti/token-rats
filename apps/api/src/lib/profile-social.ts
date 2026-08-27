import type { GithubProject } from "@token-rats/contracts";
import { GithubProject as GithubProjectSchema } from "@token-rats/contracts";

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
