/**
 * @file Direct tests for `tovu-server.js`.
 *
 * Self-contained on purpose: the repo's own `npm test` globs are `apps/website/src/**`,
 * `packages/*\/src/**`, `apps/site-chat/src/**` and `development/scripts/**`, so nothing here is
 * ever swept into a repo-wide run. `npm --prefix apps/desktop test` is the only thing that runs it,
 * which keeps `apps/desktop` as deletable as it was before.
 *
 * No real `tovu serve` is ever spawned. `startTovuServer` takes an injectable `spawnFn`, so the
 * supervision contract — ready, boot timeout, premature exit, error-line reporting — is driven
 * against a fake child that can be made to do each of those on demand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";

import { parseBootLine, parseCliErrorLine, resolveCliEntry, resolveDevCliEntry, buildCliSpawnPlan, buildServeEnv, allocatePort, startTovuServer } from "./tovu-server.js";

// The same CommonJS resolution `tovu-server.js` uses, from the same directory, so the expected
// loader path below is derived exactly the way the code under test derives it.
const require = createRequire(import.meta.url);

/** The exact line `apps/website/src/cli/commands/serve.ts` prints (api.spec.md §5). */
const REAL_BOOT_LINE = "tovu serve: dir=/Users/la/Programming/Tovu/sites/tovu-com port=3601 schemaVersion=42 workspaceId=wm2\n";

/** A `ChildProcess` stand-in with just the surface `startTovuServer` touches. */
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 424242;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = [];
  child.kill = (signal) => {
    child.killed.push(signal);
    return true;
  };
  return child;
}

/** Discards mirrored child output so a fake boot line never lands in the test report. */
function silentMirror() {
  return { stdout: new PassThrough(), stderr: new PassThrough() };
}

function makeTempRepo({ withCli = true, withAdminDist = true, withTsCli = false, withSiteChatDist = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-test-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ bin: { tovu: "dist/src/cli/main.js" } }));
  if (withCli) {
    fs.mkdirSync(path.join(root, "dist", "src", "cli"), { recursive: true });
    fs.writeFileSync(path.join(root, "dist", "src", "cli", "main.js"), "");
  }
  if (withTsCli) {
    fs.mkdirSync(path.join(root, "apps", "website", "src", "cli"), { recursive: true });
    fs.writeFileSync(path.join(root, "apps", "website", "src", "cli", "main.ts"), "");
  }
  if (withAdminDist) {
    fs.mkdirSync(path.join(root, "apps", "admin", "dist"), { recursive: true });
  }
  if (withSiteChatDist) {
    fs.mkdirSync(path.join(root, "apps", "site-chat", "dist"), { recursive: true });
  }
  return root;
}

test("parseBootLine reads dir, port, schemaVersion and workspaceId from serve.ts's startup line", () => {
  assert.deepEqual(parseBootLine(REAL_BOOT_LINE), {
    dir: "/Users/la/Programming/Tovu/sites/tovu-com",
    port: 3601,
    schemaVersion: 42,
    workspaceId: "wm2",
  });
});

test("parseBootLine tolerates a site dir containing spaces", () => {
  const line = "tovu serve: dir=/Users/la/My Sites/blog port=8080 schemaVersion=7 workspaceId=wm11\n";
  assert.equal(parseBootLine(line).dir, "/Users/la/My Sites/blog");
  assert.equal(parseBootLine(line).port, 8080);
});

test("parseBootLine returns null until the whole line has arrived", () => {
  assert.equal(parseBootLine("tovu serve: dir=/tmp/site port=36"), null);
  assert.equal(parseBootLine("booting…\n"), null);
});

test("parseCliErrorLine reads Tovu's single `tovu: <CODE>: <message>` stderr line", () => {
  assert.deepEqual(parseCliErrorLine("tovu: PORT_IN_USE: Port 3601 is already in use.\n"), {
    code: "PORT_IN_USE",
    message: "Port 3601 is already in use.",
  });
  assert.equal(parseCliErrorLine("some unrelated stderr noise\n"), null);
});

