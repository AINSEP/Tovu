import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { resolveSiteDatabasePaths } from "../../../platform/site-dir/site-databases.js";
import assert from "node:assert/strict";
import { spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import Database from "better-sqlite3";

import { childProcessCoverageEnv } from "#src/contracts/core/__tests__/helpers/child-process-coverage-env";
import { removeFixtureTree } from "../helpers/remove-fixture-tree.js";

const require = createRequire(import.meta.url);

/**
 * @file 2026-09-05 dispatch (boot-path parity) — proves `tovu serve` actually WIRES `runBootLifecycle`
 * (`buildBootModules`) into its own boot path, mirroring `serve-command-plugin-sdk-resolver.integration.test.ts`'s
 * own "prove the wiring, not just that the function exists" approach for the identical class of gap.
 *
 * Two claims, two tests:
 * 1. A healthy `tovu serve` boot actually RUNS `database-migration-reconciliation`/`settings`/`seo`
 *    (previously never invoked for this boot path at all — `serve.ts` had zero references to
 *    `boot-lifecycle`/`bootstrap`/`production-readiness-gate` before this dispatch) — verified via the
 *    admin `system/module-status` route, which reads the exact `BootResult` `setReadinessSnapshot()`
 *    now receives from this boot path.
 * 2. A critical module's real rejection actually REFUSES to serve — no `app.listen()`, no bound port,
 *    a non-zero exit — rather than logging and continuing (the pre-fix behavior: the only readiness
 *    await lived inside the `"listening"` callback, AFTER the port was already bound). Forced via a
 *    real, un-mocked fault: the fixture's own `setting_definitions` table is dropped out-of-band
 *    (raw sqlite, before `tovu serve` ever runs) so `seedSettingsFromPresentation()` hits a genuine
 *    "no such table" SQLite error — not a fabricated mock, the same class of real corruption
 *    `settings`/`seo`'s CRITICAL classification exists to catch.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");
const TSX_LOADER = require.resolve("tsx");

const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-serve-boot-lifecycle-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-serve-boot-lifecycle-"));
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

/** Same scaling rationale as `serve-command-plugin-sdk-resolver.integration.test.ts`'s own
 *  `loadFactor` — this repo's own guardrail against flat timeouts misreporting load contention as
 *  a real failure. */
function loadFactor(): number {
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  const ratio = os.loadavg()[0] / Math.max(cores, 1);
  return Math.min(Math.max(ratio, 1), 6);
}

/** Same rationale as `serve-command.integration.test.ts`'s own `FETCH_POLL_TIMEOUT_MS`: a server
 *  that accepts a connection but never answers must not be able to wedge a single bare `fetch()`
 *  forever and starve this loop's own deadline re-check. Flat, not `loadFactor()`-scaled — the
 *  outer deadline already accounts for load. */
const FETCH_POLL_TIMEOUT_MS = 2000;

/** Bounds a single, non-retried fetch made after `waitForHttpReady` already proved the server is
 *  up, scaled by {@link loadFactor} like every other post-boot timing assumption in this file. */
function fetchTimeoutSignal(baseMs = 10000): AbortSignal {
  // `AbortSignal.timeout` throws ERR_OUT_OF_RANGE on the fractional value `loadFactor()` gives under load.
  return AbortSignal.timeout(Math.ceil(baseMs * loadFactor()));
}

/**
 * `timeoutMs` bounds the underlying `spawnSync`, which otherwise defaults to no timeout at all — a
 * hard, synchronous `waitpid` on the whole test process that nothing else can preempt. Scaled by
 * `loadFactor()`, the same as every HTTP wait in this file: a flat 30s is not safe on this shared,
 * contended machine — the 2026-09-07 verification run measured a 1-minute load average of 139 on 8
 * cores (~17x, from other concurrently active agents) and that alone killed a healthy `tovu init`
 * at ~30.1s with a null status and empty stderr, a false failure indistinguishable in its symptoms
 * from a real one. `tovu init` normally finishes in well under a second at rest, so 30s is already
 * generous unscaled — DO NOT flatten this back to a bare number, it reintroduces that false failure.
 */
function runCliSync(args: string[], env: NodeJS.ProcessEnv = {}, timeoutMs = 30_000 * loadFactor()): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], {
    encoding: "utf8",
    env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env },
    // `loadFactor()` is fractional under load, and `spawnSync` throws ERR_OUT_OF_RANGE on a non-integer.
    timeout: Math.ceil(timeoutMs),
  });
  return { status: result.status, stderr: result.stderr };
}

