import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { eachDialect } from "../../kernel/__tests__/dialect-matrix.js";
import { createBlobGcJournal } from "../blob-gc-journal.js";

const WS = "00000000-0000-4000-8000-000000000001";

for (const adapter of eachDialect({ tables: ["blob_gc_journal", "asset_blobs"], make: kernel => kernel as KyselyKernel<unknown> })) {
  test(`[${adapter.name}] journal keeps exact provenance and refuses a row without it`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => kernel.close());
    for (const [sha, status] of [["aaa", "tombstoned"], ["bbb", "tombstoned"], ["ccc", "active"]] as const) {
      await kernel.execute(sql`INSERT INTO asset_blobs (id, workspace_id, sha256, storage_key, created_by_principal, created_at, status) VALUES (${`id-${sha}`}, ${WS}, ${sha}, ${`media/${sha}`}, 'owner', '2026-01-01T00:00:00.000Z', ${status})`);
    }
    const journal = createBlobGcJournal({ kernel }, {});
    const base = { id: "media/aaa", workspaceId: WS, sha256: "aaa", storageKey: "media/aaa", journaledAt: "2026-02-01T00:00:00.000Z" };
    await assert.rejects(journal.save(base), /exact reason/);
    await journal.save({ ...base, kind: "original", reason: "trash-ttl" });
    assert.deepEqual(await journal.list({ workspaceId: WS }), [{ ...base, kind: "original", reason: "trash-ttl" }]);
    assert.deepEqual(await journal.listLegacyOrphans({ workspaceId: WS }), [{ sha256: "bbb", storageKey: "media/bbb" }]);
    await journal.remove({ workspaceId: WS, id: "media/aaa" });
    assert.deepEqual(await journal.list({ workspaceId: WS }), []);
  });
}
