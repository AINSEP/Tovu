import assert from "node:assert/strict";
import test from "node:test";

import { eachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlSiteTitlePreservationStore } from "../site-title-preservation.js";
import { InMemorySiteTitlePreservationStore, type SiteTitlePreservationStorePort } from "../site-title.js";

/**
 * @file SPEC-050 (NC-3 = A): both `SiteTitlePreservationStorePort` adapters honour one contract, the
 * SQL one on SQLite and PGlite. The SQL fixture inserts its recorded workspaces the raw way the
 * marker migration does; the in-memory store takes them as constructor input.
 */

const adapters: Array<[string, (recorded: string[]) => SiteTitlePreservationStorePort]> = [
  ["in-memory", (recorded) => new InMemorySiteTitlePreservationStore(recorded)],
  // The one Kysely body on every dialect (storage plan §4), seeded the raw way the marker migration does.
  ...eachDialect({
    tables: ["site_title_preexisting_workspaces"],
    make: (kernel) => (recorded: string[]) =>
      new SqlSiteTitlePreservationStore(
        heldUntil(
          kernel,
          (async () => {
            for (const workspaceId of recorded) {
              await kernel.run((db) =>
                db.insertInto("site_title_preexisting_workspaces").values({ workspace_id: workspaceId, preserved_at: null }).execute()
              );
            }
          })()
        )
      ),
  }).map((each): [string, (recorded: string[]) => SiteTitlePreservationStorePort] => [each.name, (recorded) => each.make()(recorded)]),
];

for (const [name, makeStore] of adapters) {
  test(`${name}: lists every recorded, unresolved workspace, sorted by id`, async () => {
    const store = makeStore(["ws-b", "ws-a"]);
    assert.deepEqual(await store.listPendingWorkspaceIds(), ["ws-a", "ws-b"]);
    assert.deepEqual(await makeStore([]).listPendingWorkspaceIds(), []);
  });

  test(`${name}: isPending is true only for a recorded, unresolved workspace`, async () => {
    const store = makeStore(["ws-a"]);
    assert.equal(await store.isPending("ws-a"), true);
    assert.equal(await store.isPending("ws-never-recorded"), false);
  });

  test(`${name}: markPreserved resolves one workspace, leaves the rest pending, and is a no-op when repeated or unrecorded`, async () => {
    const store = makeStore(["ws-a", "ws-b"]);

    await store.markPreserved({ workspaceId: "ws-a", preservedAt: "2026-09-12T00:00:00.000Z" });
    await store.markPreserved({ workspaceId: "ws-a", preservedAt: "2026-09-13T00:00:00.000Z" });
    await store.markPreserved({ workspaceId: "ws-never-recorded", preservedAt: "2026-09-12T00:00:00.000Z" });

    assert.equal(await store.isPending("ws-a"), false);
    assert.equal(await store.isPending("ws-b"), true);
    assert.equal(await store.isPending("ws-never-recorded"), false, "marking an unrecorded id must not record it");
    assert.deepEqual(await store.listPendingWorkspaceIds(), ["ws-b"]);
  });
}