function spawnServe(args: string[], env: NodeJS.ProcessEnv = {}, imports: string[] = []): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["--import", TSX_LOADER, ...imports.flatMap(file => ["--import", file]), CLI_MAIN, "serve", ...args], {
    env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env },
  }) as ChildProcessWithoutNullStreams;
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
  throw new Error(`timed out waiting for http://127.0.0.1:${port}/ to respond after ${Math.round((timeoutMs * factor) / 1000)}s`);
}

async function stopGracefully(child: ChildProcessWithoutNullStreams, timeoutMs = 10000): Promise<number | null> {
  const scaled = timeoutMs * loadFactor();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not exit within ${Math.round(scaled / 1000)}s after SIGTERM`)), scaled);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.kill("SIGTERM");
  });
}

function initFixture(name = "Boot Lifecycle Fixture"): { parent: string; dir: string } {
  const parent = mkTempParent();
  const dir = path.join(parent, "site");
  const initResult = runCliSync(["init", dir, "--name", name]);
  assert.equal(initResult.status, 0, `fixture setup: tovu init must succeed (stderr: ${initResult.stderr})`);
  return { parent, dir };
}

function sessionCookieFrom(setCookieHeader: string | null): string {
  if (!setCookieHeader) throw new Error("login response carried no Set-Cookie header");
  const first = setCookieHeader.split(";")[0];
  if (!first) throw new Error(`could not parse a cookie pair out of Set-Cookie header: ${setCookieHeader}`);
  return first;
}

test("tovu serve actually runs runBootLifecycle: database-migration-reconciliation, settings, and seo all show 'ready' on the admin module-status route after boot", async () => {
  const { parent, dir } = initFixture();
  const port = await getFreePort();
  const username = "boot-lifecycle-owner";
  const password = "boot-lifecycle-test-password";
  const child = spawnServe([dir, "--port", String(port)], { TOVU_ADMIN_USER: username, TOVU_ADMIN_PASSWORD: password });
  let stdoutBuf = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
  });

  try {
    await waitForHttpReady(port, child);

    const workspaceIdMatch = /workspaceId=(\S+)/.exec(stdoutBuf);
    assert.ok(workspaceIdMatch, `expected the boot line to report workspaceId=... (stdout so far: ${stdoutBuf})`);
    const workspaceId = workspaceIdMatch![1];

    // Log in with the exact credentials the child was seeded with above, never this process's env.
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/admin/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: fetchTimeoutSignal(),
    });
    assert.equal(loginRes.status, 200, `admin login must succeed against the seeded owner account (status ${loginRes.status})`);
    const cookie = sessionCookieFrom(loginRes.headers.get("set-cookie"));

    const statusRes = await fetch(`http://127.0.0.1:${port}/api/admin/v1/workspaces/${workspaceId}/system/module-status`, {
      headers: { cookie },
      signal: fetchTimeoutSignal(),
    });
    assert.equal(statusRes.status, 200, `module-status must report 200 (all-ready) for a healthy fixture boot (status ${statusRes.status})`);
    const snapshot = (await statusRes.json()) as { ok: boolean; modules: Array<{ name: string; lifecycle: { status: string } }> };
    assert.equal(snapshot.ok, true);

    for (const expectedName of ["database-migration-reconciliation", "settings", "seo"]) {
      const module = snapshot.modules.find((m) => m.name === expectedName);
      assert.ok(
        module,
        `expected the boot-lifecycle snapshot to include a "${expectedName}" module — before this dispatch's fix, ` +
          `'tovu serve' never called runBootLifecycle()/buildBootModules() at all, so this snapshot would default to ` +
          `{ ok: true, modules: [] } and this module would be entirely absent (observed modules: ${JSON.stringify(snapshot.modules.map((m) => m.name))})`
      );
      assert.equal(module!.lifecycle.status, "ready", `expected "${expectedName}" to be ready after a healthy boot`);
    }
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
  }
});

