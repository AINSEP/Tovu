/**
 * @file "+ Create website"'s optional "Connect services" tokens (2026-09-29), end to end through
 * this shell: the renderer's map is cleaned, handed to `tovu init` on stdin (never argv/env), a
 * folder that already holds a site is refused, and `tovu init`'s `agent-plugin-tokens:` line comes
 * back on the created record. The service list comes from `tovu agent-plugins token-sign-in`.
 * No real CLI: every spawn is a fake child.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import {
  assertTokensCanReachFolder,
  cleanCreateTokens,
  initTokenOptions,
  listTokenSignInPlugins,
  parseCreatedTokensLine,
  withCreatedTokens,
} from "./agent-plugin-tokens.ts";
import { initSiteDir } from "./site-dir-store.ts";
import { handleCreate, handleTokenSignInPlugins } from "./project-ipc.ts";
import { sitesFilePath } from "./tracked-sites.ts";

const TOKEN = "sbp_desktop_test_token_never_in_argv";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-agent-plugin-tokens-"));
}

/** A repo root just complete enough for `resolveCliEntry` to succeed (as `site-dir-store.test.ts`). */
function fakeRepoRoot(): string {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ bin: { tovu: "dist/src/cli/main.js" } }));
  fs.mkdirSync(path.join(root, "dist", "src", "cli"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "src", "cli", "main.js"), "");
  return root;
}

interface FakeChild extends EventEmitter {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
}

/** A child that prints `stdout`/`stderr`, then exits with `code` once both have been read. */
function fakeChild(code: number, output: { stdout?: string; stderr?: string } = {}): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  setImmediate(() => {
    if (output.stdout) child.stdout.write(output.stdout);
    if (output.stderr) child.stderr.write(output.stderr);
    setImmediate(() => child.emit("exit", code, null));
  });
  return child;
}

function writeSite(dir: string, siteId: string): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: path.basename(dir) }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, schemaVersion: 58 }));
  return dir;
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const dir = tempDir();
  return {
    projectsPath: sitesFilePath(dir),
    repoRoot: "/repo",
    statePath: path.join(dir, "desktop-state.json"),
    cliMode: "source" as const,
    openSites: new Map(),
    readSiteName: (siteDir: string) => path.basename(siteDir),
    readPreviewVersion: () => null,
    classifySiteDir: () => "empty",
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [path.join(dir, "new-site")] }) },
    adoptSiteDir: async () => path.join(dir, "new-site"),
    ...overrides,
  } as unknown as Parameters<typeof handleCreate>[1];
}

