import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { createProgram } from "../../program.js";

/**
 * @file Every `tovu` subcommand's action forwards its parsed arguments to its command module. Each
 * case parses real argv through `createProgram()` and stops at the command's own first refusal (or
 * its stdout result), so the wiring is proven without booting a server or touching a real site.
 */

const root = mkdtempSync(path.join(tmpdir(), "tovu-program-actions-"));
after(() => rmSync(root, { recursive: true, force: true }));
const missing = path.join(root, "missing");

async function parse(argv: string[]): Promise<void> {
  await createProgram().parseAsync(argv, { from: "user" });
}

/** Captures stdout and returns the one chunk the command wrote that starts with `prefix`. */
async function captureStdout(t: import("node:test").TestContext, run: () => Promise<void>, prefix = "{"): Promise<string> {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(String(chunk)); return true; });
  try { await run(); } finally { t.mock.restoreAll(); }
  const matches = written.filter((chunk) => chunk.startsWith(prefix));
  assert.equal(matches.length, 1, `exactly one stdout chunk starts with ${prefix}`);
  return matches[0]!;
}

test("import forwards --server/--workspace and refuses a non-origin before reading stdin", async () => {
  await assert.rejects(parse(["import", "--server", "not a url", "--workspace", "ws"]), { name: "ValidationError", message: "import: --server must be an admin server origin." });
});

test("init forwards --storage to the storage parser", async () => {
  await assert.rejects(parse(["init", path.join(root, "new-site"), "--storage", "floppy"]), { name: "ValidationError" });
});

test("storage move forwards --to and refuses a non-postgres target", async () => {
  await assert.rejects(parse(["storage", "move", missing, "--to", "sqlite"]), { name: "ValidationError", message: /--to must be postgres/ });
});

test("plugin integrity forwards the package folder", async () => {
  await assert.rejects(parse(["plugin", "integrity", missing]));
});

test("plugin install forwards --site and opens that site first", async () => {
  await assert.rejects(parse(["plugin", "install", missing, "--site", missing, "--yes"]));
});

test("adopt forwards the folder and refuses one that does not exist", async () => {
  await assert.rejects(parse(["adopt", missing, "--dry-run"]));
});

test("export forwards the folder and refuses a missing site", async () => {
  await assert.rejects(parse(["export", missing, "--out", path.join(root, "out")]));
});

test("sites move-home forwards the folder and refuses one outside the former default home", async () => {
  await assert.rejects(parse(["sites", "move-home", missing]));
});

test("site rename rejects path traversal before touching the sites home", async () => {
  await assert.rejects(parse(["site", "rename", "../outside", "new-site"]), { name: "LocalSiteError", message: "VALIDATION_ERROR" });
});

test("site rename requires both folder names", async () => {
  await assert.rejects(parse(["site", "rename", "old-site"]), { code: "commander.missingArgument" });
});

test("sites move-home also accepts --projects-path and still refuses a folder outside the former default home", async () => {
  await assert.rejects(parse(["sites", "move-home", missing, "--projects-path", path.join(root, "projects.json")]));
});

test("theme validate forwards --profile", async () => {
  await assert.rejects(parse(["theme", "validate", missing, "--profile", "strict"]), { name: "ValidationError", message: /--profile must be one of/ });
});

test("theme normalize-build forwards --primary-stylesheet", async () => {
  await assert.rejects(parse(["theme", "normalize-build", missing]), { name: "ValidationError", message: /--primary-stylesheet is required/ });
});

test("theme migrate forwards the folder to the migrator, which refuses one with no theme.json", async () => {
  await assert.rejects(parse(["theme", "migrate", missing, "--json", "--dry-run"]), { code: "ENOENT" });
});

test("theme generate-index forwards the folder and --json, skipping a folder that is not a theme", async (t) => {
  const exitCode = process.exitCode;
  t.after(() => { process.exitCode = exitCode; });
  const out = await captureStdout(t, () => parse(["theme", "generate-index", missing, "--json"]), "{\n");
  assert.equal((JSON.parse(out) as { status: string }).status, "skipped");
  assert.equal(process.exitCode, 1);
});

test("theme sync-originals forwards --json", async (t) => {
  const out = await captureStdout(t, () => parse(["theme", "sync-originals", root, "--json"]), "{\n");
  assert.deepEqual(JSON.parse(out), { themes: [] });
});

test("deploy config forwards --target", async () => {
  await assert.rejects(parse(["deploy", "config", "--target", "heroku"]), { name: "ValidationError", message: /\(got "heroku"\)$/ });
});

test("agent-plugins token-sign-in prints the sign-in list", async (t) => {
  const out = await captureStdout(t, () => parse(["agent-plugins", "token-sign-in", "--json"]), '{"plugins"');
  assert.ok(Array.isArray((JSON.parse(out) as { plugins: unknown }).plugins));
});

test("introspect forwards --format over the live command tree", async (t) => {
  const out = await captureStdout(t, () => parse(["introspect", "--format", "commander"]), "{\n");
  const manifest = JSON.parse(out) as { commands: Array<{ name: string }> };
  assert.ok(manifest.commands.some((command) => command.name === "init"), "the live tree's init command is described");
});

test("commander's own error output is suppressed; an unknown option surfaces only as a thrown CommanderError", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stderr, "write", (chunk: string) => { written.push(String(chunk)); return true; });
  try {
    await assert.rejects(parse(["introspect", "--no-such-flag"]), { code: "commander.unknownOption" });
  } finally { t.mock.restoreAll(); }
  assert.deepEqual(written.filter((chunk) => chunk.includes("no-such-flag")), []);
});