test("resolveCliEntry returns the path bin.tovu names", () => {
  const root = makeTempRepo();
  assert.equal(resolveCliEntry(root), path.join(root, "dist", "src", "cli", "main.js"));
});

test("resolveCliEntry fails with a build instruction when the CLI is not built", () => {
  const root = makeTempRepo({ withCli: false });
  assert.throws(() => resolveCliEntry(root), /Tovu's CLI is not built.*Run `npm run build` at the repo root first\./s);
});

test("resolveCliEntry fails loudly when the manifest has no bin.tovu", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-test-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "no-bin" }));
  assert.throws(() => resolveCliEntry(root), /has no "bin\.tovu" field/);
});

test("resolveDevCliEntry returns the CLI's own TypeScript source path", () => {
  const root = makeTempRepo({ withTsCli: true });
  assert.equal(resolveDevCliEntry(root), path.join(root, "apps", "website", "src", "cli", "main.ts"));
});

test("resolveDevCliEntry fails loudly when the TS source is missing", () => {
  const root = makeTempRepo({ withTsCli: false });
  assert.throws(() => resolveDevCliEntry(root), /Tovu's CLI source is missing/);
});

test("buildCliSpawnPlan defaults to compiled mode, unchanged from before source mode existed", () => {
  const root = makeTempRepo();
  const plan = buildCliSpawnPlan({ repoRoot: root, cliArgs: ["serve", "/tmp/site", "--port", "3601"] });
  assert.equal(plan.command, process.execPath);
  assert.deepEqual(plan.args, [path.join(root, "dist", "src", "cli", "main.js"), "serve", "/tmp/site", "--port", "3601"]);
});

test("buildCliSpawnPlan in source mode runs the TS entry under --import tsx, never npx", () => {
  const root = makeTempRepo({ withTsCli: true });
  const plan = buildCliSpawnPlan({ repoRoot: root, cliMode: "source", cliArgs: ["serve", "/tmp/site", "--port", "3601"] });
  assert.equal(plan.command, process.execPath);
  assert.deepEqual(plan.args, [
    "--import",
    require.resolve("tsx"),
    path.join(root, "apps", "website", "src", "cli", "main.ts"),
    "serve",
    "/tmp/site",
    "--port",
    "3601",
  ]);
});

test("buildServeEnv sets ELECTRON_RUN_AS_NODE so the Electron binary runs the CLI as Node", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), baseEnv: {} });
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
});

test("buildServeEnv mints a daemon token, because `tovu serve` never does and the gate is fail-closed", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), baseEnv: {} });
  assert.match(env.TOVU_AGENT_DAEMON_TOKEN, /^[0-9a-f]{64}$/);
});

test("buildServeEnv keeps an operator-set daemon token instead of replacing it", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), baseEnv: { TOVU_AGENT_DAEMON_TOKEN: "operator-token" } });
  assert.equal(env.TOVU_AGENT_DAEMON_TOKEN, "operator-token");
});

test("buildServeEnv drops inherited PORT, TOVU_DB and TOVU_CONTENT_DB", () => {
  const env = buildServeEnv({
    repoRoot: makeTempRepo(),
    baseEnv: { PORT: "3000", TOVU_DB: "memory", TOVU_CONTENT_DB: "/somewhere/else.db" },
  });
  assert.equal("PORT" in env, false);
  assert.equal("TOVU_DB" in env, false);
  assert.equal("TOVU_CONTENT_DB" in env, false);
});

test("buildServeEnv points TOVU_ADMIN_DIST at the built admin, working around app.ts's dist off-by-one", () => {
  const root = makeTempRepo();
  const env = buildServeEnv({ repoRoot: root, baseEnv: {} });
  assert.equal(env.TOVU_ADMIN_DIST, path.join(root, "apps", "admin", "dist"));
});

test("buildServeEnv leaves TOVU_ADMIN_DIST unset when the admin has never been built", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo({ withAdminDist: false }), baseEnv: {} });
  assert.equal(env.TOVU_ADMIN_DIST, undefined);
});

