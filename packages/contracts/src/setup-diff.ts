import { diffLines } from "diff";
import type { SetupBundle, SetupChange } from "./setups.js";

/** A bounded preview of changed lines. Callers must supply only readable snapshots. */
export function setupChange(
  current: SetupBundle,
  previous?: SetupBundle,
  previousVersion: number | null = null,
): SetupChange {
  const result: SetupChange = {
    previousVersion,
    additions: 0,
    deletions: 0,
    truncated: false,
    files: [],
  };
  const fields = [
    ...Array.from(
      new Set([...(previous?.files.map((f) => f.name) ?? []), ...current.files.map((f) => f.name)]),
    ).map((name) => ({
      name,
      before: previous?.files.find((f) => f.name === name)?.content ?? "",
      after: current.files.find((f) => f.name === name)?.content ?? "",
    })),
    ...(
      [
        ["workflow", "Workflow"],
        ["tools", "Tools"],
        ["models", "Models"],
        ["subscriptions", "Subscriptions"],
      ] as const
    ).map(([key, name]) => ({ name, before: previous?.[key] ?? "", after: current[key] })),
  ];
  let remaining = 16;
  for (const { name, before, after } of fields) {
    if (before === after) continue;
    const parts = diffLines(before, after, { timeout: 100 });
    if (!parts) {
      result.truncated = true;
      continue;
    }
    const all = parts.flatMap((part) =>
      part.value
        .replace(/\n$/, "")
        .split("\n")
        .map((text) => ({
          kind: (part.added ? "added" : part.removed ? "removed" : "context") as
            | "added"
            | "removed"
            | "context",
          text,
        })),
    );
    result.additions += all.filter((l) => l.kind === "added").length;
    result.deletions += all.filter((l) => l.kind === "removed").length;
    const lines: SetupChange["files"][number]["lines"] = [];
    let omitted = false;
    for (let i = 0; i < all.length; i++) {
      const line = all[i]!;
      // One unchanged line either side anchors small edits without hiding the change.
      const nearChange =
        line.kind !== "context" ||
        all[i - 1]?.kind === "added" ||
        all[i - 1]?.kind === "removed" ||
        all[i + 1]?.kind === "added" ||
        all[i + 1]?.kind === "removed";
      if (!nearChange) {
        omitted = true;
        continue;
      }
      if (!remaining) {
        result.truncated = true;
        break;
      }
      if (omitted && lines.length) lines.push({ kind: "gap", text: "…" });
      omitted = false;
      lines.push({ ...line, text: line.text.slice(0, 400) });
      if (line.text.length > 400) result.truncated = true;
      remaining--;
    }
    if (lines.length) result.files.push({ name, lines });
  }
  return result;
}
