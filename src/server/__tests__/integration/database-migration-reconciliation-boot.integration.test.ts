import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSqliteRouteDeps, defaultDatabaseJournalDbPath } from "../../runtime/composition/deps.js";
import { buildBootModules } from "../../runtime/boot/bootstrap.js";
import { runBootLifecycle } from "../../runtime/lifecycle/boot-lifecycle.js";
import { createApp } from "../../runtime/composition/app.js";
import { openDatabaseJournalDb } from "#src/platform/db/sqlite/database-journal-db";
import { SqliteMigrationRunsRepo } from "#src/platform/db/sqlite/database-journal-repo";
import { loginAsOwner, startTestServer } from "../helpers/http-test-server.js";

/**
 * @file ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 2 —
 * hard blocker fix). Proves `reconcile-interrupted-migration.ts`'s scanner — fully built,
 * fully unit-tested, but never invoked by any composition root before this fix — now actually
 * runs at boot through the REAL `createSqliteRouteDeps()` + `buildBootModules()` +
 * `runBootLifecycle()` path `index.ts` uses, against a real sidecar `ops/database-journal.db` file.
 *
 * Round 2 addendum: the external audit (codex, finding `R2-F2-BLOCK-NOT-ENFORCED`) correctly
 * caught that detection alone (siteStatus flipping) does not satisfy ADR-041 §3's "blocking
 * normal site open until resolved" — nothing consumed that status to refuse a request, so
 * `app.listen()` still opened the socket to full normal traffic. The third test below proves the
 * new `site-serving-gate.ts` middleware closes that: a real HTTP request to a normal admin route
 * or the public site is refused while blocked, while Recovery/auth/healthz remain reachable.
 *
 * Round 3 addendum: the external audit (codex, finding `R3-F1-ADMIN-PREFIX-PUBLIC-BYPASS`) caught
 * that the gate's original `/admin` allowlist check was not path-segment bounded, letting a
 * public page slugged e.g. "admin-news" bypass the block via the site's own `GET /:slug`
 * catch-all. The same test now also seeds such a page and proves it is genuinely blocked, while
 * `/admin` and `/admin/...` (the real admin shell) remain reachable.
 */

