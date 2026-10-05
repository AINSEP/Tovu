// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { bootSite, expectJson, send, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #10 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — restore points and the
 * recovery restore ceremony (`POST /api/admin/v1/recovery/restore/{plan,confirm,execute}`) through
 * the REAL site composition.
 *
 * `recovery-restore-routes.test.ts` runs the ceremony on the hermetic root, whose `dbOps` is an
 * in-memory adapter that never touches a file. On a real SQLite site `SqliteDbOpsAdapter` takes an
 * online backup of `content.db` and a restore swaps that file under the running process
 * (`restartRequired: true`), with the restore-point list and the ledger living in the separate
 * `ops/` journal db. This proves the physical swap: after execute, a FRESH connection to
 * `content.db` sees the snapshot's rows, not the rows written after it. On PGlite the restore-point
 * mechanism is reported `unavailable` (`PostgresDbOpsAdapter`): capture and plan must both refuse.
 */

interface PlanBody {
  domain: string;
  planId: string;
  planHash: string;
  details: unknown;
}

async function createPost(site: BootedSite, title: string): Promise<string> {
  return (await expectJson<{ post: { id: string } }>(await send(site, "POST", `${site.ws}/posts`, { title, status: "draft" }), 201)).post.id;
}

/** Post ids read through a NEW connection to the file on disk, not the process's open handle. */
function postIdsOnDisk(site: BootedSite): string[] {
  const db = new Database(path.join(site.siteDir, "content.db"), { fileMustExist: true });
  try {
    return (db.prepare("SELECT id FROM posts").all() as Array<{ id: string }>).map((row) => row.id);
  } finally {
    db.close();
  }
}

test("[unrun] recovery restore [sqlite]: a manual restore point is captured, listed on both faces, and a repeated idempotencyKey returns the same point", async (t) => {
  const site = await bootSite(t, "sqlite");
  const first = await expectJson<{ restorePoint: { id: string; costClass: string; kind: string } }>(
    await send(site, "POST", "/api/admin/v1/database/restore-points", { idempotencyKey: "unrun-manual-1" }),
    201
  );
  assert.deepEqual({ costClass: first.restorePoint.costClass, kind: first.restorePoint.kind }, { costClass: "cheap", kind: "file-snapshot" });

  const again = await expectJson<{ restorePoint: { id: string } }>(
    await send(site, "POST", "/api/admin/v1/database/restore-points", { idempotencyKey: "unrun-manual-1" }),
    201
  );
  assert.equal(again.restorePoint.id, first.restorePoint.id, "a retry never captures a second backup");

  for (const face of ["/api/admin/v1/database/restore-points", "/api/admin/v1/recovery/restore-points"]) {
    const listed = await expectJson<{ items: Array<{ id: string; trigger: string }> }>(await send(site, "GET", face), 200);
    assert.deepEqual(listed.items.filter((item) => item.id === first.restorePoint.id).map((item) => item.trigger), ["manual"], face);
  }
});

