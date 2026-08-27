import { describe, expect, it } from "vitest";
import { agentInstructionsPreview, parseGithubProjects } from "./profile-social.js";

describe("profile social helpers", () => {
  it("limits public agent instructions to the first ten lines", () => {
    const instructions = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
    expect(agentInstructionsPreview(instructions)).toBe(
      Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n"),
    );
  });

  it("caps a preview with unusually long lines", () => {
    expect(agentInstructionsPreview("x".repeat(5_000))).toHaveLength(4_000);
  });

  it("preserves valid ordered GitHub projects", () => {
    const projects = [
      {
        name: "hello-world",
        fullName: "octocat/hello-world",
        url: "https://github.com/octocat/hello-world",
        description: "My first repository",
      },
    ];
    expect(parseGithubProjects(JSON.stringify(projects))).toEqual(projects);
  });

  it("fails closed for malformed stored JSON", () => {
    expect(parseGithubProjects("not-json")).toEqual([]);
    expect(parseGithubProjects(JSON.stringify([{ name: "missing-fields" }]))).toEqual([]);
  });
});
