import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { parseProfileFavorites } from "./profile-social.js";

it("migrates selected software and custom logos into valid categorized favorites", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE users (id TEXT, agent_software TEXT)");
    db.prepare("INSERT INTO users VALUES (?, ?)").run(
      "owner",
      JSON.stringify([
        { id: "paseo" },
        { id: "codex" },
        { id: "proprietary" },
        { id: "other", name: "My app", logoUrl: "https://example.com/logo.svg" },
      ]),
    );
    db.prepare("INSERT INTO users VALUES (?, ?)").run("empty", "[]");
    db.exec(
      readFileSync(
        new URL("../../../../infra/migrations/0030_profile_favorites.sql", import.meta.url),
        "utf8",
      ),
    );
    const row = db.prepare("SELECT profile_favorites FROM users WHERE id = ?").get("owner") as {
      profile_favorites: string;
    };
    expect(parseProfileFavorites(row.profile_favorites)).toEqual([
      { id: "software:paseo", category: "software" },
      { id: "software:codex-app", category: "software" },
      { id: "software:proprietary", category: "software" },
      {
        id: "custom:software",
        category: "software",
        name: "My app",
        logoUrl: "https://example.com/logo.svg",
      },
    ]);
    expect(db.prepare("SELECT profile_favorites FROM users WHERE id = 'empty'").get()).toEqual({
      profile_favorites: "[]",
    });
  } finally {
    db.close();
  }
});