test("tovu serve refuses to serve when a critical boot module genuinely rejects: no app.listen(), no bound port, non-zero exit — not a logged-and-ignored rejection", async () => {
  const { parent, dir } = initFixture();

  // A real, un-mocked fault: `seedSettingsFromPresentation()` (the `settings` boot module's
  // `prepare()`) writes into `setting_definitions` — dropping that table out-of-band, directly on
  // the fixture's own content.db via a plain sqlite connection (no Tovu code involved), makes that
  // write hit a genuine "no such table" SQLite error the next time this site boots. This is the
  // exact class of real corruption `settings`'s CRITICAL classification exists to catch (its own
  // `buildBootModules` comment: "their promises have no `.catch()` anywhere ... a failure here must
  // abort boot cleanly").
  const dbPath = resolveSiteDatabasePaths({ dir }).contentDbPath;
  const sqlite = new Database(dbPath);
  sqlite.exec("DROP TABLE setting_definitions");
  sqlite.close();

  const port = await getFreePort();
  const listensPath = path.join(parent, "listen-attempts.jsonl");
  const monitorPath = path.join(parent, "listen-monitor.mjs");
  fs.writeFileSync(monitorPath, `
import net from 'node:net';
import { appendFileSync } from 'node:fs';
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const port = typeof args[0] === 'object' ? args[0]?.port : args[0];
  if (Number(port) === ${port}) appendFileSync(${JSON.stringify(listensPath)}, JSON.stringify({ port }));
  return Reflect.apply(listen, this, args);
};
`);
  const child = spawnServe([dir, "--port", String(port)], {}, [monitorPath]);
  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const scaled = 20000 * loadFactor();
      const timer = setTimeout(() => reject(new Error(`server did not exit on its own within ${Math.round(scaled / 1000)}s of a corrupted settings table`)), scaled);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    assert.equal(fs.existsSync(listensPath), false, "the requested port must never be listened on, including briefly before the process exits");
    assert.notEqual(exitCode, 0, `expected a non-zero exit when a critical boot module rejects (stderr: ${stderrBuf})`);
    assert.ok(
      !stdoutBuf.includes("tovu serve: dir="),
      `expected the boot line (only printed from inside the "listening" callback, i.e. after app.listen() succeeded) to NEVER print — ` +
        `a critical rejection must refuse before binding the port, not after (stdout: ${stdoutBuf})`
    );

    // Confirms the port was genuinely never bound — a second server can claim it immediately.
    const probe = net.createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once("error", (err) => reject(err));
      probe.listen(port, () => resolve());
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await stopGracefully(child).catch(() => undefined);
    }
    removeFixtureTree(parent);
  }
});

