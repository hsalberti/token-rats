/**
 * Unit tests for isAdmin.
 *
 * These exercise the helper directly with a tiny D1 mock — no Hono context.
 */
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import { isAdmin } from "./admin.js";

function makeEnv(handle: string | null, adminLogin: string | undefined): Env {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(() => Promise.resolve(handle === null ? null : { handle })),
  };
  const db = { prepare: vi.fn(() => stmt) } as unknown as D1Database;
  return { DB: db, ADMIN_GITHUB_LOGIN: adminLogin } as unknown as Env;
}

describe("isAdmin", () => {
  it("returns false when ADMIN_GITHUB_LOGIN is unset", async () => {
    expect(await isAdmin(makeEnv("owner", undefined), "u1")).toBe(false);
  });

  it("returns false when ADMIN_GITHUB_LOGIN is empty string", async () => {
    expect(await isAdmin(makeEnv("owner", ""), "u1")).toBe(false);
  });

  it("returns false when the user is not found in the DB", async () => {
    expect(await isAdmin(makeEnv(null, "owner"), "u1")).toBe(false);
  });

  it("returns true when the user's handle equals ADMIN_GITHUB_LOGIN", async () => {
    expect(await isAdmin(makeEnv("owner", "owner"), "u1")).toBe(true);
  });

  it("is case-insensitive in both directions", async () => {
    expect(await isAdmin(makeEnv("OWNER", "owner"), "u1")).toBe(true);
    expect(await isAdmin(makeEnv("owner", "OWNER"), "u1")).toBe(true);
    expect(await isAdmin(makeEnv("Owner", "oWnEr"), "u1")).toBe(true);
  });

  it("trims whitespace around ADMIN_GITHUB_LOGIN", async () => {
    expect(await isAdmin(makeEnv("owner", "  owner  "), "u1")).toBe(true);
  });

  it("allows every login in a comma-separated ADMIN_GITHUB_LOGIN allowlist", async () => {
    expect(await isAdmin(makeEnv("owner", "owner, LuizPiccini"), "u1")).toBe(true);
    expect(await isAdmin(makeEnv("luizpiccini", "owner, LuizPiccini"), "u1")).toBe(true);
  });

  it("ignores blank entries in ADMIN_GITHUB_LOGIN", async () => {
    expect(await isAdmin(makeEnv("owner", " , owner, "), "u1")).toBe(true);
  });

  it("returns false when handles differ", async () => {
    expect(await isAdmin(makeEnv("bystander", "owner"), "u1")).toBe(false);
  });
});
