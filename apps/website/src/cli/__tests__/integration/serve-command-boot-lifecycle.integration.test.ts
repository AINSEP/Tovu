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

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

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

function runCliSync(args: string[], env: NodeJS.ProcessEnv = {}): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], {
    encoding: "utf8",
    env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env },
  });
  return { status: result.status, stderr: result.stderr };
}

function spawnServe(args: string[], env: NodeJS.ProcessEnv = {}): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "serve", ...args], {
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
      const res = await fetch(`http://127.0.0.1:${port}/`);
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
  const child = spawnServe([dir, "--port", String(port)]);
  let stdoutBuf = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
  });

  try {
    await waitForHttpReady(port, child);

    const workspaceIdMatch = /workspaceId=(\S+)/.exec(stdoutBuf);
    assert.ok(workspaceIdMatch, `expected the boot line to report workspaceId=... (stdout so far: ${stdoutBuf})`);
    const workspaceId = workspaceIdMatch![1];

    const username = process.env.TOVU_ADMIN_USER ?? "admin";
    const password = process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev";
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/admin/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(loginRes.status, 200, `admin login must succeed against the seeded owner account (status ${loginRes.status})`);
    const cookie = sessionCookieFrom(loginRes.headers.get("set-cookie"));

    const statusRes = await fetch(`http://127.0.0.1:${port}/api/admin/v1/workspaces/${workspaceId}/system/module-status`, {
      headers: { cookie },
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
    await stopGracefully(child);
    fs.rmSync(parent, { recursive: true, force: true });
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
  const dbPath = path.join(dir, "content.db");
  const sqlite = new Database(dbPath);
  sqlite.exec("DROP TABLE setting_definitions");
  sqlite.close();

  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port)]);
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
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
