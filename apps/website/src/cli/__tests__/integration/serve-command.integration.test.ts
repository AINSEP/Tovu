import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import Database from "better-sqlite3";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";
import { removeFixtureTree } from "../helpers/remove-fixture-tree.js";

const require = createRequire(import.meta.url);

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

/** See `export-command.integration.test.ts`'s identical constant for why this exists and why one
 * shared directory for the whole file is safe. */
const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-serve-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

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
 * cannot wedge this synchronous spawn — and with it the whole file — indefinitely. Defaults to
 * 30s rather than `undefined` (which `spawnSync` treats as "no timeout" — a hard, synchronous
 * `waitpid` on the whole test process that nothing else can preempt); the one call site that
 * genuinely needs more room for a real boot passes `60_000` explicitly.
 */
function runCliSync(args: string[], env: NodeJS.ProcessEnv = {}, timeoutMs = 30_000): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], { encoding: "utf8", env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env }, timeout: timeoutMs });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function spawnServe(args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "serve", ...args], { env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env }, cwd }) as ChildProcessWithoutNullStreams;
}

/**
 * Scales a boot deadline by how oversubscribed this machine actually is.
 *
 * The 20s base below is generous on an idle box -- `tovu serve` answers in ~2s. But these are the
 * only tests that spawn the REAL CLI as a real process, and on 2026-08-19 a 7-agent run drove this
 * 8-core machine to load average 60-99; both spawn-based tests then blew the flat 20s deadline and
 * reported as failures on a codebase that was not broken. The wrong fix is mocking the boot: the
 * `CR-R04/CR-R01` test below exists precisely BECAUSE every other test spawned from the repo root,
 * which "accidentally made the process.cwd()-relative bug invisible" -- mocking would re-hide that
 * whole class of bug.
 *
 * So: stay fast on a quiet machine (multiplier 1 -> unchanged 20s, a genuinely dead server still
 * fails in 20s, not minutes) and grow proportionally with real contention, capped so a wedged
 * server can never turn a fast failure into a multi-minute hang. `loadavg()[0]` is the 1-minute
 * average -- the responsive one; `availableParallelism()` is the core count the runner itself uses
 * to size its worker pool. Ratio <= 1 means "not oversubscribed", so no extra grace.
 */
function loadFactor(): number {
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  const ratio = os.loadavg()[0] / Math.max(cores, 1);
  return Math.min(Math.max(ratio, 1), 6); // never shorter than base, never more than 6x
}

/**
 * Per-attempt cap for the polling loops below (`waitForHttpReady`, and the daemon-readiness loop
 * later in this file): a server that accepts the TCP connection but never answers otherwise wedges
 * a single bare `fetch()` forever, which starves the loop's own `Date.now() < deadline` re-check.
 * Flat rather than `loadFactor()`-scaled — the outer deadline already accounts for machine load, so
 * this only needs to be short enough that the loop actually gets to retry on schedule.
 */
const FETCH_POLL_TIMEOUT_MS = 2000;

/**
 * Bounds a single, non-retried fetch (an assertion made after `waitForHttpReady` already proved
 * the server is up) the same way `FETCH_POLL_TIMEOUT_MS` bounds a polling attempt — scaled by
 * {@link loadFactor} like every other post-boot timing assumption in this file, so a busier machine
 * gets proportionally more room instead of a false failure.
 */
function fetchTimeoutSignal(baseMs = 10000): AbortSignal {
  return AbortSignal.timeout(baseMs * loadFactor());
}

async function waitForHttpReady(port: number, child: ChildProcessWithoutNullStreams, timeoutMs = 20000): Promise<void> {
  const factor = loadFactor();
  const deadline = Date.now() + timeoutMs * factor;
  let exited = false;
  let exitCode: number | null = null;
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`server process exited early (code ${exitCode}) before becoming ready`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(FETCH_POLL_TIMEOUT_MS) });
      void res.text();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  // Report the load the wait actually ran under: without it, a starved-machine timeout and a
  // genuinely-broken server produce byte-identical CI output, which cost real debugging time on
  // 2026-08-19 before anyone thought to check `uptime`.
  throw new Error(
    `timed out waiting for http://127.0.0.1:${port}/ to respond after ${Math.round((timeoutMs * factor) / 1000)}s ` +
      `(1-min load average ${os.loadavg()[0].toFixed(2)} across ${os.availableParallelism?.() ?? os.cpus().length} cores, ` +
      `deadline scaled ${factor.toFixed(2)}x)`
  );
}

