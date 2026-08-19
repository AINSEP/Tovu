import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

/**
 * @file SPEC-003 C-002 (`CLI_SERVE`) — TDD certification, integration (process-spawn) tier.
 *
 * Traces: REQ-04, REQ-05, REQ-06, REQ-07, BR-02, BR-04, BR-05, BR-06, BR-07, AC-05, AC-06, AC-08,
 * AC-09, AC-11, EC-04, EC-08, api.spec.md §5/§6, errors.spec.md.
 *
 * `src/cli/main.ts`/`src/cli/commands/serve.ts` do not exist yet, and `commander` is not yet a
 * dependency — every spawn below is expected to fail until Programmer implements `src/cli/*`
 * (tasks.md T020) and adds the `commander` dependency (tasks.md T019). Correct TDD state.
 *
 * Readiness is detected by POLLING THE HTTP PORT (not by pattern-matching the boot-line's exact
 * wording), per this project's guardrail to prefer behavior-level assertions over implementation
 * internals — api.spec.md §5 only requires that ONE line include dir/port/schemaVersion/workspace
 * id, not any exact phrasing.
 *
 * AC-08's full "edit content via the admin API, restart, edits persist" round trip is exercised
 * once already, at the `site-dir` layer, by `boot-site-dir.integration.test.ts` (direct
 * `bootSiteDir` round trip) — re-driving SPEC-001/SPEC-002's unchanged, already-tested admin CRUD
 * routes through a spawned CLI process here would duplicate coverage without adding signal. This
 * file's own AC-08 slice instead proves the CLI-specific wiring: a real HTTP request against the
 * spawned `tovu serve` process actually reaches the seeded content.
 *
 * REQ-07/AC-11's port precedence "PORT env, then 3000" default tier is deliberately NOT exercised
 * via a live bind to the literal port 3000 in this suite, to avoid a false failure/flake if a real
 * dev server (or another test run) already holds that port on the CI/dev machine. The `--port`-
 * flag and `config.json.port` tiers below prove the PRECEDENCE MECHANISM directly with fully
 * controlled ephemeral ports; the "…else 3000" final fallback is the one untested tier — a
 * disclosed, low-risk gap (see certification record).
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");

/**
 * Resolved to an absolute path (not the bare specifier "tsx") so every spawn below still finds
 * the loader when a test spawns the CLI with a `cwd` outside this repo — `node --import tsx`
 * resolves a bare specifier relative to the CHILD's cwd, which fails (`ERR_MODULE_NOT_FOUND`)
 * once cwd has no `node_modules/tsx` above it. This only matters for this dev/test-mode
 * invocation; the real distributed `tovu` binary is plain compiled JS with no loader at all.
 */
const TSX_LOADER = require.resolve("tsx");

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-serve-"));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not determine a free port")));
      }
    });
    srv.on("error", reject);
  });
}

/**
 * `timeoutMs` is a safety net, not an expectation: every caller below drives the CLI down a path
 * that terminates on its own. It exists so that a regression which leaves `tovu serve` running
 * cannot wedge this synchronous spawn — and with it the whole file — indefinitely.
 */
function runCliSync(args: string[], env: NodeJS.ProcessEnv = {}, timeoutMs?: number): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], { encoding: "utf8", env: { ...process.env, ...env }, timeout: timeoutMs });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function spawnServe(args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "serve", ...args], { env: { ...process.env, ...env }, cwd }) as ChildProcessWithoutNullStreams;
}

async function waitForHttpReady(port: number, child: ChildProcessWithoutNullStreams, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  let exitCode: number | null = null;
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`server process exited early (code ${exitCode}) before becoming ready`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      void res.text();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error(`timed out waiting for http://127.0.0.1:${port}/ to respond`);
}

async function stopGracefully(child: ChildProcessWithoutNullStreams, timeoutMs = 10000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not exit within timeout after SIGTERM")), timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.kill("SIGTERM");
  });
}

function initFixture(name = "Serve Fixture"): { parent: string; dir: string } {
  const parent = mkTempParent();
  const dir = path.join(parent, "site");
  const initResult = runCliSync(["init", dir, "--name", name]);
  assert.equal(initResult.status, 0, `fixture setup: tovu init must succeed (stderr: ${initResult.stderr})`);
  return { parent, dir };
}

