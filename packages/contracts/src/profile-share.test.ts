import { expect, it } from "vitest";
import { ProfileShareQuery, profileShareSearch } from "./profile-share.js";

it("round-trips a version and line selection through URL parameters", () => {
  const selection = { version: "a/version", file: 0, start: 2, end: 7 };
  const query = profileShareSearch(selection);
  expect(query).toBe("?version=a%2Fversion&file=0&start=2&end=7");
  expect(ProfileShareQuery.parse(Object.fromEntries(new URLSearchParams(query)))).toEqual(
    selection,
  );
  expect(profileShareSearch()).toBe("");
});

it.each([
  { start: 0 },
  { file: -1 },
  { file: 10 },
  { start: 1.5 },
  { start: 3, end: 2 },
  { end: "not a number" },
  { version: "" },
])("rejects invalid selections: %j", (selection) => {
  expect(ProfileShareQuery.safeParse(selection).success).toBe(false);
});