/**
 * SIGTERM shutdown is scaled by the same {@link loadFactor} as boot: a graceful stop has to drain
 * in-flight work and close listeners, which is exactly as CPU-starvable as coming up. BR-07 asserts
 * a graceful exit code, so a starved-machine timeout here would misreport as "SIGTERM handling is
 * broken" -- the same false signal the boot wait produced on 2026-08-19.
 */
async function stopGracefully(child: ChildProcessWithoutNullStreams, timeoutMs = 10000): Promise<number | null> {
  const scaled = timeoutMs * loadFactor();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`server did not exit within ${Math.round(scaled / 1000)}s after SIGTERM (1-min load average ${os.loadavg()[0].toFixed(2)})`)),
      scaled
    );
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
    removeFixtureTree(parent);
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
    removeFixtureTree(parent);
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
    removeFixtureTree(parent);
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
    removeFixtureTree(parent);
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
    removeFixtureTree(parent);
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
    removeFixtureTree(parent);
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
    const res = await fetch(`http://127.0.0.1:${flagPort}/`, { signal: fetchTimeoutSignal() });
    assert.equal(res.status, 200, "the --port flag's value must be the one actually bound, not config.json.port");
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
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
    const res = await fetch(`http://127.0.0.1:${configPort}/`, { signal: fetchTimeoutSignal() });
    assert.equal(res.status, 200, "config.json.port must be honored when --port is absent");
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
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
    const res = await fetch(`http://127.0.0.1:${port}/welcome`, { signal: fetchTimeoutSignal() });
    assert.equal(res.status, 200, "EC-08: the DIR's real seeded site must be served — if TOVU_CONTENT_DB had been mistakenly used, its nonexistent/unseeded db would not have this seeded post");

    const exitCode = await stopGracefully(child);
    assert.equal(exitCode, 0, "BR-07: SIGTERM must result in a graceful stop, exit 0");
    assert.match(stderrBuf, /TOVU_CONTENT_DB/, "EC-08: a warning naming the ignored env var must be logged");
  } finally {
    if (!child.killed) child.kill("SIGKILL");
    removeFixtureTree(parent);
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
    const res = await fetch(`http://127.0.0.1:${port}/welcome`, { signal: fetchTimeoutSignal() });
    assert.equal(res.status, 200, "B1: serving must succeed and reach the original (oldest) workspace's seeded content, not crash");
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
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
    const res = await fetch(`http://127.0.0.1:${port}/welcome`, { signal: fetchTimeoutSignal() });
    assert.equal(res.status, 404, "--workspace ws-second must select the new, still-empty workspace, not the original seeded one");
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
  }
});

test("--workspace <id> naming no existing workspace is rejected as VALIDATION (exit 2)", () => {
  const { parent, dir } = initFixture();
  try {
    const result = runCliSync(["serve", dir, "--workspace", "does-not-exist"]);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /^tovu: VALIDATION:/m);
  } finally {
    removeFixtureTree(parent);
  }
});