test("buildServeEnv keeps an operator-set TOVU_ADMIN_DIST", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), baseEnv: { TOVU_ADMIN_DIST: "/custom/admin" } });
  assert.equal(env.TOVU_ADMIN_DIST, "/custom/admin");
});

// `app.ts:1340` reads TOVU_SITE_CHAT_DIST and falls back to the SAME six-levels-up path that
// overshoots from `dist/` as the admin's `:1316` does, and `Dockerfile:170-171` sets both. This
// function set only the admin half until 2026-09-11, so `/site-chat` answered 503 in every
// compiled-mode run — a bug that existed independently of packaging.
test("buildServeEnv points TOVU_SITE_CHAT_DIST at the built site-chat bundle, the half that used to be missing", () => {
  const root = makeTempRepo();
  const env = buildServeEnv({ repoRoot: root, baseEnv: {} });
  assert.equal(env.TOVU_SITE_CHAT_DIST, path.join(root, "apps", "site-chat", "dist"));
});

test("buildServeEnv leaves TOVU_SITE_CHAT_DIST unset when site-chat has never been built", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo({ withSiteChatDist: false }), baseEnv: {} });
  assert.equal(env.TOVU_SITE_CHAT_DIST, undefined);
});

test("buildServeEnv keeps an operator-set TOVU_SITE_CHAT_DIST", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), baseEnv: { TOVU_SITE_CHAT_DIST: "/custom/site-chat" } });
  assert.equal(env.TOVU_SITE_CHAT_DIST, "/custom/site-chat");
});

test("buildServeEnv sets TOVU_SITE_DIR to the site being served — app.ts's own module-load-time createApp() falls back to a cwd-relative default otherwise, confirmed to crash when own-server mode's cwd has no sites/tovu-com", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), siteDir: "/Users/x/my-site", baseEnv: {} });
  assert.equal(env.TOVU_SITE_DIR, "/Users/x/my-site");
});

test("buildServeEnv keeps an operator-set TOVU_SITE_DIR instead of replacing it", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), siteDir: "/Users/x/my-site", baseEnv: { TOVU_SITE_DIR: "/operator/pinned" } });
  assert.equal(env.TOVU_SITE_DIR, "/operator/pinned");
});

// The three tests below are the regression for the 2026-09-12 live blocker: EVERY assistant turn in
// the packaged app died ~13ms after starting, with no reply and no error, because the agent daemon
// `tovu serve` spawns runs each turn in `process.env.TOVU_AGENT_CWD ?? process.cwd()`
// (`apps/website/src/server/inbound/assistant/agent-daemon-server.ts`) and nothing in this shell
// ever set that variable. A macOS app launched from Finder/dock has cwd `/`; `tovu serve` inherits
// it and the daemon inherits it from there, so the daemon's per-run `.mcp.json` write landed on the
// read-only root and the executor failed the run before spawn:
//
//   AgentExecutor: could not write .mcp.json for agent "claude":
//   EROFS: read-only file system, open '/.mcp.jini-<runId>.json'
//
// Measured, not inferred: the owner's live daemon reported cwd `/` (`lsof -a -p <pid> -d cwd`) and
// three consecutive runs ended `failed` with `code=null, signal=null`; the same packaged daemon
// binary launched from a writable cwd streamed a reply.
test("buildServeEnv pins TOVU_AGENT_CWD to the site being served, so the daemon never falls back to this app's own cwd", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), siteDir: "/Users/x/my-site", baseEnv: {} });
  assert.equal(env.TOVU_AGENT_CWD, "/Users/x/my-site");
});

