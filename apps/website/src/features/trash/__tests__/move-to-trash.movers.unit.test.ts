import assert from "node:assert/strict";
import test from "node:test";

import type { TrashPort } from "@jini-ai/cms/trash";

import { moveToTrash, type MoveToTrashOutcome, type TrashKindMover } from "../move-to-trash.js";
import type { TrashAuthorizeFn } from "../permissions.js";
import type { TrashEntry, TrashRegistry } from "../registry.js";
import type { TrashDb } from "../db-port.js";

/**
 * @file DI-fake tests for the two `moveToTrash` paths the SQLite-backed `move-to-trash.test.ts` does
 * not reach (Stryker lane L14): the `deps.movers` hand-over (a theme folder, a hermetic memory form)
 * and the null-version / null-subtitle snapshot normalisation.
 */

const WS = "ws-1";
const AT = "2026-10-25T00:00:00.000Z";
const ACTOR = { principalId: "p-1" };

function recordingAuthorize(allowed: boolean): { authorize: TrashAuthorizeFn; calls: Parameters<TrashAuthorizeFn>[0][] } {
  const calls: Parameters<TrashAuthorizeFn>[0][] = [];
  return { calls, authorize: async (params) => (calls.push(params), { allowed, reason: allowed ? "ok" : "no" }) };
}

const throwingDb = new Proxy({}, { get() { throw new Error("a mover-owned kind must never read deps.db"); } }) as TrashDb;
const throwingTrash = new Proxy({}, { get() { throw new Error("a mover-owned kind must never call deps.trash"); } }) as TrashPort;

function mover(outcome: MoveToTrashOutcome): TrashKindMover & { calls: unknown[] } {
  const calls: unknown[] = [];
  return { permission: "theme.manage", calls, move: async (args) => (calls.push(args), outcome) };
}

const FORM_ENTRY = {
  entityType: "form", label: "Form", permission: "admin.forms.manage", table: "form_definitions", idColumn: "id",
  workspaceColumn: "workspace_id", marker: { kind: "timestamp", column: "deleted_at" }, versionColumn: "version",
  display: { title: "form_definitions.name", subtitle: "form_definitions.slug" },
} as unknown as TrashEntry;

test("a mover-owned kind is authorized against the MOVER's permission (not a registry entry's) and refused as forbidden", async () => {
  const m = mover({ ok: true, version: 1 });
  const { authorize, calls } = recordingAuthorize(false);
  const registry: TrashRegistry = new Map([["theme", { ...FORM_ENTRY, entityType: "theme", permission: "registry.permission" }]]);
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "theme", entityId: "t-1", actor: ACTOR },
    { registry, trash: throwingTrash, db: throwingDb, authorize, clock: { nowIso: () => AT }, movers: new Map([["theme", m]]) },
  );
  assert.deepEqual(outcome, { ok: false, reason: "forbidden", permission: "theme.manage" });
  assert.deepEqual(calls, [{ principalId: "p-1", permission: "theme.manage", workspaceId: WS, entityType: "theme", entityId: "t-1" }]);
  assert.deepEqual(m.calls, [], "a forbidden caller never reaches the mover");
});

for (const outcome of [
  { ok: true, version: 7 },
  { ok: false, reason: "not-found" },
  { ok: false, reason: "blocked", code: "IN_USE", count: 3 },
] as MoveToTrashOutcome[]) {
  test(`an allowed mover-owned kind hands the move over and returns its outcome verbatim: ${JSON.stringify(outcome)}`, async () => {
    const m = mover(outcome);
    const { authorize } = recordingAuthorize(true);
    const result = await moveToTrash(
      { workspaceId: WS, entityType: "theme", entityId: "t-2", actor: ACTOR, expectedVersion: 99 },
      { registry: new Map(), trash: throwingTrash, db: throwingDb, authorize, clock: { nowIso: () => AT }, movers: new Map([["theme", m]]) },
    );
    assert.deepEqual(result, outcome);
    assert.deepEqual(m.calls, [{ workspaceId: WS, entityId: "t-2", actor: ACTOR }]);
  });
}

test("a kind absent from a non-empty movers map still resolves through the registry", async () => {
  const { authorize } = recordingAuthorize(true);
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "gizmo", entityId: "g", actor: ACTOR },
    { registry: new Map(), trash: throwingTrash, db: throwingDb, authorize, clock: { nowIso: () => AT }, movers: new Map([["theme", mover({ ok: true, version: 1 })]]) },
  );
  assert.deepEqual(outcome, { ok: false, reason: "unknown-type" });
});

function snapshotDb(row: Record<string, unknown> | undefined): TrashDb {
  return { run: async () => row } as unknown as TrashDb;
}

test("a versioned row whose version reads NULL: expectedVersion null passes, the write carries expectedVersion null and subtitle null", async () => {
  const writes: Parameters<TrashPort["trash"]>[0][] = [];
  const trash = { trash: async (args: Parameters<TrashPort["trash"]>[0]) => (writes.push(args), { ok: true as const, version: null }) } as unknown as TrashPort;
  const { authorize } = recordingAuthorize(true);
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: "f-1", actor: ACTOR, expectedVersion: null },
    { registry: new Map([["form", FORM_ENTRY]]), trash, db: snapshotDb({ title: "Form", version: null }), authorize, clock: { nowIso: () => AT } },
  );
  assert.deepEqual(outcome, { ok: true, version: null });
  assert.deepEqual(writes, [{ workspaceId: WS, entityType: "form", entityId: "f-1", actor: ACTOR, display: { title: "Form", subtitle: null }, at: AT, expectedVersion: null }]);
});

test("a versioned row whose version column is absent from the snapshot compares as null: expectedVersion 0 is version-changed", async () => {
  const { authorize } = recordingAuthorize(true);
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: "f-1", actor: ACTOR, expectedVersion: 0 },
    { registry: new Map([["form", FORM_ENTRY]]), trash: throwingTrash, db: snapshotDb({ title: "Form" }), authorize, clock: { nowIso: () => AT } },
  );
  assert.deepEqual(outcome, { ok: false, reason: "version-changed" });
});