test("CR-R04/CR-R01 (systemic gap): tovu serve spawned from a DIFFERENT cwd than the install dir still finds built-in themes and never leaks a themes/uploads dir into that foreign cwd — the whole suite otherwise always spawns from the repo root, which accidentally made the process.cwd()-relative bug invisible", async () => {
  const { parent, dir } = initFixture();
  const foreignCwd = mkTempParent();
  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port)], {}, foreignCwd);
  try {
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/welcome`, { signal: fetchTimeoutSignal() });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.doesNotMatch(body, /No themes installed/, "CR-R04: built-in themes must resolve package-relative, not against the foreign cwd tovu was launched from");
    assert.ok(!fs.existsSync(path.join(foreignCwd, "themes")), "no themes/ dir should ever be created in the launching cwd");
    assert.ok(!fs.existsSync(path.join(foreignCwd, "uploads")), "CR-R01: uploads must resolve against the install dir, not leak an uploads/ dir into the launching cwd");
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
    fs.rmSync(foreignCwd, { recursive: true, force: true });
  }
});

test("AC-08 (CLI-specific slice): a real HTTP request against a spawned tovu serve process reaches the seeded content end to end", async () => {
  const { parent, dir } = initFixture();
  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port)]);
  try {
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/welcome`, { signal: fetchTimeoutSignal() });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /Welcome to Tovu|welcome/i);
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
  }
});

/**
 * A minimal fake OTLP/HTTP collector: records every POST body it receives and answers 200. Real
 * OTLP collectors expect a protobuf-encoded `ExportTraceServiceRequest`; this deliberately does not
 * decode one — `platform/observability/__tests__/unit/otel.unit.test.ts` already proves the
 * adapter's span shape in isolation. What THIS test needs is proof a real span byte stream left a
 * REAL spawned `tovu serve` process and reached the network — the one thing no in-process test can
 * show, since `createApp()`'s own instrumentation is already proven at the composition-root tier
 * (`server/__tests__/integration/observability-wiring.integration.test.ts`).
 */
async function startFakeOtlpCollector(): Promise<{ url: string; receivedCount: () => number; close: () => Promise<void> }> {
  let receivedCount = 0;
  const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (Buffer.concat(chunks).length > 0) receivedCount += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  const port = await getFreePort();
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${port}`,
    receivedCount: () => receivedCount,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("2026-08-28 dispatch: an identity re-seed failure (a real UNIQUE constraint violation, reproduced by deleting the owner user row but leaving its built-in roles behind — the same shape as an interrupted first-boot seed) must not crash the whole serve process via an unhandled rejection on the un-awaited ownerPrincipalId fork", async () => {
  const { parent, dir } = initFixture();
  const dbPath = path.join(dir, "content.db");

  // First boot seeds identity fully (owner user + the 4 built-in roles/policies) and shuts down
  // cleanly — this is the ONE code path allowed to seed identity, so a real boot is required before
  // the corruption step below can mean anything.
  const firstBootPort = await getFreePort();
  const firstBoot = spawnServe([dir, "--port", String(firstBootPort)]);
  try {
    await waitForHttpReady(firstBootPort, firstBoot);
  } finally {
    if (firstBoot.exitCode === null && !firstBoot.killed) {
      await stopGracefully(firstBoot);
    }
  }

  // Corrupts the identity state the same way a first-boot seed interrupted partway through would:
  // the built-in "owner" role row survives (already committed), but the owner user row that would
  // normally short-circuit `seedIdentity()`'s idempotency check is gone. On the next boot,
  // `seedIdentity()` sees no owner user, tries to seed a FRESH "owner" role for the same workspace,
  // and collides with the surviving row on `idx_roles_workspace_name` — verified directly against
  // this exact fixture shape: `better-sqlite3` raises `SqliteError: UNIQUE constraint failed:
  // roles.workspace_id, roles.name`.
  const db = new Database(dbPath);
  db.prepare("DELETE FROM identity_users WHERE username = ?").run("admin");
  db.close();

  const secondBootPort = await getFreePort();
  const secondBoot = spawnServe([dir, "--port", String(secondBootPort)]);
  let stderrBuf = "";
  secondBoot.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });
  let exited = false;
  let exitCode: number | null = null;
  secondBoot.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });

  try {
    // `identityReady` (awaited via `Promise.all` in `serve.ts`) rejects and is caught there — that
    // half of this bug was already fixed. The un-awaited `ownerPrincipalId` fork off the SAME
    // rejected `seedResult` (`features/identity/wiring.ts`) is a SEPARATE promise with no handler of
    // its own anywhere: verified live, pre-fix, that this alone crashes the whole process with an
    // uncaught `SqliteError` roughly 3-4s after boot on this machine (measured directly, several
    // runs) — 8s comfortably clears that, scaled by `loadFactor()` like every other timing assertion
    // in this file so a busier box gets proportionally more room too.
    await new Promise((resolve) => setTimeout(resolve, 8000 * loadFactor()));

    assert.equal(
      exited,
      false,
      `the process must survive an unhandled rejection on the ownerPrincipalId fork, not crash (exit code was ${String(exitCode)}); stderr:\n${stderrBuf}`
    );
  } finally {
    if (!exited) await stopGracefully(secondBoot);
    removeFixtureTree(parent);
  }
});