// The load-bearing half. The assertion above passes for a wrong-but-plausible implementation that
// forwards `process.cwd()`, or one that leaves the variable unset on the belief that the child's own
// inherited cwd is good enough — which is the exact bug. This asserts what must NOT be true: the
// child's env must not hand the daemon a value that resolves to the LAUNCHER's directory, and must
// not leave it absent, because absent is what produced `/`.
test("buildServeEnv's TOVU_AGENT_CWD is the site dir and NOT this process's cwd — an unset or inherited value is the `/` bug", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), siteDir: "/Users/x/my-site", baseEnv: {} });
  assert.notEqual(env.TOVU_AGENT_CWD, undefined);
  assert.notEqual(env.TOVU_AGENT_CWD, "");
  assert.notEqual(env.TOVU_AGENT_CWD, process.cwd());
  assert.notEqual(env.TOVU_AGENT_CWD, "/");
});

test("buildServeEnv keeps an operator-set TOVU_AGENT_CWD instead of replacing it", () => {
  const env = buildServeEnv({ repoRoot: makeTempRepo(), siteDir: "/Users/x/my-site", baseEnv: { TOVU_AGENT_CWD: "/operator/pinned" } });
  assert.equal(env.TOVU_AGENT_CWD, "/operator/pinned");
});

test("allocatePort returns a port that is actually bindable", async () => {
  const port = await allocatePort();
  assert.ok(port > 0 && port < 65536);
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
});

test("startTovuServer resolves with the admin URL for the port the child reports", async () => {
  const child = fakeChild();
  const root = makeTempRepo();
  const started = startTovuServer({
    repoRoot: root,
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
  });
  child.stdout.write(REAL_BOOT_LINE);

  const handle = await started;
  assert.equal(handle.port, 3601);
  assert.equal(handle.origin, "http://127.0.0.1:3601");
  assert.equal(handle.adminUrl, "http://127.0.0.1:3601/admin/");
  assert.equal(handle.workspaceId, "wm2");
  assert.equal(handle.schemaVersion, 42);
});

test("startTovuServer passes the site dir and port through as `serve <dir> --port <n>`", async () => {
  const child = fakeChild();
  const root = makeTempRepo();
  let recorded;
  const started = startTovuServer({
    repoRoot: root,
    siteDir: "/tmp/my-site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: (command, args, options) => {
      recorded = { command, args, options };
      return child;
    },
  });
  child.stdout.write(REAL_BOOT_LINE);
  await started;

  assert.equal(recorded.command, process.execPath);
  assert.deepEqual(recorded.args, [
    path.join(root, "dist", "src", "cli", "main.js"),
    "serve",
    "/tmp/my-site",
    "--port",
    "3601",
  ]);
  // Own process group, so the SIGKILL escalation can reap the agent daemon `tovu serve` spawns.
  assert.equal(recorded.options.detached, true);
});

// The sink, not the primitive. `buildServeEnv` returning the right value proves nothing on its own:
// the defect class this repo keeps hitting is a correct helper whose call site never passes its
// result on. This asserts the variable is in the env the REAL spawn receives, through the one code
// path `main.js` actually uses.
test("startTovuServer hands the spawned `tovu serve` a TOVU_AGENT_CWD, so the daemon it starts runs agents in the site dir rather than `/`", async () => {
  const child = fakeChild();
  let recorded;
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/my-site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: (command, args, options) => {
      recorded = options;
      return child;
    },
  });
  child.stdout.write(REAL_BOOT_LINE);
  await started;

  assert.equal(recorded.env.TOVU_AGENT_CWD, "/tmp/my-site");
  // No `cwd` is passed to `spawn` — the fix is the explicit env var the server already reads, not a
  // change to the child's own working directory, which other code resolves the site from.
  assert.equal(recorded.cwd, undefined);
});

test("startTovuServer in source mode runs the TS entry under --import tsx instead of the compiled CLI", async () => {
  const child = fakeChild();
  const root = makeTempRepo({ withTsCli: true });
  let recorded;
  const started = startTovuServer({
    repoRoot: root,
    siteDir: "/tmp/my-site",
    port: 3601,
    baseEnv: {},
    cliMode: "source",
    mirror: silentMirror(),
    spawnFn: (command, args, options) => {
      recorded = { command, args, options };
      return child;
    },
  });
  child.stdout.write(REAL_BOOT_LINE);
  await started;

  assert.equal(recorded.command, process.execPath);
  assert.deepEqual(recorded.args, [
    "--import",
    require.resolve("tsx"),
    path.join(root, "apps", "website", "src", "cli", "main.ts"),
    "serve",
    "/tmp/my-site",
    "--port",
    "3601",
  ]);
});