test("cleanCreateTokens trims, drops blanks, and refuses anything but a small map of plugin ids to strings", () => {
  assert.deepEqual(cleanCreateTokens(undefined), {});
  assert.deepEqual(cleanCreateTokens({ supabase: `  ${TOKEN}  `, other: "   " }), { supabase: TOKEN });
  for (const bad of ["x", ["x"], { "Bad Id": "x" }, { supabase: 1 }, { supabase: "x".repeat(4097) }, Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${i}`, "x"]))]) {
    assert.throws(() => cleanCreateTokens(bad), (err: unknown) => err instanceof Error && /not in the expected shape\. Nothing was created\./.test(err.message) && !err.message.includes(TOKEN));
  }
});

test("parseCreatedTokensLine reads tovu init's line, and nothing when there is none", () => {
  assert.deepEqual(parseCreatedTokensLine("created site 'a' at /a\nagent-plugin-tokens: saved supabase,crm\n"), { status: "saved", pluginIds: ["supabase", "crm"] });
  assert.deepEqual(parseCreatedTokensLine("agent-plugin-tokens: failed supabase\n"), { status: "failed", pluginIds: ["supabase"] });
  assert.equal(parseCreatedTokensLine("created site 'a' at /a\n"), null);
  assert.deepEqual(withCreatedTokens({ id: "a" }, ""), { id: "a" });
});

test("assertTokensCanReachFolder refuses tokens for a folder that already holds a site, and nothing else", () => {
  assert.throws(() => assertTokensCanReachFolder({ supabase: TOKEN }, false), /already holds a website/);
  assertTokensCanReachFolder({ supabase: TOKEN }, true);
  assertTokensCanReachFolder({}, false);
  assert.deepEqual(initTokenOptions({}, { output: "" }), {}, "no tokens = exactly the old init options");
});

test("initSiteDir hands tokens to tovu init on stdin with the flag, never on argv or in env", async () => {
  let args: string[] = [];
  let env: NodeJS.ProcessEnv = {};
  let stdio: unknown;
  let stdinText = "";
  let reported = "";
  await initSiteDir({
    repoRoot: fakeRepoRoot(),
    dir: "/new/site",
    baseEnv: { TOVU_ADMIN_PASSWORD: "inherited-test-password", TOVU_ADMIN_USER: "inherited-test-user" },
    agentPluginTokens: { supabase: TOKEN },
    onInitOutput: (output) => (reported = output),
    spawnFn: (_command, spawnArgs, options) => {
      args = spawnArgs;
      env = options.env ?? {};
      stdio = options.stdio;
      const child = fakeChild(0, { stdout: "created site 'site' at /new/site\nagent-plugin-tokens: saved supabase\n" });
      child.stdin.on("data", (chunk) => (stdinText += String(chunk)));
      return child;
    },
  });
  assert.deepEqual(args.slice(1), ["init", "/new/site", "--admin-password", "tovu-dev", "--agent-plugin-tokens-stdin"]);
  assert.deepEqual(stdio, ["pipe", "pipe", "pipe"]);
  assert.deepEqual(JSON.parse(stdinText), { supabase: TOKEN });
  assert.ok(!args.join(" ").includes(TOKEN), "a token must never be on argv");
  assert.ok(!JSON.stringify(env).includes(TOKEN), "a token must never be in env");
  assert.equal(env.TOVU_ADMIN_PASSWORD, undefined);
  assert.equal(env.TOVU_ADMIN_USER, undefined);
  assert.match(reported, /agent-plugin-tokens: saved supabase/);
});

test("initSiteDir without tokens selects the default create password: no token flag, stdin ignored", async () => {
  let args: string[] = [];
  let stdio: unknown;
  await initSiteDir({
    repoRoot: fakeRepoRoot(),
    dir: "/new/site",
    baseEnv: {},
    agentPluginTokens: {},
    spawnFn: (_command, spawnArgs, options) => {
      args = spawnArgs;
      stdio = options.stdio;
      return fakeChild(0);
    },
  });
  assert.deepEqual(args.slice(1), ["init", "/new/site", "--admin-password", "tovu-dev"]);
  assert.deepEqual(stdio, ["ignore", "pipe", "pipe"]);
});

test("handleCreate passes the tokens to adoptSiteDir and returns tovu init's outcome on the record", async () => {
  const dir = tempDir();
  const siteDir = writeSite(path.join(dir, "made"), "site-made");
  let adoptInput: Record<string, unknown> = {};
  const deps = createDeps({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [siteDir] }) },
    adoptSiteDir: async (input: Record<string, unknown> & { onInitOutput?: (output: string) => void }) => {
      adoptInput = input;
      input.onInitOutput?.("agent-plugin-tokens: saved supabase\n");
      return siteDir;
    },
  });
  const record = await handleCreate({ displayName: "Made", agentPluginTokens: { supabase: ` ${TOKEN} ` } }, deps);
  assert.ok(record);
  assert.deepEqual(adoptInput.agentPluginTokens, { supabase: TOKEN });
  assert.deepEqual((record as { agentPluginTokens?: unknown }).agentPluginTokens, { status: "saved", pluginIds: ["supabase"] });
  assert.ok(!JSON.stringify(record).includes(TOKEN), "the returned record never carries a token");
});

test("handleCreate with no token is unchanged: no token options reach adoptSiteDir, no outcome on the record", async () => {
  const dir = tempDir();
  const siteDir = writeSite(path.join(dir, "plain"), "site-plain");
  let adoptInput: Record<string, unknown> = {};
  const deps = createDeps({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [siteDir] }) },
    adoptSiteDir: async (input: Record<string, unknown>) => ((adoptInput = input), siteDir),
  });
  const record = await handleCreate({ displayName: "Plain", agentPluginTokens: { supabase: "" } }, deps);
  assert.ok(record);
  assert.equal("agentPluginTokens" in adoptInput, false);
  assert.equal("onInitOutput" in adoptInput, false);
  assert.equal("agentPluginTokens" in record, false);
});

test("handleCreate refuses tokens for a folder that already holds a site, before adopting it", async () => {
  let adopted = false;
  const deps = createDeps({
    classifySiteDir: () => "site",
    adoptSiteDir: async () => {
      adopted = true;
      return "/x";
    },
  });
  await assert.rejects(handleCreate({ displayName: "Existing", agentPluginTokens: { supabase: TOKEN } }, deps), /already holds a website/);
  assert.equal(adopted, false);
});

test("handleCreate refuses a malformed token map before the folder picker opens", async () => {
  let pickerOpened = false;
  const deps = createDeps({
    dialog: {
      showOpenDialog: async () => {
        pickerOpened = true;
        return { canceled: true, filePaths: [] };
      },
    },
  });
  await assert.rejects(handleCreate({ displayName: "Bad", agentPluginTokens: ["x"] }, deps), /not in the expected shape/);
  assert.equal(pickerOpened, false);
});

test("listTokenSignInPlugins runs the CLI's list command and keeps only well-formed https entries", async () => {
  let args: string[] = [];
  const plugins = await listTokenSignInPlugins({
    repoRoot: fakeRepoRoot(),
    baseEnv: {},
    spawnFn: (_command, spawnArgs) => {
      args = spawnArgs;
      return fakeChild(0, {
        stdout: `${JSON.stringify({
          plugins: [
            { pluginId: "supabase", displayName: "Supabase", helpUrl: "https://supabase.com/dashboard/account/tokens" },
            { pluginId: "evil", displayName: "Evil", helpUrl: "javascript:alert(1)" },
            { pluginId: "Bad Id", displayName: "x", helpUrl: "https://x" },
          ],
        })}\n`,
      });
    },
  });
  assert.deepEqual(args.slice(1), ["agent-plugins", "token-sign-in", "--json"]);
  assert.deepEqual(plugins, [{ pluginId: "supabase", displayName: "Supabase", helpUrl: "https://supabase.com/dashboard/account/tokens" }]);
});

test("a failing list is an empty list at the IPC boundary, never an error", async () => {
  await assert.rejects(
    listTokenSignInPlugins({ repoRoot: fakeRepoRoot(), baseEnv: {}, spawnFn: () => fakeChild(1, { stderr: "tovu: INTERNAL: boom\n" }) }),
    /token-sign-in failed: INTERNAL: boom/,
  );
  const listed = await handleTokenSignInPlugins({
    repoRoot: "/repo",
    cliMode: "source",
    listTokenSignInPlugins: async () => {
      throw new Error("cli missing");
    },
  });
  assert.deepEqual(listed, []);
});