test("behavior.spec.md §4: --port outside 1..65535, or non-integer, is rejected as VALIDATION (exit 2) rather than falling through to a default — boundary-value coverage of the documented range", () => {
  const { parent, dir } = initFixture();
  try {
    for (const badPort of ["0", "-1", "65536", "999999", "not-a-number", "3.14"]) {
      const result = runCliSync(["serve", dir, "--port", badPort]);
      assert.equal(result.status, 2, `--port ${badPort} must be rejected as VALIDATION (got status ${result.status}, stderr: ${result.stderr})`);
      assert.match(result.stderr, /^tovu: VALIDATION:/m, `--port ${badPort}`);
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("behavior.spec.md §4: --port at the exact boundary values 1 and 65535 is ACCEPTED (not a validation error) — proves the range check is inclusive, not off-by-one", async () => {
  const { parent, dir } = initFixture();
  try {
    for (const boundaryPort of [1, 65535]) {
      // Hold the boundary port from THIS process first, so the assertion never depends on booting
      // a real, long-running server (a successful bind on port 1 does not terminate on its own,
      // and squatting a system port poisons later runs). Holding it makes the child fail fast with
      // PORT_IN_USE — which is itself the stronger proof, since reaching a bind at all means the
      // value already cleared the 1..65535 range check. Where the OS refuses this process the port
      // (port 1 is privileged on most POSIX hosts), it refuses the child's identical bind just as
      // fast, so the child still terminates and the weaker not-VALIDATION assertion still holds.
      const blocker = net.createServer();
      const held = await new Promise<boolean>((resolve) => {
        blocker.once("error", () => resolve(false));
        blocker.listen(boundaryPort, () => resolve(true));
      });
      try {
        const result = runCliSync(["serve", dir, "--port", String(boundaryPort)], {}, 60_000);
        assert.notEqual(result.status, 2, `--port ${boundaryPort} is IN the valid 1..65535 range and must not be rejected as VALIDATION (stderr: ${result.stderr})`);
        assert.doesNotMatch(result.stderr, /^tovu: VALIDATION:/m, `--port ${boundaryPort} must not produce a VALIDATION line`);
        if (held) {
          assert.equal(result.status, 1, `--port ${boundaryPort}: with the port already held, the child must get past the range check all the way to the bind and report PORT_IN_USE (stderr: ${result.stderr})`);
          assert.match(result.stderr, /^tovu: PORT_IN_USE:/m, `--port ${boundaryPort}`);
        }
      } finally {
        if (held) await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("AC-05: serve against a dir missing .site-meta.json (crashed init) exits 3 with SITE_DIR_INVALID", () => {
  const parent = mkTempParent();
  const dir = path.join(parent, "crashed-init");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "X", domain: null, port: null }));
  try {
    const result = runCliSync(["serve", dir]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /^tovu: SITE_DIR_INVALID:/m);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("AC-06: serve against a site with a newer schemaVersion than the runtime exits 4 with SITE_NEWER_THAN_RUNTIME", () => {
  const { parent, dir } = initFixture();
  try {
    const metaPath = path.join(dir, ".site-meta.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    meta.schemaVersion = meta.schemaVersion + 1000;
    meta.schemaTag = "a-future-tag-not-yet-bundled";
    fs.writeFileSync(metaPath, JSON.stringify(meta));

    const result = runCliSync(["serve", dir]);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /^tovu: SITE_NEWER_THAN_RUNTIME:/m);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("AC-09: serve against a site whose content.db has zero workspace rows exits 5 with SITE_CORRUPT", () => {
  const { parent, dir } = initFixture();
  try {
    const dbPath = path.join(dir, "content.db");
    const db = new Database(dbPath);
    db.exec("DELETE FROM workspaces");
    db.close();

    const result = runCliSync(["serve", dir]);
    assert.equal(result.status, 5);
    assert.match(result.stderr, /^tovu: SITE_CORRUPT:/m);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("EC-04: serve exits 1 with PORT_IN_USE when the resolved port is already bound", async () => {
  const { parent, dir } = initFixture();
  const port = await getFreePort();
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(port, resolve));
  try {
    const result = runCliSync(["serve", dir, "--port", String(port)]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^tovu: PORT_IN_USE:/m);
    assert.match(result.stderr, new RegExp(String(port)));
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("BR-02/AC-11: --port flag takes precedence over config.json.port", async () => {
  const { parent, dir } = initFixture();
  const configPath = path.join(dir, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const configPort = await getFreePort();
  config.port = configPort;
  fs.writeFileSync(configPath, JSON.stringify(config));

  const flagPort = await getFreePort();
  const child = spawnServe([dir, "--port", String(flagPort)]);
  try {
    await waitForHttpReady(flagPort, child);
    const res = await fetch(`http://127.0.0.1:${flagPort}/`);
    assert.equal(res.status, 200, "the --port flag's value must be the one actually bound, not config.json.port");
  } finally {
    await stopGracefully(child);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("BR-02/AC-11: config.json.port is used when no --port flag is given", async () => {
  const { parent, dir } = initFixture();
  const configPath = path.join(dir, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const configPort = await getFreePort();
  config.port = configPort;
  fs.writeFileSync(configPath, JSON.stringify(config));

  const child = spawnServe([dir]);
  try {
    await waitForHttpReady(configPort, child);
    const res = await fetch(`http://127.0.0.1:${configPort}/`);
    assert.equal(res.status, 200, "config.json.port must be honored when --port is absent");
  } finally {
    await stopGracefully(child);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("BR-07: SIGTERM triggers a graceful stop (exit 0), and BR-04/EC-08: an explicit dir argument overrides TOVU_CONTENT_DB with a logged warning, serving the DIR's real content rather than the (nonexistent) env-var path", async () => {
  const { parent, dir } = initFixture("Dir Wins");
  const ignoredEnvDbPath = path.join(parent, "should-be-ignored", "content.db"); // deliberately does not exist
  const port = await getFreePort();

  const child = spawnServe([dir, "--port", String(port)], { TOVU_CONTENT_DB: ignoredEnvDbPath });
  let stderrBuf = "";
  child.stderr.on("data", (chunk) => {
    stderrBuf += chunk.toString();
  });
  try {
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/welcome`);
    assert.equal(res.status, 200, "EC-08: the DIR's real seeded site must be served — if TOVU_CONTENT_DB had been mistakenly used, its nonexistent/unseeded db would not have this seeded post");

    const exitCode = await stopGracefully(child);
    assert.equal(exitCode, 0, "BR-07: SIGTERM must result in a graceful stop, exit 0");
    assert.match(stderrBuf, /TOVU_CONTENT_DB/, "EC-08: a warning naming the ignored env var must be logged");
  } finally {
    if (!child.killed) child.kill("SIGKILL");
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("B1: serve against a site whose content.db has 2 workspace rows succeeds (boots + responds), defaulting to the oldest — no more boot-bricking on a legitimately multi-workspace install", async () => {
  const { parent, dir } = initFixture();
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(
    "ws-added-later",
    "Added Later",
    "added-later",
    "2099-01-01T00:00:00.000Z"
  );
  db.close();

  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port)]);
  try {
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/welcome`);
    assert.equal(res.status, 200, "B1: serving must succeed and reach the original (oldest) workspace's seeded content, not crash");
  } finally {
    await stopGracefully(child);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("B1: --workspace <id> selects a non-default workspace explicitly", async () => {
  const { parent, dir } = initFixture();
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(
    "ws-second",
    "Second",
    "second",
    "2099-01-01T00:00:00.000Z"
  );
  db.close();

  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port), "--workspace", "ws-second"]);
  try {
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/welcome`);
    assert.equal(res.status, 404, "--workspace ws-second must select the new, still-empty workspace, not the original seeded one");
  } finally {
    await stopGracefully(child);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("--workspace <id> naming no existing workspace is rejected as VALIDATION (exit 2)", () => {
  const { parent, dir } = initFixture();
  try {
    const result = runCliSync(["serve", dir, "--workspace", "does-not-exist"]);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /^tovu: VALIDATION:/m);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("CR-R04/CR-R01 (systemic gap): tovu serve spawned from a DIFFERENT cwd than the install dir still finds built-in themes and never leaks a themes/uploads dir into that foreign cwd — the whole suite otherwise always spawns from the repo root, which accidentally made the process.cwd()-relative bug invisible", async () => {
  const { parent, dir } = initFixture();
  const foreignCwd = mkTempParent();
  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port)], {}, foreignCwd);
  try {
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/welcome`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.doesNotMatch(body, /No themes installed/, "CR-R04: built-in themes must resolve package-relative, not against the foreign cwd tovu was launched from");
    assert.ok(!fs.existsSync(path.join(foreignCwd, "themes")), "no themes/ dir should ever be created in the launching cwd");
    assert.ok(!fs.existsSync(path.join(foreignCwd, "uploads")), "CR-R01: uploads must resolve against the install dir, not leak an uploads/ dir into the launching cwd");
  } finally {
    await stopGracefully(child);
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(foreignCwd, { recursive: true, force: true });
  }
});

test("AC-08 (CLI-specific slice): a real HTTP request against a spawned tovu serve process reaches the seeded content end to end", async () => {
  const { parent, dir } = initFixture();
  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port)]);
  try {
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/welcome`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /Welcome to Tovu|welcome/i);
  } finally {
    await stopGracefully(child);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