test("a non-terminal migration_runs row (simulated crash mid-migration) is reconciled at boot: siteStatus flips to BLOCKED_PENDING_RECOVERY and a migration.interrupted ledger row is appended", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-migration-reconcile-boot-"));
  const dbPath = path.join(dir, "content.db");
  try {
    // Seed a non-terminal migration_runs row directly into the REAL sidecar file, at the SAME
    // path createSqliteRouteDeps() will derive and open — simulates a process that crashed
    // mid-migration on a PRIOR boot. `deps.ts` normally creates the `ops/` dir itself; this
    // pre-seed step runs BEFORE createSqliteRouteDeps(), so it must create it too.
    const databaseJournalDbPath = defaultDatabaseJournalDbPath(dbPath);
    fs.mkdirSync(path.dirname(databaseJournalDbPath), { recursive: true });
    const databaseJournalDb = openDatabaseJournalDb(databaseJournalDbPath);
    const migrationRunsRepo = new SqliteMigrationRunsRepo({ db: databaseJournalDb, siteId: "workspace-local" });
    await migrationRunsRepo.insert({
      id: "run-crashed-1",
      dialect: "sqlite",
      status: "DDL_IN_PROGRESS",
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
    (databaseJournalDb as unknown as { $client: { close(): void } }).$client.close();

    // Now boot for real, through the exact path index.ts uses.
    const deps = createSqliteRouteDeps(dbPath);
    const result = await runBootLifecycle(buildBootModules(deps, { useMemory: false, defaultContentDbPath: () => dbPath }));

    const reconciliation = result.modules.find((m) => m.name === "database-migration-reconciliation");
    assert.equal(reconciliation?.lifecycle.status, "ready", "the scan itself succeeds (finding an interrupted migration is a successful detection, not a module failure)");

    const siteStatus = await deps.siteStatusRepo.get(deps.workspaceId);
    assert.equal(siteStatus, "BLOCKED_PENDING_RECOVERY", "the reconciliation must flip siteStatus so the Recovery degraded-banner and PENDING_MIGRATION guard actually function");

    const ledgerPage = await deps.databaseLedgerRepo.query({ kind: "migration.interrupted", limit: 10 });
    assert.equal(ledgerPage.items.length, 1);
    assert.equal(ledgerPage.items[0].outcome, "blocked_pending_recovery");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ADR-041/043/044/045 re-audit round 2 (codex finding R2-F2-BLOCK-NOT-ENFORCED): a real HTTP request to a normal admin route or the public site is actually refused (503 SITE_BLOCKED_PENDING_RECOVERY) while siteStatus is BLOCKED_PENDING_RECOVERY -- detection alone (siteStatus flipping) is not enough; Recovery, auth, and healthz stay reachable so an operator can resolve it", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-migration-reconcile-serving-gate-"));
  const dbPath = path.join(dir, "content.db");
  try {
    const databaseJournalDbPath = defaultDatabaseJournalDbPath(dbPath);
    fs.mkdirSync(path.dirname(databaseJournalDbPath), { recursive: true });
    const databaseJournalDb = openDatabaseJournalDb(databaseJournalDbPath);
    const migrationRunsRepo = new SqliteMigrationRunsRepo({ db: databaseJournalDb, siteId: "workspace-local" });
    await migrationRunsRepo.insert({
      id: "run-crashed-2",
      dialect: "sqlite",
      status: "DDL_IN_PROGRESS",
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
    (databaseJournalDb as unknown as { $client: { close(): void } }).$client.close();

    const deps = createSqliteRouteDeps(dbPath);
    await runBootLifecycle(buildBootModules(deps, { useMemory: false, defaultContentDbPath: () => dbPath }));
    assert.equal(await deps.siteStatusRepo.get(deps.workspaceId), "BLOCKED_PENDING_RECOVERY");

    const app = createApp(deps);
    const baseUrl = await startTestServer(app, t);

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200, "ops health probe must stay reachable while blocked");

    const cookie = await loginAsOwner(baseUrl);
    assert.ok(cookie, "auth/login must stay reachable so an operator can authenticate to resolve the block");

    const recoveryStatus = await fetch(`${baseUrl}/api/admin/v1/recovery/status`, { headers: { cookie } });
    assert.equal(recoveryStatus.status, 200, "Recovery's own API surface must stay reachable while blocked");

    const normalAdminRoute = await fetch(`${baseUrl}/api/admin/v1/database/timeline`, { headers: { cookie } });
    assert.equal(normalAdminRoute.status, 503, "a normal (non-Recovery) admin route must be refused while blocked");
    const normalAdminBody = (await normalAdminRoute.json()) as { code: string };
    assert.equal(normalAdminBody.code, "SITE_BLOCKED_PENDING_RECOVERY");

    const publicSite = await fetch(`${baseUrl}/`);
    assert.equal(publicSite.status, 503, "public site serving must be refused while blocked, per ADR-041 §3's PENDING_MIGRATION precedent");

    // Round 3 fix (external audit, codex finding R3-F1-ADMIN-PREFIX-PUBLIC-BYPASS): the original
    // bare `path.startsWith("/admin")` allowlist check was not path-segment bounded, so a public
    // page slugged e.g. "admin-news" would bypass the block via the site's own GET /:slug
    // catch-all. Seed exactly such a page and prove it is now genuinely blocked.
    await deps.postRepo.save({
      id: "page-admin-news",
      workspaceId: deps.workspaceId,
      title: "Admin News",
      slug: "admin-news",
      bodyJson: {},
      status: "published",
      kind: "page",
      updatedAt: deps.clock.nowIso(),
      version: 1,
    });
    const adminPrefixedSlug = await fetch(`${baseUrl}/admin-news`);
    assert.equal(adminPrefixedSlug.status, 503, "a public page whose slug merely starts with 'admin' must still be blocked, not treated as the admin shell");
    const adminPrefixedSlugBody = (await adminPrefixedSlug.json()) as { code: string };
    assert.equal(adminPrefixedSlugBody.code, "SITE_BLOCKED_PENDING_RECOVERY", "must be the gate's own refusal, not some other unrelated 503");

    // The real admin shell itself (exact "/admin" and any "/admin/..." sub-path) must still be
    // reachable -- distinguish this from the bypass case above by confirming it does NOT carry
    // the gate's own refusal code (whatever admin-static.ts itself returns for an unbuilt/built
    // shell is a separate, expected concern this test does not assert on).
    const adminShellExact = await fetch(`${baseUrl}/admin`);
    const adminShellExactBody = (await adminShellExact.json().catch(() => ({}))) as { code?: string };
    assert.notEqual(adminShellExactBody.code, "SITE_BLOCKED_PENDING_RECOVERY", "/admin itself must not be blocked by the gate");

    const adminShellSubpath = await fetch(`${baseUrl}/admin/settings`);
    const adminShellSubpathBody = (await adminShellSubpath.json().catch(() => ({}))) as { code?: string };
    assert.notEqual(adminShellSubpathBody.code, "SITE_BLOCKED_PENDING_RECOVERY", "/admin/... sub-paths must not be blocked by the gate");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("round-5 re-audit (codex R5-F1-BLOCKED-RECOVERY-NOT-RESTART-SAFE / Fable R5-F1-INTERRUPTED-SECOND-BOOT-BRICK): a SECOND boot against the same sidecar, with the same still-unresolved migration, re-detects and re-blocks WITHOUT crashing the critical boot module", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-migration-reconcile-second-boot-"));
  const dbPath = path.join(dir, "content.db");
  try {
    const databaseJournalDbPath = defaultDatabaseJournalDbPath(dbPath);
    fs.mkdirSync(path.dirname(databaseJournalDbPath), { recursive: true });
    const databaseJournalDb = openDatabaseJournalDb(databaseJournalDbPath);
    const migrationRunsRepo = new SqliteMigrationRunsRepo({ db: databaseJournalDb, siteId: "workspace-local" });
    await migrationRunsRepo.insert({
      id: "run-crashed-restart-safe",
      dialect: "sqlite",
      status: "DDL_IN_PROGRESS",
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
    (databaseJournalDb as unknown as { $client: { close(): void } }).$client.close();

    // Boot #1 (simulates the operator's process starting after the crash).
    const deps1 = createSqliteRouteDeps(dbPath);
    const result1 = await runBootLifecycle(buildBootModules(deps1, { useMemory: false, defaultContentDbPath: () => dbPath }));
    const reconciliation1 = result1.modules.find((m) => m.name === "database-migration-reconciliation");
    assert.equal(reconciliation1?.lifecycle.status, "ready", "boot 1: detection succeeds");
    assert.equal(await deps1.siteStatusRepo.get(deps1.workspaceId), "BLOCKED_PENDING_RECOVERY");
    // Real operation is one process at a time -- identityReady's owner-seed write always finishes
    // before a NEXT process's own seed check could race it. Await it here so this test's two
    // in-process boots don't trigger that unrelated, pre-existing identity-seed race (two
    // concurrent seedIdentity() calls both missing the not-yet-committed owner row and racing to
    // insert the same role) -- not what R5-F1/R5-F2 are about.
    await deps1.identityReady;

    // Boot #2 against the SAME sidecar file, fresh deps -- simulates a restart (crash-loop, deploy,
    // health-check restart, or an operator restarting the process before resolving Recovery) while
    // the migration is STILL unresolved. Pre-fix: appendInterruptedRow's plain insert of the
    // deterministic id `interrupted-run-crashed-restart-safe` collided with boot 1's own row,
    // throwing UNIQUE constraint failed -- the critical module failed, `ok` went false, and
    // index.ts would process.exit(1) before ever calling listen(), locking Recovery itself out.
    const deps2 = createSqliteRouteDeps(dbPath);
    const result2 = await runBootLifecycle(buildBootModules(deps2, { useMemory: false, defaultContentDbPath: () => dbPath }));
    const reconciliation2 = result2.modules.find((m) => m.name === "database-migration-reconciliation");
    assert.equal(reconciliation2?.lifecycle.status, "ready", "boot 2 must NOT crash the critical module on the same still-unresolved migration");
    assert.equal(result2.ok, true, "boot 2 must succeed overall so the process reaches listen() and Recovery stays reachable");
    assert.equal(await deps2.siteStatusRepo.get(deps2.workspaceId), "BLOCKED_PENDING_RECOVERY", "still correctly blocked -- idempotent re-detection, not a false-clear");

    const ledgerPage = await deps2.databaseLedgerRepo.query({ kind: "migration.interrupted", limit: 10 });
    assert.equal(ledgerPage.items.length, 1, "the ledger row is idempotent too -- one row, not one per boot");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("round-5/6 re-audit (codex R5-F1 / Fable R5-F2-BLOCK-HAS-NO-EXIT, then codex round-6 R6-F1-RESTART-REQUIRED-RESTORE-UNBLOCKS-STALE-DB): a successful restore durably resolves the migration, but the running process stays blocked until a real restart -- clearing it in-process would serve stale pre-restore data from the old, now-unlinked file handle", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-migration-reconcile-restore-exit-"));
  const dbPath = path.join(dir, "content.db");
  try {
    const databaseJournalDbPath = defaultDatabaseJournalDbPath(dbPath);
    fs.mkdirSync(path.dirname(databaseJournalDbPath), { recursive: true });
    const databaseJournalDb = openDatabaseJournalDb(databaseJournalDbPath);
    const migrationRunsRepo = new SqliteMigrationRunsRepo({ db: databaseJournalDb, siteId: "workspace-local" });
    await migrationRunsRepo.insert({
      id: "run-crashed-restore-exit",
      dialect: "sqlite",
      status: "DDL_IN_PROGRESS",
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
    (databaseJournalDb as unknown as { $client: { close(): void } }).$client.close();

    // Boot #1: blocked, as before.
    const deps = createSqliteRouteDeps(dbPath);
    await runBootLifecycle(buildBootModules(deps, { useMemory: false, defaultContentDbPath: () => dbPath }));
    assert.equal(await deps.siteStatusRepo.get(deps.workspaceId), "BLOCKED_PENDING_RECOVERY");

    // Run the real Recovery restore ceremony (plan -> confirm -> execute) end-to-end over real
    // HTTP, exactly as an operator would use it to resolve the block.
    const app = createApp(deps);
    const baseUrl = await startTestServer(app, t);
    const cookie = await loginAsOwner(baseUrl);

    // A real restore point needs a real artifact -- captureRestorePoint() backs up the live
    // content.db to an actual file (the real SqliteDbOpsAdapter, not the in-memory test double,
    // since this test boots through createSqliteRouteDeps()); restoreFromArtifact() later does a
    // real fs.access() on that path.
    const captured = await deps.dbOps.captureRestorePoint({ scopeId: deps.workspaceId });
    await deps.restorePointsRepo.save({
      restorePointId: "rp-restart-safe-1",
      idempotencyKey: "rp-restart-safe-1-key",
      trigger: "manual",
      createdAt: deps.clock.nowIso(),
      createdBy: "owner",
      costClass: "cheap",
      kind: "file-snapshot",
      artifactRef: captured.artifactRef,
      watermarkAtCapture: captured.watermarkAtCapture,
    });

    const planRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ restorePointId: "rp-restart-safe-1" }),
    });
    assert.equal(planRes.status, 200, "Recovery's own API must be reachable while blocked to even attempt this");
    const planBody = (await planRes.json()) as { planId: string; planHash: string };

    const confirmRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash, disclosureAcknowledged: true }),
    });
    assert.equal(confirmRes.status, 200);
    const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };

    const executeRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/execute`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ confirmationToken, restorePointId: "rp-restart-safe-1" }),
    });
    assert.equal(executeRes.status, 200);
    const executed = (await executeRes.json()) as { restartRequired: boolean };
    assert.equal(executed.restartRequired, true, "the real SqliteDbOpsAdapter always reports restartRequired=true for a file-backed db -- this test's premise depends on that being true");

    // Round-6 fix: the RUNNING process must stay blocked -- its open file descriptor still points
    // at the old, now-unlinked pre-restore inode (db-ops.ts's own doc comment on
    // restoreFromArtifact explains why) until an actual restart. Clearing the gate here would let
    // normal traffic read/write against stale data that vanishes once the process eventually
    // restarts and reopens the real restored file.
    assert.equal(await deps.siteStatusRepo.get(deps.workspaceId), "BLOCKED_PENDING_RECOVERY", "must NOT unblock in-process when restartRequired is true -- the old connection is still serving stale data");

    const normalAdminRouteBeforeRestart = await fetch(`${baseUrl}/api/admin/v1/database/timeline`, { headers: { cookie } });
    assert.equal(normalAdminRouteBeforeRestart.status, 503, "normal traffic must stay refused until the process actually restarts, even though the restore ceremony itself succeeded");

    // The DURABLE half must still be resolved -- a fresh boot (the real restart the block is
    // waiting for) against the same sidecar must resolve to SERVING, not re-detect the
    // now-resolved migration and re-block. Await identityReady first, same reasoning as the
    // sibling "second boot" test above (avoids an unrelated identity-seed race, not what this test
    // is proving).
    await deps.identityReady;
    const rebootDeps = createSqliteRouteDeps(dbPath);
    const rebootResult = await runBootLifecycle(buildBootModules(rebootDeps, { useMemory: false, defaultContentDbPath: () => dbPath }));
    assert.equal(rebootResult.ok, true);
    assert.equal(await rebootDeps.siteStatusRepo.get(rebootDeps.workspaceId), "SERVING", "the resolution must survive a reboot -- the exit is durable, not just an in-process flag flip");

    // Round-7 confirmation (codex, non-blocking note R7-N1): assert the actual HTTP-level
    // consequence too, not just the internal siteStatus field -- a real request against a fresh
    // app built from the rebooted deps must succeed.
    const rebootApp = createApp(rebootDeps);
    const rebootBaseUrl = await startTestServer(rebootApp, t);
    const rebootCookie = await loginAsOwner(rebootBaseUrl);
    const normalAdminRouteAfterReboot = await fetch(`${rebootBaseUrl}/api/admin/v1/database/timeline`, { headers: { cookie: rebootCookie } });
    assert.equal(normalAdminRouteAfterReboot.status, 200, "normal traffic must actually succeed over real HTTP after the reboot, not just report SERVING internally");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a clean sidecar (no non-terminal migration_runs row) boots normally: siteStatus stays SERVING", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-migration-reconcile-clean-"));
  const dbPath = path.join(dir, "content.db");
  try {
    const deps = createSqliteRouteDeps(dbPath);
    const result = await runBootLifecycle(buildBootModules(deps, { useMemory: false, defaultContentDbPath: () => dbPath }));

    const reconciliation = result.modules.find((m) => m.name === "database-migration-reconciliation");
    assert.equal(reconciliation?.lifecycle.status, "ready");

    const siteStatus = await deps.siteStatusRepo.get(deps.workspaceId);
    assert.equal(siteStatus, "SERVING");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
