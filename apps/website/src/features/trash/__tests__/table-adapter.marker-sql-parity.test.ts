import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { TrashMarkerResult, TrashPurgeOutcome } from "@jini-ai/cms/trash";
import { compareAndDelete, flipMarker } from "../adapters/marker-sql.js";
import { buildTrashRegistry } from "../registry.js";
import { createTableTrashAdapter } from "../table-adapter.js";

/**
 * @file S4b T0 (test only): the bespoke `flipMarker` / `compareAndDelete` pair of `adapters/marker-sql.ts` and the generic
 * table adapter run the same scenarios over the same `form_definitions` fixture. The table below is committed as the
 * expectations; it decides S4d (which bespoke adapter may be replaced by a registry entry): a row where the two columns
 * differ is a difference S4d must record, not hide. Identical rows are the ones S4d may rely on.
 */

const WS = "ws-1";
const AT = "2026-10-10T00:00:00.000Z";

async function fixture(row: { deletedAt: string | null; version: number } | null): Promise<ContentKernel> {
  const kernel = freshSqliteContentKernel();
  await kernel.run((db) => db.insertInto("workspaces").values({ id: WS, name: WS, slug: WS, created_at: AT }).execute());
  if (row) {
    await kernel.run((db) =>
      db
        .insertInto("form_definitions")
        .values({ id: "f1", workspace_id: WS, name: "F", slug: "f", fields_json: "{}", notify_json: "{}", status: "active", created_at: AT, updated_at: AT, deleted_at: row.deletedAt, version: row.version })
        .execute()
    );
  }
  return kernel;
}

const bespokeFlip = (kernel: ContentKernel, to: "hide" | "unhide", expectedVersion: number | null) =>
  flipMarker({
    kernel,
    table: "form_definitions",
    set: { deleted_at: to === "hide" ? AT : null, updated_at: AT },
    from: to === "hide" ? { column: "deleted_at", op: "is", value: null } : { column: "deleted_at", op: "is not", value: null },
    workspaceId: WS,
    entityId: "f1",
    expectedVersion,
  });

const generic = (kernel: ContentKernel) => createTableTrashAdapter({ entry: buildTrashRegistry().get("form")!, db: kernel });

type Scenario = { name: string; row: { deletedAt: string | null; version: number } | null; expectedVersion: number | null };

const LIVE = { deletedAt: null, version: 3 };
const TRASHED = { deletedAt: AT, version: 3 };
const FLIPS: Array<Scenario & { op: "hide" | "unhide"; bespoke: TrashMarkerResult; table: TrashMarkerResult }> = [
  { op: "hide", name: "missing row", row: null, expectedVersion: 3, bespoke: { ok: false, reason: "not-found" }, table: { ok: false, reason: "not-found" } },
  { op: "hide", name: "live row at the matching version", row: LIVE, expectedVersion: 3, bespoke: { ok: true, version: 4 }, table: { ok: true, version: 4 } },
  { op: "hide", name: "live row, null version", row: LIVE, expectedVersion: null, bespoke: { ok: true, version: 4 }, table: { ok: true, version: 4 } },
  { op: "hide", name: "live row at a stale version", row: LIVE, expectedVersion: 2, bespoke: { ok: false, reason: "version-changed" }, table: { ok: false, reason: "version-changed" } },
  { op: "hide", name: "trashed row at a stale version", row: TRASHED, expectedVersion: 2, bespoke: { ok: false, reason: "version-changed" }, table: { ok: false, reason: "version-changed" } },
  // DIFFERENCE: the bespoke flip reports the idempotent case without the `noop` flag the follow-up runner reads.
  { op: "hide", name: "trashed row, matching version (idempotent)", row: TRASHED, expectedVersion: 3, bespoke: { ok: true, version: 3 }, table: { ok: true, version: 3, noop: true } },
  { op: "unhide", name: "trashed row at the matching version", row: TRASHED, expectedVersion: 3, bespoke: { ok: true, version: 4 }, table: { ok: true, version: 4 } },
  { op: "unhide", name: "live row at a stale version", row: LIVE, expectedVersion: 2, bespoke: { ok: false, reason: "version-changed" }, table: { ok: false, reason: "version-changed" } },
  { op: "unhide", name: "live row, matching version (idempotent)", row: LIVE, expectedVersion: 3, bespoke: { ok: true, version: 3 }, table: { ok: true, version: 3, noop: true } },
];

for (const s of FLIPS) {
  test(`parity ${s.op}: ${s.name}`, async () => {
    assert.deepEqual(await bespokeFlip(await fixture(s.row), s.op, s.expectedVersion), s.bespoke, "bespoke flipMarker");
    const kernel = await fixture(s.row);
    const args = { workspaceId: WS, entityId: "f1", at: AT, expectedVersion: s.expectedVersion };
    assert.deepEqual(await generic(kernel)[s.op](args), s.table, "table adapter");
  });
}

const PURGES: Array<Scenario & { bespoke: TrashPurgeOutcome; table: TrashPurgeOutcome }> = [
  { name: "missing row", row: null, expectedVersion: 3, bespoke: "already-gone", table: "already-gone" },
  { name: "trashed row at the matching version", row: TRASHED, expectedVersion: 3, bespoke: "purged", table: "purged" },
  { name: "trashed row, null version", row: TRASHED, expectedVersion: null, bespoke: "purged", table: "purged" },
  { name: "trashed row at a stale version", row: TRASHED, expectedVersion: 2, bespoke: "version-changed", table: "version-changed" },
  // DIFFERENCE (decision 6): the bespoke delete has no live check; the table adapter never purges a live row.
  { name: "LIVE row at the matching version", row: LIVE, expectedVersion: 3, bespoke: "purged", table: "version-changed" },
];

for (const s of PURGES) {
  test(`parity purge: ${s.name}`, async () => {
    const bespoke = await fixture(s.row);
    assert.equal(await compareAndDelete({ kernel: bespoke, table: "form_definitions", workspaceId: WS, entityId: "f1", expectedVersion: s.expectedVersion }), s.bespoke, "bespoke compareAndDelete");
    const kernel = await fixture(s.row);
    assert.equal(await generic(kernel).purge({ workspaceId: WS, entityId: "f1", expectedVersion: s.expectedVersion }), s.table, "table adapter");
  });
}