test("startTovuServer reads the boot line off stderr too, not only stdout", async () => {
  const child = fakeChild();
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
  });
  child.stderr.write(REAL_BOOT_LINE);
  assert.equal((await started).port, 3601);
});

test("startTovuServer reports Tovu's own error code when the child dies before binding", async () => {
  const child = fakeChild();
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
  });
  child.stderr.write("tovu: PORT_IN_USE: Port 3601 is already in use.\n");
  child.exitCode = 4;
  child.emit("exit", 4, null);

  await assert.rejects(started, /tovu serve failed: PORT_IN_USE: Port 3601 is already in use\./);
});

test("startTovuServer reports the raw output tail when the child dies without an error line", async () => {
  const child = fakeChild();
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
  });
  child.stderr.write("Error: ERR_DLOPEN_FAILED\n");
  child.exitCode = 1;
  child.emit("exit", 1, null);

  await assert.rejects(started, /exited \(code 1\) before reporting a port\.\nError: ERR_DLOPEN_FAILED/);
});

test("startTovuServer times out and kills the child when no boot line ever arrives", async () => {
  const child = fakeChild();
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
    readyTimeoutMs: 20,
    stopGraceMs: 20,
  });
  // The stop path waits for a real exit; grant one so the rejection is not gated on SIGKILL.
  setTimeout(() => child.emit("exit", null, "SIGTERM"), 40);

  await assert.rejects(started, /did not report a port within 20ms/);
  assert.deepEqual(child.killed, ["SIGTERM"]);
});

test("the handle's stop() sends SIGTERM so serve.ts runs its own graceful drain", async () => {
  const child = fakeChild();
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
    stopGraceMs: 500,
  });
  child.stdout.write(REAL_BOOT_LINE);
  const handle = await started;

  const stopped = handle.stop();
  child.emit("exit", 0, null);
  await stopped;

  assert.deepEqual(child.killed, ["SIGTERM"]);
});

test("stop() is a no-op on a child that has already exited", async () => {
  const child = fakeChild();
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
  });
  child.stdout.write(REAL_BOOT_LINE);
  const handle = await started;

  child.exitCode = 0;
  await handle.stop();
  assert.deepEqual(child.killed, []);
});

test("startTovuServer's handle reports the child's exit AFTER boot, which is the signal D-06 had none of", async () => {
  // The only exit listener used to be the boot-failure one, a no-op once `settled` is true. Nothing
  // in the process observed a POST-ready exit, so `openSites` kept a dead handle forever and
  // "Start site" handed it straight back.
  const child = fakeChild();
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
  });
  child.stdout.write(REAL_BOOT_LINE);
  const handle = await started;

  const seen = [];
  handle.onExit((exit) => seen.push(exit));
  child.emit("exit", 1, null);

  assert.deepEqual(seen, [{ code: 1, signal: null }]);
});

test("startTovuServer's onExit replays an exit that already happened before the listener attached", async () => {
  // The registration window is real: the child can die between `startTovuServer` resolving and the
  // supervisor attaching. A listener that only ever waits for a future event would miss it and the
  // entry would be wedged "running" — exactly the state D-06 is about.
  const child = fakeChild();
  const started = startTovuServer({
    repoRoot: makeTempRepo(),
    siteDir: "/tmp/site",
    port: 3601,
    baseEnv: {},
    mirror: silentMirror(),
    spawnFn: () => child,
  });
  child.stdout.write(REAL_BOOT_LINE);
  const handle = await started;

  child.emit("exit", null, "SIGKILL");
  const seen = [];
  handle.onExit((exit) => seen.push(exit));

  assert.deepEqual(seen, [{ code: null, signal: "SIGKILL" }]);
});
