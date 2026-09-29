#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function validate(input) {
  const b = input.bundle;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 100)
    throw new Error("Provide a setup name under 100 characters.");
  if (!b || !Array.isArray(b.files) || !b.files.length || b.files.length > 10)
    throw new Error("Include 1–10 text files.");
  const names = new Set();
  let total = 0;
  for (const f of b.files) {
    if (
      typeof f.name !== "string" ||
      !/^[\w. -]{1,100}$/.test(f.name) ||
      names.has(f.name) ||
      typeof f.content !== "string" ||
      f.content.length > 20000
    )
      throw new Error("Files need unique plain names and up to 20,000 characters each.");
    names.add(f.name);
    total += f.content.length;
  }
  if (total > 100000) throw new Error("The file bundle exceeds 100,000 characters.");
  for (const [field, limit] of Object.entries({
    workflow: 5000,
    tools: 2000,
    models: 2000,
    subscriptions: 2000,
  })) {
    b[field] ??= "";
    if (typeof b[field] !== "string" || b[field].length > limit)
      throw new Error(`Invalid ${field}.`);
  }
  input.note ??= "";
  input.verdict ??= "experiment";
  if (
    typeof input.note !== "string" ||
    input.note.length > 2000 ||
    !["experiment", "using", "retired"].includes(input.verdict)
  )
    throw new Error("Invalid note or verdict.");
  return {
    name: input.name.trim(),
    bundle: {
      files: b.files.map((f) => ({ name: f.name, content: f.content })),
      workflow: b.workflow,
      tools: b.tools,
      models: b.models,
      subscriptions: b.subscriptions,
    },
    note: input.note,
    verdict: input.verdict,
  };
}
async function defaultToken() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  try {
    return (await readFile(join(base, "token-rats", "token"), "utf8")).trim();
  } catch {
    throw new Error("Sign in with npx token-rats@latest login --no-daemon, then retry.");
  }
}
export async function saveSetup(
  args,
  { fetchImpl = fetch, read = readFile, loadToken = defaultToken } = {},
) {
  const file = args[0];
  if (!file || file.startsWith("--"))
    throw new Error(
      "Usage: node save-setup.mjs bundle.json [--dry-run] [--publish | --friends] [--setup ID]",
    );
  const flags = args.slice(1);
  const index = flags.indexOf("--setup");
  const setupId = index >= 0 ? flags[index + 1] : undefined;
  if (index >= 0 && (!setupId || setupId.startsWith("--")))
    throw new Error("--setup requires an ID.");
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === "--setup") {
      i++;
      continue;
    }
    if (!["--dry-run", "--publish", "--friends"].includes(flags[i]))
      throw new Error(`Unknown option: ${flags[i]}`);
  }
  const input = validate(JSON.parse(await read(file, "utf8")));
  if (flags.includes("--publish") && flags.includes("--friends"))
    throw new Error("Choose one audience: --publish or --friends.");
  const visibility = flags.includes("--publish")
    ? "public"
    : flags.includes("--friends")
      ? "friends"
      : "private";
  if (flags.includes("--dry-run"))
    return {
      dryRun: true,
      name: input.name,
      files: input.bundle.files.map((f) => f.name),
      publication: visibility,
    };
  const token = await loadToken();
  if (!token) throw new Error("No session. Run npx token-rats@latest login --no-daemon.");
  async function api(path, method = "GET", body = undefined) {
    let res;
    try {
      res = await fetchImpl(`https://api.tokenrats.com/v1/setups${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(
        "Request interrupted. Check https://tokenrats.com/app/setups before retrying.",
      );
    }
    if (res.status === 401)
      throw new Error("Session expired. Run npx token-rats@latest login --no-daemon.");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error || `Request failed (${res.status}). Check My setups before retrying.`,
      );
    }
    return res.json();
  }
  const mine = await api("/mine");
  const matches = mine.versions.filter((v) =>
    setupId ? v.setupId === setupId : v.name === input.name,
  );
  if (matches.length > 1) throw new Error("More than one setup has this name. Use --setup ID.");
  if (setupId && !matches.length) throw new Error("Setup not found in your account.");
  const existing = matches[0];
  if (existing?.automatic)
    throw new Error(
      "This setup is tracked automatically. Edit the local file or choose a new setup name.",
    );
  if (
    existing &&
    (visibility !== "private" || existing.visibility === "private") &&
    existing.name === input.name &&
    JSON.stringify(existing.bundle) === JSON.stringify(input.bundle) &&
    existing.note === input.note &&
    existing.verdict === input.verdict
  ) {
    if (visibility !== existing.visibility)
      await api(`/versions/${existing.id}/visibility`, "PUT", { visibility });
    return {
      url: `https://tokenrats.com/setups/${existing.setupId}?v=${existing.id}`,
      publication: visibility,
      unchanged: true,
    };
  }
  const saved = await api(existing ? `/${existing.setupId}/versions` : "", "POST", {
    ...input,
    visibility,
    baseVersionId: existing?.id ?? null,
  });
  return {
    url: `https://tokenrats.com/setups/${saved.id}?v=${saved.versionId}`,
    publication: visibility,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await saveSetup(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
