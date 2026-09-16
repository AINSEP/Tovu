import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import * as devDesktop from "../dev-desktop.mjs";
import { DEFAULT_STOP_GRACE_MS } from "../../../apps/desktop/src/tovu-server.ts";

const { waitForFileStable } = devDesktop;

/**
 * @file Regression test for `development/scripts/dev-desktop.mjs`'s launch-1-boots-the-previous-
 * bundle bug: `waitForFileStable` polled `dist/renderer/index.html` for two stable-mtime ticks
 * (~300-450ms at the default poll settings) and resolved as soon as it saw those — but on a second
 * (or later) `npm run desktop`, that file already exists from the LAST run and is already stable, so
 * the wait was satisfied by stale bytes before vite's ~2.7s first watch build had written anything.
 * Electron then loaded the previous bundle; only launch 2+ (after the watcher had time to catch up)
 * saw the real change. The fix adds a `sinceMs` freshness floor: a stat older than `sinceMs` is
 * treated as not-yet-built-this-run and cannot satisfy the wait on its own — see the function's own
 * doc comment in `../dev-desktop.mjs` for the full mechanism.
 *
 * Also covers the admin-Vite autostart helpers added later (second section below).
 *
 * Run with: `node --import tsx --test development/scripts/__tests__/dev-desktop.test.mjs` — `tsx` is
 * required because this file imports a `.ts` module for `DEFAULT_STOP_GRACE_MS`. Nothing in CI runs
 * it: the root `test`/`test:ci` scripts glob only `.test.ts` files under `development/scripts`, so
 * every `.test.mjs` in this directory is manual-run-only.
 */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTempIndexHtml(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-desktop-wait-"));
  const filePath = path.join(dir, "index.html");
  fs.writeFileSync(filePath, content);
  return filePath;
}

test("waitForFileStable: a stale file predating sinceMs never satisfies the wait on its own (times out)", async () => {
  const filePath = makeTempIndexHtml("<html>previous run's bundle</html>");
  await delay(30); // unambiguously separate the stale file's mtime from sinceMs below
  const sinceMs = Date.now();
  const result = await waitForFileStable(filePath, {
    timeoutMs: 200,
    pollMs: 20,
    stableChecks: 2,
    sinceMs,
  });
  assert.equal(result, false, "a stat older than sinceMs must not count as fresh, even if stable");
});

test("waitForFileStable: only a rewrite landing at/after sinceMs satisfies the wait, not the stale content already on disk", async () => {
  const filePath = makeTempIndexHtml("<html>previous run's bundle</html>");
  await delay(30);
  const sinceMs = Date.now();
  // Simulates vite's watch build writing the NEW bundle shortly after the watcher starts.
  setTimeout(() => fs.writeFileSync(filePath, "<html>this run's fresh bundle</html>"), 60);
  const result = await waitForFileStable(filePath, {
    timeoutMs: 2000,
    pollMs: 20,
    stableChecks: 2,
    sinceMs,
  });
  assert.equal(result, true);
});

test("waitForFileStable: sinceMs defaults to 0, so a freshly created file with no prior run still resolves true", async () => {
  const filePath = makeTempIndexHtml("<html>only build this process has ever made</html>");
  const result = await waitForFileStable(filePath, { timeoutMs: 300, pollMs: 20, stableChecks: 2 });
  assert.equal(result, true);
});

test("the SIGKILL escalation waits longer than the desktop app's own tovu serve stop grace", () => {
  // `tovu serve` is spawned `detached`, so the process-group kill below never reaches it: only
  // Electron's before-quit drain stops it, escalating to SIGKILL after DEFAULT_STOP_GRACE_MS. A
  // shorter hard kill SIGKILLs Electron first and strands any server still draining.
  assert.equal(typeof devDesktop.HARD_KILL_GRACE_MS, "number", "dev-desktop.mjs must export its SIGKILL grace");
  assert.ok(
    devDesktop.HARD_KILL_GRACE_MS > DEFAULT_STOP_GRACE_MS,
    `HARD_KILL_GRACE_MS (${devDesktop.HARD_KILL_GRACE_MS}) must exceed DEFAULT_STOP_GRACE_MS (${DEFAULT_STOP_GRACE_MS})`,
  );
});

test("waitForFileStable: resolves false, not hung forever, when the file never appears at all", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-desktop-wait-"));
  const missingPath = path.join(dir, "never-written.html");
  const result = await waitForFileStable(missingPath, { timeoutMs: 100, pollMs: 20, stableChecks: 2 });
  assert.equal(result, false);
});

// --- admin Vite autostart ---------------------------------------------------------
//
// `npm run desktop` starts an admin Vite so `/admin` inside the app hot-reloads instead of serving
// whatever `apps/admin/dist` last held. The helpers below are the decision points in that path:
// whether the opt-out was set, whether a Vite is answering, and how long to wait for one.