test("[unrun] recovery restore [sqlite]: plan → confirm → execute swaps content.db back to the snapshot and records restore.executed", async (t) => {
  const site = await bootSite(t, "sqlite");
  const before = await createPost(site, "Written before the snapshot");
  const captured = await expectJson<{ restorePoint: { id: string } }>(await send(site, "POST", "/api/admin/v1/database/restore-points", {}), 201);
  const restorePointId = captured.restorePoint.id;
  const after = await createPost(site, "Written after the snapshot");
  assert.deepEqual([before, after].map((id) => postIdsOnDisk(site).includes(id)), [true, true]);

  const plan = await expectJson<PlanBody>(await send(site, "POST", "/api/admin/v1/recovery/restore/plan", { restorePointId }), 200);
  assert.equal(plan.domain, "backup.restore");
  assert.deepEqual(plan.details, { restorePointId });

  const unacknowledged = await expectJson<{ error: string; code: string }>(
    await send(site, "POST", "/api/admin/v1/recovery/restore/confirm", { planId: plan.planId, planHash: plan.planHash }),
    400
  );
  assert.deepEqual(unacknowledged, {
    error: "disclosureAcknowledged must be exactly true before a restore confirmation token may be minted (INV-02)",
    code: "VALIDATION_ERROR",
  });

  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
    await send(site, "POST", "/api/admin/v1/recovery/restore/confirm", { planId: plan.planId, planHash: plan.planHash, disclosureAcknowledged: true }),
    200
  );

  const executed = await expectJson<{ restoreRunId: string; state: string; restartRequired: boolean; databaseTimelineDeepLink: unknown }>(
    await send(site, "POST", "/api/admin/v1/recovery/restore/execute", { confirmationToken, restorePointId }),
    200
  );
  assert.equal(executed.state, "RESTORED");
  assert.equal(executed.restartRequired, true, "a file-backed restore always needs a restart");
  assert.deepEqual(executed.databaseTimelineDeepLink, { v: 1, siteId: site.deps.workspaceId, intent: "view" });

  const onDisk = postIdsOnDisk(site);
  assert.deepEqual([before, after].map((id) => onDisk.includes(id)), [true, false], "content.db on disk is now the snapshot");

  const ledger = await site.deps.databaseLedgerRepo.query({ limit: 50 });
  const restored = ledger.items.filter((row) => row.kind === "restore.executed" && row.restorePointId === restorePointId);
  assert.equal(restored.length, 1, JSON.stringify(ledger.items));
  assert.equal(restored[0].outcome, "success");
});

test("[unrun] recovery restore [sqlite]: executing with a different restorePointId than the one confirmed is 409 PLAN_STALE and swaps nothing", async (t) => {
  const site = await bootSite(t, "sqlite");
  const captured = await expectJson<{ restorePoint: { id: string } }>(await send(site, "POST", "/api/admin/v1/database/restore-points", {}), 201);
  const after = await createPost(site, "Must survive");

  const plan = await expectJson<PlanBody>(await send(site, "POST", "/api/admin/v1/recovery/restore/plan", { restorePointId: captured.restorePoint.id }), 200);
  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
    await send(site, "POST", "/api/admin/v1/recovery/restore/confirm", { planId: plan.planId, planHash: plan.planHash, disclosureAcknowledged: true }),
    200
  );
  const stale = await expectJson<{ code: string }>(
    await send(site, "POST", "/api/admin/v1/recovery/restore/execute", { confirmationToken, restorePointId: "unrun-other-point" }),
    409
  );
  assert.equal(stale.code, "PLAN_STALE");
  assert.equal(postIdsOnDisk(site).includes(after), true);
});

test("[unrun] recovery restore [pglite]: capturing a restore point is 409 RESTORE_POINT_UNAVAILABLE and restore plan is 409 COST_CLASS_UNAVAILABLE", async (t) => {
  const site = await bootSite(t, "pglite");
  const capture = await expectJson<{ error: string; code: string }>(await send(site, "POST", "/api/admin/v1/database/restore-points", {}), 409);
  assert.deepEqual(capture, {
    error: "no restore-point mechanism is available for the source; migration is refused with no attestation override",
    code: "RESTORE_POINT_UNAVAILABLE",
  });
  const listed = await expectJson<{ items: unknown[] }>(await send(site, "GET", "/api/admin/v1/recovery/restore-points"), 200);
  assert.deepEqual(listed.items, []);

  const plan = await expectJson<{ error: string; code: string }>(
    await send(site, "POST", "/api/admin/v1/recovery/restore/plan", { restorePointId: "unrun-any" }),
    409
  );
  assert.deepEqual(plan, {
    error: "restore point 'unrun-any' has no available restore mechanism for this site (ADR-041 §2, no attestation override)",
    code: "COST_CLASS_UNAVAILABLE",
  });
});
