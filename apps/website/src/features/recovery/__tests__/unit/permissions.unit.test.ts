import assert from "node:assert/strict";
import test from "node:test";

import { confirmRestore, executeRestore } from "../../recovery-orchestrator.js";
import { createRestorePoint } from "../../restore-points.js";
import { buildRecoveryRegistrations } from "../../tool-registrations.js";
import { buildRestoreHooks, toRecoveryResult } from "../../gated-hooks.js";
import { confirm, execute } from "../../../../contracts/core/gated-mutations/gateway.js";
import { InMemoryTokenStore } from "../../../../contracts/core/gated-mutations/token.js";
import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";

/**
 * @file REQ-02 (SPEC-019) — permission gating: backup.read / backup.create / backup.restore.
 *
 * Covers: AC-03 (backup.read holder sees list/status, no mutating control enabled — asserted here
 * at the write-path level: no mutation succeeds for a read-only principal), AC-04 (missing
 * backup.create rejects restore-point creation), AC-05 (missing backup.restore rejects
 * confirm/execute, per SPEC-016 REQ-10/REQ-11).
 */

const alwaysDeny = async () => ({ allowed: false, reason: "insufficient_permission" });
const NOW = "2026-07-15T00:00:00.000Z";
const clock = { nowIso: () => NOW };
let idCounter = 0;
const ids = { newId: () => `id-${++idCounter}` };

test("AC-03: a principal holding only backup.read can still call read-only actions (list/capabilities) while every mutating action above is denied", async () => {
  const alwaysAllowReadOnly = async (params: { permission: string }) => ({
    allowed: params.permission === "backup.read",
    reason: params.permission === "backup.read" ? "matched" : "insufficient_permission",
  });
  const repo = { save: async () => undefined, findByIdempotencyKey: async () => null, rows: [] as unknown[] };
  const gateway = { plan: async () => ({ ok: true, value: {} }) };

  const createResult = await createRestorePoint({
    deps: { repo, clock, ids, authorize: alwaysAllowReadOnly, gateway },
    input: { principalId: "user-read-only", principalKind: "user", idempotencyKey: "key-perm-0", trigger: "manual", operationInFlight: false },
  });

  assert.equal(createResult.ok, false, "backup.read alone must never be sufficient for a mutating action (REQ-02)");
  if (!createResult.ok) assert.equal(createResult.error.code, "FORBIDDEN");
});

test("AC-04: a principal without backup.create cannot create a restore point", async () => {
  const repo = { save: async () => undefined, findByIdempotencyKey: async () => null, rows: [] as unknown[] };
  const gateway = { plan: async () => ({ ok: true, value: {} }) };

  const checks: unknown[] = [];
  const result = await createRestorePoint({
    deps: { repo, clock, ids, authorize: async params => { checks.push(params); return alwaysDeny(); }, gateway },
    input: { principalId: "user-read-only", principalKind: "user", idempotencyKey: "key-perm-1", trigger: "manual", operationInFlight: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
  assert.deepEqual(checks, [{ principalId: "user-read-only", permission: "backup.create" }]);
});

test("AC-05: the real restore gateway requires backup.restore for confirm and execute and mints no denied token", async () => {
  const checks: unknown[] = [];
  const tokens = new InMemoryTokenStore();
  let restored = 0;
  const pinnedClock = { nowMs: () => Date.parse(NOW) };
  const hooks = buildRestoreHooks({
    workspaceId: "ws", actorId: "user-read-only", restorePointId: "rp-1", clock: pinnedClock, idGen: ids,
    restorePointsRepo: { list: async () => [{ id: "rp-1", createdAt: NOW, artifactRef: "/snapshot" }] },
    dbOps: { restoreFromArtifact: async () => { restored++; return { restartRequired: false }; } },
    databaseLedgerRepo: { append: async () => { throw new Error("denied restore must not record success"); } },
    migrationRunsRepo: { findNonTerminalForSite: async () => null, markResolved: async () => {} },
    siteStatus: { get: async () => "SERVING", set: async () => {} },
  });
  const gatewayDeps = { clock: pinnedClock, idGen: ids, tokens, authorize: alwaysDeny,
    authorizeInstance: async (params: { principalId: string; permission: string }) => {
      checks.push(params); return { allowed: params.permission === "backup.read", reason: "insufficient_permission" };
    } };
  const gateway = {
    confirm: (params: { planId: string; planHash: string }) => toRecoveryResult({ run: () => confirm({
      ...params, deps: gatewayDeps, principalId: "user-read-only", principalKind: "user", hooks,
    }) }, {}),
    execute: (params: { confirmationToken: string }) => toRecoveryResult({ run: () => execute({
      ...params, deps: gatewayDeps, principalId: "user-read-only", principalKind: "user", hooks,
    }) }, {}),
  };
  const result = await confirmRestore({ deps: { gateway }, input: {
    principalId: "user-read-only", principalKind: "user", planId: "plan-1", planHash: "hash-1", disclosureAcknowledged: true,
  } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "NOT_AUTHORIZED");
  assert.equal(await tokens.count(), 0);
  const executed = await executeRestore({ deps: { gateway, clock: pinnedClock, operationLock: { acquireOperationLock, releaseOperationLock } },
    input: { principalId: "user-read-only", principalKind: "user", confirmationToken: "unissued", siteId: "permission-site" } });
  assert.equal(executed.ok, false);
  if (!executed.ok) assert.equal(executed.error.code, "NOT_AUTHORIZED");
  assert.deepEqual(checks, [
    { principalId: "user-read-only", permission: "backup.restore" },
    { principalId: "user-read-only", permission: "backup.restore" },
  ]);
  assert.equal(restored, 0);
});

test("a backup.read principal can use list and capabilities handlers but cannot start a restore", async () => {
  const checks: string[] = [];
  let surfacesOpened = 0;
  const deps = {
    workspaceId: "ws", authorize: async (params: { permission: string }) => {
      checks.push(params.permission);
      return { allowed: params.permission === "backup.read", reason: "insufficient_permission" };
    },
    restorePointsRepo: { list: async () => [] },
    dbOps: { getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }) },
  };
  const registrations = buildRecoveryRegistrations(deps as never, { surfaceExchanges: { open: () => { surfacesOpened++; throw new Error("denied"); } } } as never);
  const handler = (id: string) => registrations.find(r => r.descriptor.id === id)!.handler;
  const ctx = { principal: { id: "user-read-only" }, input: {}, signal: new AbortController().signal };
  assert.deepEqual(await handler("backup_list_restore_points")(ctx as never), { items: [] });
  assert.deepEqual(await handler("backup_get_capabilities")(ctx as never), { costClass: "cheap", kind: "file-snapshot" });
  await assert.rejects(handler("backup_execute_restore")({ ...ctx, input: { restorePointId: "rp-1" } } as never), /backup.restore/);
  assert.deepEqual(checks, ["backup.read", "backup.read", "backup.restore"]);
  assert.equal(surfacesOpened, 0);
});