const { isFlagEnabled, probeAdminVite, waitForAdminVite } = devDesktop;

test("isFlagEnabled: only an explicit 1/true enables — a literal \"false\" must not read as \"on\"", () => {
  // The 2026-09-05 audit finding against TOVU_DISABLE_DEV_TLS: a bare truthy check on the raw string
  // treated `TOVU_DISABLE_DEV_TLS=false` as "disable", inverting the operator's stated intent.
  for (const raw of ["1", "true", "TRUE", " true ", "True"]) {
    assert.equal(isFlagEnabled(raw), true, `${JSON.stringify(raw)} must enable`);
  }
  for (const raw of ["false", "FALSE", "0", "", "  ", "yes", "no", undefined, null]) {
    assert.equal(isFlagEnabled(raw), false, `${JSON.stringify(raw)} must not enable`);
  }
});

/** A stand-in Vite: any listener that speaks HTTP is "up" as far as the probe is concerned. */
function listeningServer(t, handler = (_req, res) => res.end("ok")) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      t.after(() => server.close());
      resolve(server.address().port);
    });
  });
}

test("probeAdminVite: any HTTP answer counts as up, 404 included — Vite 404s /admin/ during startup", async (t) => {
  const port = await listeningServer(t, (_req, res) => {
    res.statusCode = 404;
    res.end("not found");
  });
  assert.equal(await probeAdminVite(port, { host: "127.0.0.1" }), true);
});

test("probeAdminVite: nothing listening is a miss, not a hang", async () => {
  // Port 1 is privileged and unbound; the connection is refused immediately rather than timing out.
  // Do not "fix" this into a high port — an unbound high port can sit in a filtered state and burn
  // the full probe timeout on both schemes.
  assert.equal(await probeAdminVite(1, { host: "127.0.0.1" }), false);
});

/** A port nothing is listening on right now: bind an ephemeral one, note it, give it back. */
function reservePort() {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const chosen = probe.address().port;
      probe.close(() => resolve(chosen));
    });
  });
}

test("waitForAdminVite: resolves true for a Vite that only comes up AFTER the wait begins", async (t) => {
  const port = await reservePort();
  const server = http.createServer((_req, res) => res.end("ok"));
  // Both cleaned up unconditionally: a pending `listen` timer that fires after a FAILED assertion
  // leaves a bound server nothing ever closes, and the test runner then hangs on the live handle
  // instead of reporting the failure.
  const timer = setTimeout(() => server.listen(port, "127.0.0.1"), 80);
  t.after(() => {
    clearTimeout(timer);
    if (server.listening) server.close();
  });

  assert.equal(await waitForAdminVite(port, { host: "127.0.0.1", timeoutMs: 5_000, pollMs: 25 }), true);
});

test("waitForAdminVite: resolves false on timeout rather than rejecting — a broken Vite must still let Electron start", async () => {
  assert.equal(await waitForAdminVite(1, { host: "127.0.0.1", timeoutMs: 120, pollMs: 25 }), false);
});

test("waitForAdminVite: an aborted wait resolves false at once — a Vite that failed to boot must not cost 30s", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  const startedAt = Date.now();
  assert.equal(
    await waitForAdminVite(1, { host: "127.0.0.1", timeoutMs: 30_000, pollMs: 25, signal: controller.signal }),
    false,
  );
  assert.ok(Date.now() - startedAt < 5_000, "abort must short-circuit the deadline, not wait it out");
});

test("waitForAdminVite: an already-aborted signal resolves false without probing at all", async () => {
  const startedAt = Date.now();
  assert.equal(
    await waitForAdminVite(1, { host: "127.0.0.1", timeoutMs: 30_000, signal: AbortSignal.abort() }),
    false,
  );
  // The value alone does not pin this: a signal that is ALREADY aborted never fires an `abort`
  // event, so without the pre-check the wait polls out the full 30s deadline and still resolves
  // false. Only the elapsed time separates the two.
  assert.ok(Date.now() - startedAt < 1_000, "an already-aborted signal must short-circuit, not poll the deadline out");
});

test("probeAdminVite: a junk TOVU_ADMIN_DEV_PORT is a miss, not an unhandled rejection in the launcher", async () => {
  // `ADMIN_VITE_PORT` is `Number(process.env.TOVU_ADMIN_DEV_PORT ?? 5173)`, so a non-numeric value
  // arrives here as NaN and `new URL("https://localhost:NaN")` throws. Same verdict
  // `apps/desktop/src/admin-dev-proxy.ts` reaches for the same input: no candidate.
  assert.equal(await probeAdminVite(Number("not-a-port"), { host: "127.0.0.1" }), false);
  assert.equal(await probeAdminVite(70000, { host: "127.0.0.1" }), false);
});
