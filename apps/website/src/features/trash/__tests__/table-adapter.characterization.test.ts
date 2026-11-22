import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { TrashEntry } from "@jini-ai/cms/trash";
import { buildTrashRegistry } from "@jini-ai/cms/trash/site/registry";
import { createTableTrashAdapter } from "@jini-ai/cms/trash/sql";
import { TRASH_TABLES } from "#src/features/trash/repo.sqlite";

/**
 * @file S4b T0: the table adapter's contracts that no other test pins, on the unmoved code, before it is partitioned
 * and moved to Jini `@jini-ai/cms/trash/sql`. Lock order (transaction, then the row's lock key, then the first read) for
 * hide, unhide and purge; the database is opened on first use; an idempotent hide never evaluates the blocker; a purge
 * claim holds the marker as well as the version. Each test names the one-line mutation that turns it red.
 */

const WS = "ws-1";
const AT = "2026-10-10T00:00:00.000Z";

async function seededKernel(): Promise<ContentKernel> {
  const kernel = freshSqliteContentKernel();
  await kernel.run((db) => db.insertInto("workspaces").values({ id: WS, name: WS, slug: WS, created_at: AT }).execute());
  return kernel;
}

async function seedForm(kernel: ContentKernel, id: string, overrides: { deletedAt?: string | null; version?: number } = {}): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("form_definitions")
      .values({
        id,
        workspace_id: WS,
        name: `Form ${id}`,
        slug: `slug-${id}`,
        fields_json: '{"fields":[]}',
        notify_json: '{"enabled":false,"recipients":[]}',
        status: "active",
        created_at: AT,
        updated_at: AT,
        deleted_at: overrides.deletedAt ?? null,
        version: overrides.version ?? 1,
      })
      .execute()
  );
}

async function formRow(kernel: ContentKernel, id: string) {
  return kernel.run((db) => db.selectFrom("form_definitions").select(["deleted_at", "version"]).where("id", "=", id).executeTakeFirst());
}

/** A kernel that records `transaction`, `lockKey` and `run` in call order, delegating each to the real one. */
function orderRecordingKernel(base: ContentKernel): { kernel: ContentKernel; events: string[] } {
  const events: string[] = [];
  const kernel: ContentKernel = {
    ...base,
    transaction: (fn) => {
      events.push("transaction");
      return base.transaction(fn);
    },
    lockKey: async (key) => {
      events.push(`lock:${key}`);
      await base.lockKey(key);
    },
    run: (fn) => {
      events.push("run");
      return base.run(fn);
    },
  };
  return { kernel, events };
}

/** A kernel whose first `run` (the adapter's read of the row) is followed by `sneak`: another writer committing between the read and the claim. */
function writerAfterFirstRead(base: ContentKernel, sneak: () => Promise<void>): ContentKernel {
  let reads = 0;
  return {
    ...base,
    run: async (fn) => {
      const result = await base.run(fn);
      if (++reads === 1) await sneak();
      return result;
    },
  };
}

const formEntry = (): TrashEntry => buildTrashRegistry().get("form")!;

for (const operation of ["hide", "unhide", "purge"] as const) {
  test(`${operation} takes the row's lock key inside a transaction, before its first read`, async () => {
    const base = await seededKernel();
    const trashed = operation !== "hide";
    await seedForm(base, "f1", { deletedAt: trashed ? AT : null, version: 2 });
    const { kernel, events } = orderRecordingKernel(base);
    const adapter = createTableTrashAdapter({ entry: formEntry(), kernel, tables: TRASH_TABLES });
    if (operation === "purge") await adapter.purge({ workspaceId: WS, entityId: "f1", expectedVersion: 2 });
    else await adapter[operation]({ workspaceId: WS, entityId: "f1", at: AT, expectedVersion: 2 });
    assert.deepEqual(events.slice(0, 3), ["transaction", "lock:trash:form:ws-1:f1", "run"]);
  });
}

test("the database is read on the first call, never when the adapter is constructed", async () => {
  const base = await seededKernel();
  await seedForm(base, "f1");
  let reads = 0;
  const adapter = createTableTrashAdapter({
    entry: formEntry(),
    tables: TRASH_TABLES,
    get kernel() {
      reads += 1;
      return base;
    },
  });
  assert.equal(reads, 0);
  await adapter.hide({ workspaceId: WS, entityId: "f1", at: AT, expectedVersion: null });
  await adapter.unhide({ workspaceId: WS, entityId: "f1", at: AT, expectedVersion: null });
  assert.equal(reads, 1, "resolved once, then reused");
});

test("re-hiding an already-trashed row is a no-op that never evaluates the blocker; a real hide does evaluate it", async () => {
  const base = await seededKernel();
  await seedForm(base, "trashed", { deletedAt: AT, version: 3 });
  await seedForm(base, "live", { version: 3 });
  // The blocker names a table that does not exist: evaluating it throws, so a clean no-op proves it never ran.
  const entry: TrashEntry = { ...formEntry(), blocker: { table: "no_such_table", parentIdColumn: "form_id", code: "TEST_BLOCKED" } };
  const adapter = createTableTrashAdapter({ entry, kernel: base, tables: TRASH_TABLES });
  const before = await formRow(base, "trashed");
  assert.deepEqual(await adapter.hide({ workspaceId: WS, entityId: "trashed", at: AT, expectedVersion: 3 }), { ok: true, version: 3, noop: true });
  assert.deepEqual(await formRow(base, "trashed"), before, "row bytes unchanged");
  await assert.rejects(adapter.hide({ workspaceId: WS, entityId: "live", at: AT, expectedVersion: 3 }), /no_such_table/);
});

test("a purge whose claim finds the marker changed (version untouched) reports version-changed and deletes nothing", async () => {
  const base = await seededKernel();
  await seedForm(base, "f1", { deletedAt: AT, version: 3 });
  await base.run((db) =>
    db.insertInto("form_submissions").values({ id: "s1", workspace_id: WS, form_definition_id: "f1", data_json: "{}", source_ip: "127.0.0.1", submitted_at: AT }).execute()
  );
  // A writer restores the form between the purge's read and its claim, without bumping the version.
  const racing = writerAfterFirstRead(base, () => base.run((db) => db.updateTable("form_definitions").set({ deleted_at: null }).where("id", "=", "f1").execute()).then(() => undefined));
  const adapter = createTableTrashAdapter({ entry: formEntry(), kernel: racing, tables: TRASH_TABLES });
  assert.equal(await adapter.purge({ workspaceId: WS, entityId: "f1", expectedVersion: 3 }), "version-changed");
  assert.deepEqual(await formRow(base, "f1"), { deleted_at: null, version: 3 });
  assert.equal((await base.run((db) => db.selectFrom("form_submissions").select("id").execute())).length, 1);
});
