import { expect, it } from "vitest";
import { setupChange } from "./setup-diff.js";
import { SetupBundle } from "./setups.js";
const bundle = (content: string) => SetupBundle.parse({ files: [{ name: "AGENTS.md", content }] });
it("shows a single addition or removal with only neighboring context", () => {
  const previous = bundle("One\nTwo\nThree\nFour\nFive\n");
  const next = bundle("One\nTwo\nReview the diff.\nThree\nFour\nFive\n");
  const added = setupChange(next, previous, 1);
  expect(added).toMatchObject({ previousVersion: 1, additions: 1, deletions: 0, truncated: false });
  expect(added.files[0]?.lines).toEqual([
    { kind: "context", text: "Two" },
    { kind: "added", text: "Review the diff." },
    { kind: "context", text: "Three" },
  ]);
  expect(setupChange(previous, next, 2)).toMatchObject({ additions: 0, deletions: 1 });
});
it("counts all changed lines while bounding large previews and includes file removal and tool changes", () => {
  const previous = { ...bundle("Old instructions\n"), tools: "Old tool" };
  const current = {
    ...bundle(Array.from({ length: 50 }, (_, i) => `Instruction ${i}`).join("\n")),
    tools: "New tool",
  };
  expect(setupChange(current, previous)).toMatchObject({
    additions: 51,
    deletions: 2,
    truncated: true,
  });
  expect(
    setupChange(current, previous)
      .files.flatMap((f) => f.lines)
      .filter((l) => l.kind !== "gap"),
  ).toHaveLength(16);
  expect(
    setupChange({ ...previous, files: [{ name: "NEW.md", content: "New" }] }, previous).files,
  ).toMatchObject([
    { name: "AGENTS.md", lines: [{ kind: "removed" }] },
    { name: "NEW.md", lines: [{ kind: "added" }] },
  ]);
  expect(setupChange(current, current)).toMatchObject({ files: [], additions: 0, deletions: 0 });
});
