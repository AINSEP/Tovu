import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import { openContentDb } from "#src/platform/db/sqlite/content-db";

import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { bindRemoveEntity, createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashMarkerResult, TrashPort } from "../ports.js";

/**
 * @file `priorMarker` (migration 0072) round-trips through the generic Trash store: `trash()`
 * writes whatever the adapter's `hide` reports, and `restore()` reads the stored value back and
 * hands it to the adapter's `unhide`.
 *
 * No G1a adapter is a status-marker adapter yet — that lands with `table-adapter.ts` (G1b/G2), when
 * `menu`/`term`/`taxonomy` register. This suite exercises the wiring itself (write-service + the
 * `prior_marker` column) with a stub adapter that behaves like a future status-marker one, so the
 * plumbing is proven before any real status adapter exists.
 */

const WS = "workspace-1";
const ACTOR = { principalId: "principal-1" };
const AT = "2026-09-21T12:00:00.000Z";
const STUB_ENTITY_TYPE = "stub-status";

function harness(
  hideResult: TrashMarkerResult,
  onUnhide: (required: { priorMarker?: string | null }) => void = () => {}
): { trash: TrashPort; client: Database.Database } {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");

  const adapter: TrashAdapter = {
    entityType: STUB_ENTITY_TYPE,
    async hide() {
      return hideResult;
    },
    async unhide(required) {
      onUnhide(required);
      return { ok: true, version: (required.expectedVersion ?? 0) + 1 };
    },
    async purge() {
      return "purged";
    },
  };

  const repo = new SqliteTrashRepo(client);
  let seq = 0;
  const trash = createTrashService({
    repo,
    adapters: new Map([[STUB_ENTITY_TYPE, adapter]]),
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(client),
  });
  return { trash, client };
}

test("trash() persists the adapter's priorMarker on the TrashItem row", async () => {
  const { trash } = harness({ ok: true, version: 2, priorMarker: "draft" });
  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-1",
    actor: ACTOR,
    display: { title: "Entity e-1" },
    at: AT,
    expectedVersion: 1,
  });

  const page = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(page.items[0]?.priorMarker, "draft");
});

test("trash() stores null, not undefined, when the adapter's hide result carries no priorMarker key", async () => {
  const { trash } = harness({ ok: true, version: 2 });
  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-2",
    actor: ACTOR,
    display: { title: "Entity e-2" },
    at: AT,
    expectedVersion: 1,
  });

  const page = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(page.items[0]?.priorMarker, null);
});

test("restore() passes the trashed row's stored priorMarker back into the adapter's unhide", async () => {
  const seen: { priorMarker?: string | null }[] = [];
  const { trash } = harness({ ok: true, version: 2, priorMarker: "draft" }, (required) => seen.push(required));

  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-3",
    actor: ACTOR,
    display: { title: "Entity e-3" },
    at: AT,
    expectedVersion: 1,
  });

  const restored = await trash.restore({ workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "e-3", at: AT });
  assert.equal(restored, "restored");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.priorMarker, "draft");
});

test("trash() stores a caller-supplied priorMarker when the adapter reports none (an adopted legacy widget)", async () => {
  const { trash } = harness({ ok: true, version: 2 });
  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-4",
    actor: ACTOR,
    display: { title: "Entity e-4" },
    at: AT,
    expectedVersion: 1,
    priorMarker: "active",
  });

  const page = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(page.items[0]?.priorMarker, "active");
});

test("trash() keeps the adapter's own priorMarker over a caller-supplied one — the marker column is the truth", async () => {
  const { trash } = harness({ ok: true, version: 2, priorMarker: "draft" });
  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-5",
    actor: ACTOR,
    display: { title: "Entity e-5" },
    at: AT,
    expectedVersion: 1,
    priorMarker: "active",
  });

  const page = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(page.items[0]?.priorMarker, "draft");
});

test("bindRemoveEntity passes a domain's priorMarker through, and restore hands it back to unhide", async () => {
  const seen: { priorMarker?: string | null }[] = [];
  const { trash } = harness({ ok: true, version: 2 }, (required) => seen.push(required));
  const remove = bindRemoveEntity(trash, STUB_ENTITY_TYPE);

  const removed = await remove({
    workspaceId: WS,
    id: "e-6",
    display: { title: "Entity e-6" },
    at: AT,
    expectedVersion: 1,
    actor: ACTOR,
    priorMarker: "active",
  });
  assert.deepEqual(removed, { ok: true, version: 2 });

  assert.equal(await trash.restore({ workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "e-6", at: AT }), "restored");
  assert.equal(seen[0]?.priorMarker, "active");
});