test("Constitution Article VIII proof: a request against a REALLY SPAWNED `tovu serve` process — not the in-memory or SQLite composition-root tier, the actual packaged CLI boot path this whole groundwork report was worried an instrumentation plan could silently miss — exports a real span to the operator-configured OTLP collector", async () => {
  const { parent, dir } = initFixture();
  const port = await getFreePort();
  const collector = await startFakeOtlpCollector();
  const child = spawnServe([dir, "--port", String(port)], {
    OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
    OTEL_SERVICE_NAME: "tovu-serve-cli-test",
    // Forces the batch span processor to flush every 200ms instead of the 5s default, so this test
    // does not need to wait out a real production-sized batching window.
    OTEL_BSP_SCHEDULE_DELAY: "200",
  });
  try {
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/welcome`, { signal: fetchTimeoutSignal() });
    assert.equal(res.status, 200);

    const factor = loadFactor();
    const deadline = Date.now() + 10_000 * factor;
    while (collector.receivedCount() === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assert.ok(
      collector.receivedCount() > 0,
      `the spawned tovu serve process must export at least one span to the OTLP collector configured via OTEL_EXPORTER_OTLP_ENDPOINT within ${Math.round((10_000 * factor) / 1000)}s`
    );
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    await collector.close();
    removeFixtureTree(parent);
  }
});

test("2026-09-05 dispatch: tovu serve mints TOVU_AGENT_DAEMON_TOKEN before spawning the agent daemon — `src/index.ts`'s `main()` calls `ensureAgentDaemonToken()` as its first statement (see `daemon-auth.ts`), but `serve.ts` never did, so every `tovu serve`-booted daemon answered fail-closed 503 to its own proxy. An unauthenticated request straight against the daemon's own port must get 401 (a real token is configured), never 503 (AGENT_DAEMON_UNCONFIGURED)", async () => {
  const { parent, dir } = initFixture();
  const port = await getFreePort();
  const daemonPort = await getFreePort();
  // Deliberately does NOT set TOVU_AGENT_DAEMON_TOKEN in the child's env — proving `serve.ts`
  // itself mints one, rather than merely forwarding an operator-supplied value.
  const child = spawnServe([dir, "--port", String(port)], { JINI_AGENT_DAEMON_PORT: String(daemonPort) });
  try {
    await waitForHttpReady(port, child);

    // The daemon child spawns asynchronously, only after `identityReady`/`settingsReady`/etc.
    // settle (see `serve.ts`'s own `app.listen()` callback) — poll until it actually answers
    // rather than assuming it is up the instant the main app is.
    const factor = loadFactor();
    const deadline = Date.now() + 20_000 * factor;
    let res: Response | undefined;
    while (Date.now() < deadline) {
      try {
        res = await fetch(`http://127.0.0.1:${daemonPort}/api/runs`, { signal: AbortSignal.timeout(FETCH_POLL_TIMEOUT_MS) });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    if (!res) {
      throw new Error(`timed out waiting for the agent daemon to answer on 127.0.0.1:${daemonPort}`);
    }

    assert.notEqual(res.status, 503, "503 (AGENT_DAEMON_UNCONFIGURED) means TOVU_AGENT_DAEMON_TOKEN was never minted — serve.ts skipped ensureAgentDaemonToken()");
    assert.equal(res.status, 401, "an unauthenticated request against a CONFIGURED daemon must be 401 UNAUTHENTICATED, not any other status");
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "UNAUTHENTICATED");
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
  }
});