for (const boot of ['https-dev', 'desktop-serve'] as const) {
  test(`${boot}: actual boot pins its listener origin into the native daemon launch and the child-composed site guide`, { timeout: 120_000 }, async () => {
    const { parent, dir } = initFixture();
    const port = await getFreePort();
    const reportPath = path.join(parent, 'daemon-origin.json');
    const observerPath = path.join(parent, 'daemon-origin-observer.mjs');
    const preloadPath = path.join(parent, 'observe-native-spawn.mjs');
    const depsUrl = new URL('../../../server/runtime/composition/app.ts', import.meta.url).href;
    const delegatedFixtureUrl = new URL('../../../assistant/__tests__/fixtures/execute-registered-tool.ts', import.meta.url).href;
    const guideUrl = new URL('../../../server/runtime/composition/site-guide-tools.ts', import.meta.url).href;
    // The observer uses the child's actual inherited environment and real composition; only
    // unrelated guide topic loading is supplied by a small engine fixture.
    fs.writeFileSync(observerPath, `
      import { writeFileSync } from 'node:fs';
      import { createRouteDeps } from ${JSON.stringify(depsUrl)};
      import { buildSiteGuideRegistrations } from ${JSON.stringify(guideUrl)};
      import { executeDelegatedRegisteredTool, delegatedText } from ${JSON.stringify(delegatedFixtureUrl)};
      const deps = createRouteDeps();
      const engine = { parseGuideTopics: () => ({ ok: true, descriptors: [] }), createSiteGuide: () => ({ run: async () => ({ topics: [] }) }) };
      const registration = buildSiteGuideRegistrations({ deps }, { engine })[0];
      await deps.identityReady;
      const principalId = await deps.ownerPrincipalId;
      const reply = await executeDelegatedRegisteredTool({ registration, input: { operation: 'overview' } }, { principalId });
      if (reply.isError) throw new Error(delegatedText(reply));
      const { output } = JSON.parse(delegatedText(reply));
      writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({ inherited: process.env.TOVU_SITE_LISTENER_ORIGIN, siteOrigin: output.siteOrigin, navigationHint: output.navigationHint }));
      process.exit(0);
    `);
    let tlsPatch = '';
    if (boot === 'https-dev') {
      const { DEV_PROXY_TLS } = await import('../../../server/inbound/admin-http/__tests__/fixtures/admin-dev-proxy-tls.js');
      const certPath = path.join(parent, 'localhost.pem');
      const keyPath = path.join(parent, 'localhost-key.pem');
      fs.writeFileSync(certPath, DEV_PROXY_TLS.cert);
      fs.writeFileSync(keyPath, DEV_PROXY_TLS.key);
      tlsPatch = `
        const realExists = fs.existsSync;
        const realRead = fs.readFileSync;
        const fixture = p => String(p).endsWith('/.certs/localhost.pem') ? ${JSON.stringify(certPath)} : String(p).endsWith('/.certs/localhost-key.pem') ? ${JSON.stringify(keyPath)} : p;
        fs.existsSync = p => realExists(fixture(p));
        fs.readFileSync = (p, ...args) => realRead(fixture(p), ...args);
      `;
    }
    fs.writeFileSync(preloadPath, `
      import cp from 'node:child_process';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      ${tlsPatch}
      const nativeSpawn = cp.spawn;
      cp.spawn = (command, args, options) => {
        if (args?.some(arg => /agent-daemon-server\.(?:ts|js)$/.test(String(arg)))) {
          return nativeSpawn(process.execPath, ['--import', ${JSON.stringify(TSX_LOADER)}, ${JSON.stringify(observerPath)}], { ...options, env: { ...options.env, NODE_OPTIONS: '' } });
        }
        return nativeSpawn(command, args, options);
      };
      syncBuiltinESMExports();
    `);
    const env: NodeJS.ProcessEnv = {
      TOVU_SITE_DIR: dir, TOVU_ADMIN_ASSISTANT: 'on', TOVU_HOST: '127.0.0.1',
      TOVU_SITE_LISTENER_ORIGIN: 'http://stale.invalid:1', TOVU_DISABLE_PARENT_WATCHDOG: '1',
      TOVU_DISABLE_DEV_TLS: '0', TOVU_DB: 'memory', PORT: String(port),
    };
    const child = boot === 'desktop-serve'
      ? spawnServe([dir, '--host', '127.0.0.1', '--port', String(port)], env, [preloadPath])
      : spawn(process.execPath, ['--import', TSX_LOADER, '--import', preloadPath, path.resolve(import.meta.dirname, '../../../index.ts')], {
        env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env },
      }) as ChildProcessWithoutNullStreams;
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.stdout.resume();
    try {
      const deadline = Date.now() + 60_000 * loadFactor();
      while (!fs.existsSync(reportPath) && Date.now() < deadline) {
        assert.equal(child.exitCode, null, stderr);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(fs.existsSync(reportPath), `daemon did not receive the boot origin: ${stderr}`);
      const expected = `${boot === 'https-dev' ? 'https' : 'http'}://127.0.0.1:${port}`;
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      assert.equal(report.inherited, expected);
      assert.equal(report.siteOrigin, expected);
      assert.match(report.navigationHint, /Preserve this exact scheme, host and port/);
      const [https, http] = await Promise.all([import('node:https'), import('node:http')]);
      await new Promise<void>((resolve, reject) => {
        const onResponse = (response: import('node:http').IncomingMessage) => { response.resume(); resolve(); };
        const request = boot === 'https-dev'
          ? https.get(expected, { rejectUnauthorized: false, timeout: 5000 }, onResponse)
          : http.get(expected, { timeout: 5000 }, onResponse);
        request.once('error', reject);
        request.once('timeout', () => request.destroy(new Error('listener probe timed out')));
      });
    } finally {
      if (child.exitCode === null) await stopGracefully(child);
      await removeFixtureTree(parent);
    }
  });
}
