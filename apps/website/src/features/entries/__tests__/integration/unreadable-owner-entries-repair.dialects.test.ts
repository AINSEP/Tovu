import assert from "node:assert/strict";
import { test } from "node:test";

import { eachDialect, type ContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { TrashAdapter } from "#src/features/trash/index";
import {
  ownerEntryRemovalFor,
  removeUnreadableOwnerEntries,
  UNREADABLE_OWNER_ENTRIES_HARD_DELETE_REASON,
  UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID,
  type OwnerEntryRemoval,
} from "../../unreadable-owner-entries-repair.js";

/**
 * @file The boot data repair that removes `entries` rows whose envelope namespace does not match
 * their content type's declared owner (the 2026-08-03 production probe rows, `widget` entries with
 * their payload under `ext.site`), on SQLite and PGlite (real Postgres:
 * `unreadable-owner-entries-repair.postgres.test.ts`). The safety half matters most: every readable
 * row, and every row outside the narrow predicate, must survive byte for byte.
 */

const WS = "ws-repair";
const OTHER_WS = "ws-repair-other";
const AT = "2026-10-04T00:00:00.000Z";
const NOW = "2026-10-05T00:00:00.000Z";
/** A payload string that must never reach a log line or the marker. */
const PAYLOAD = "PAYLOAD-MUST-NOT-BE-LOGGED";
const TABLES = ["entries", "entry_revisions", "entry_refs", "widget_region_bindings", "setting_values_global", "database_write_watermark", "trashed_items"] as const;

type Overrides = { workspace_id?: string; deleted_at?: string | null; version?: number };

async function insertEntry(kernel: ContentKernel, id: string, type: string, fields: unknown, overrides: Overrides = {}): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("entries")
      .values({
        id, workspace_id: WS, type, slug: id, status: "published", title: id, body_json: null,
        fields_json: typeof fields === "string" ? fields : JSON.stringify(fields), published_at: null,
        created_at: AT, updated_at: AT, version: 1, deleted_at: null, ...overrides,
      })
      .execute()
  );
}

/** Every child row a removal touches, for `id`. */
async function insertChildren(kernel: ContentKernel, id: string, workspaceId = WS): Promise<void> {
  await kernel.run(async (db) => {
    await db.insertInto("entry_revisions").values({ entry_id: id, workspace_id: workspaceId, op: "create", state_json: "{}", actor_id: "a", recorded_at: AT }).execute();
    await db.insertInto("entry_refs").values({ workspace_id: workspaceId, source_entry_id: id, source_kind: "entry", field_path: "x", target_kind: "menu", target_id: "m" }).execute();
  });
}

async function prepare(kernel: ContentKernel): Promise<void> {
  await kernel.run((db) => db.insertInto("database_write_watermark").values({ id: 1, value: 0, last_stamped_at: null }).execute());
}

async function snapshot(kernel: ContentKernel) {
  return kernel.run(async (db) => ({
    entries: await db.selectFrom("entries").selectAll().orderBy("id").execute(),
    revisions: await db.selectFrom("entry_revisions").select(["entry_id", "workspace_id", "op"]).orderBy("entry_id").execute(),
    refs: await db.selectFrom("entry_refs").select(["source_entry_id", "workspace_id"]).orderBy("source_entry_id").execute(),
    bindings: await db.selectFrom("widget_region_bindings").selectAll().orderBy("area_entry_id").execute(),
  }));
}

async function readMarker(kernel: ContentKernel): Promise<unknown> {
  const row = await kernel.run((db) =>
    db.selectFrom("setting_values_global").select("value_json").where("setting_id", "=", UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID).executeTakeFirst()
  );
  if (row === undefined) return undefined;
  return typeof row.value_json === "string" ? (JSON.parse(row.value_json) as unknown) : row.value_json;
}

async function watermark(kernel: ContentKernel): Promise<number> {
  return Number((await kernel.run((db) => db.selectFrom("database_write_watermark").select("value").where("id", "=", 1).executeTakeFirstOrThrow())).value);
}

/** Every row the predicate must leave alone. */
async function seedSurvivors(kernel: ContentKernel): Promise<void> {
  await insertEntry(kernel, "valid-widget", "widget", { ext: { widget: { payload: "{}" } } });
  await insertChildren(kernel, "valid-widget");
  // A valid owner payload AND a stray namespace: readable, so it stays.
  await insertEntry(kernel, "both-widget", "widget", { ext: { widget: { payload: "{}" }, site: { payload: PAYLOAD } } });
  // The owner key is present but malformed: unreadable, but not the mismatched-namespace class.
  await insertEntry(kernel, "malformed-owner-widget", "widget", { ext: { widget: "not-an-object", site: { payload: PAYLOAD } } });
  await insertEntry(kernel, "empty-ext-widget", "widget", { ext: {} });
  await insertEntry(kernel, "no-ext-widget", "widget", { payload: PAYLOAD });
  await insertEntry(kernel, "valid-area", "widget_area", { ext: { widgets: { payload: "{}" } } });
  // `site`-owned types are never scanned, whatever namespace their rows carry.
  await insertEntry(kernel, "recipe-site", "recipe", { ext: { site: { servings: 2 } } });
  await insertEntry(kernel, "recipe-foreign", "recipe", { ext: { widget: { payload: PAYLOAD } } });
  // Already in the Trash: the sweeper owns it.
  await insertEntry(kernel, "trashed-probe", "widget", { ext: { site: { payload: PAYLOAD } } }, { deleted_at: AT });
}

for (const dialect of eachDialect({ tables: TABLES, make: (kernel) => kernel })) {
  test(`[${dialect.name}] removes exactly the mismatched-namespace rows (trash purge for widget, recorded hard delete for widget_area); every other row survives byte for byte`, async () => {
    const kernel = dialect.make();
    await prepare(kernel);
    await seedSurvivors(kernel);
    const before = await snapshot(kernel);
    await insertEntry(kernel, "probe-widget", "widget", { ext: { site: { payload: PAYLOAD } } }, { version: 3 });
    await insertChildren(kernel, "probe-widget");
    await insertEntry(kernel, "probe-other-ws", "widget", { ext: { site: { payload: PAYLOAD } } }, { workspace_id: OTHER_WS });
    await insertChildren(kernel, "probe-other-ws", OTHER_WS);
    await insertEntry(kernel, "probe-area", "widget_area", { ext: { site: { payload: PAYLOAD } } });
    await insertChildren(kernel, "probe-area");
    await kernel.run((db) => db.insertInto("widget_region_bindings").values({ workspace_id: WS, region_key: "sidebar", area_entry_id: "probe-area", updated_at: AT }).execute());
    const lines: string[] = [];

    const result = await removeUnreadableOwnerEntries({ kernel }, { log: (line) => lines.push(line), now: () => NOW });

    const removed = [
      { workspaceId: WS, id: "probe-area", type: "widget_area", via: "hard-delete" },
      { workspaceId: OTHER_WS, id: "probe-other-ws", type: "widget", via: "trash-purge" },
      { workspaceId: WS, id: "probe-widget", type: "widget", via: "trash-purge" },
    ];
    assert.deepEqual(result, { ran: true, removed });
    assert.deepEqual(await snapshot(kernel), before, "every survivor, its revisions and refs are untouched; the removed rows' children are gone");
    assert.deepEqual(await readMarker(kernel), { completedAt: NOW, removed, hardDeleteReason: UNREADABLE_OWNER_ENTRIES_HARD_DELETE_REASON });
    assert.equal(await watermark(kernel), 1, "one stamp for the repair's writes");
    assert.deepEqual(lines, [
      "[boot-repair] removed unreadable entry probe-area (type widget_area, workspace ws-repair) via hard-delete",
      "[boot-repair] removed unreadable entry probe-other-ws (type widget, workspace ws-repair-other) via trash-purge",
      "[boot-repair] removed unreadable entry probe-widget (type widget, workspace ws-repair) via trash-purge",
    ]);
    assert.ok(!JSON.stringify(await readMarker(kernel)).includes(PAYLOAD), "the marker records ids and types, never payloads");
  });

  test(`[${dialect.name}] the marker makes every later boot a no-op, even with a new mismatched row`, async () => {
    const kernel = dialect.make();
    await prepare(kernel);
    const first = await removeUnreadableOwnerEntries({ kernel }, { log: () => {}, now: () => NOW });
    assert.deepEqual(first, { ran: true, removed: [] });
    assert.deepEqual(await readMarker(kernel), { completedAt: NOW, removed: [], hardDeleteReason: UNREADABLE_OWNER_ENTRIES_HARD_DELETE_REASON });
    assert.equal(await watermark(kernel), 0, "no removal, no stamp");
    await insertEntry(kernel, "late-probe", "widget", { ext: { site: { payload: PAYLOAD } } });
    const lines: string[] = [];

    const second = await removeUnreadableOwnerEntries({ kernel }, { log: (line) => lines.push(line), now: () => "later" });

    assert.deepEqual(second, { ran: false, removed: [] });
    assert.equal((await snapshot(kernel)).entries.length, 1, "the late row is not touched");
    assert.deepEqual(await readMarker(kernel), { completedAt: NOW, removed: [], hardDeleteReason: UNREADABLE_OWNER_ENTRIES_HARD_DELETE_REASON });
    assert.deepEqual(lines, []);
  });

  test(`[${dialect.name}] a removal that fails mid-way rolls every removal back and leaves the marker unset; the retry removes them all`, async () => {
    const kernel = dialect.make();
    await prepare(kernel);
    await insertEntry(kernel, "probe-a", "widget", { ext: { site: { payload: PAYLOAD } } });
    await insertEntry(kernel, "probe-b", "widget", { ext: { site: { payload: PAYLOAD } } });
    const before = await snapshot(kernel);
    let calls = 0;
    const refusing: TrashAdapter = {
      entityType: "widget",
      hide: async () => ({ ok: false, reason: "version-changed" }),
      unhide: async () => assert.fail("never restores"),
      purge: async () => assert.fail("never purges after a refused hide"),
    };
    const failSecond = (type: string): OwnerEntryRemoval => (++calls === 2 ? { adapter: refusing, via: "trash-purge" } : ownerEntryRemovalFor({ kernel, type }));

    await assert.rejects(removeUnreadableOwnerEntries({ kernel }, { removalFor: failSecond, log: () => {}, now: () => NOW }), {
      message: "boot repair: entry probe-b (type widget) changed since it was classified (version-changed); nothing was removed, the next boot retries",
    });
    assert.deepEqual(await snapshot(kernel), before, "probe-a's removal rolled back with the failure");
    assert.equal(await readMarker(kernel), undefined);
    assert.equal(await watermark(kernel), 0);

    const retry = await removeUnreadableOwnerEntries({ kernel }, { log: () => {}, now: () => NOW });
    assert.deepEqual(retry.removed.map((row) => row.id), ["probe-a", "probe-b"]);
    assert.deepEqual((await snapshot(kernel)).entries, []);
  });

  test(`[${dialect.name}] a purge that does not report "purged" fails the repair instead of recording a removal`, async () => {
    const kernel = dialect.make();
    await prepare(kernel);
    await insertEntry(kernel, "probe-a", "widget", { ext: { site: { payload: PAYLOAD } } });
    const notPurging: TrashAdapter = {
      entityType: "widget",
      hide: async () => ({ ok: true, version: 2 }),
      unhide: async () => assert.fail("never restores"),
      purge: async () => "already-gone",
    };

    await assert.rejects(
      removeUnreadableOwnerEntries({ kernel }, { removalFor: () => ({ adapter: notPurging, via: "trash-purge" }), log: () => {}, now: () => NOW }),
      { message: "boot repair: entry probe-a (type widget) was not purged (already-gone); nothing was removed, the next boot retries" }
    );
    assert.equal(await readMarker(kernel), undefined);
  });

  test(`[${dialect.name}] the default removal refuses a row whose version moved since it was read`, async () => {
    const kernel = dialect.make();
    await insertEntry(kernel, "probe-a", "widget", { ext: { site: { payload: PAYLOAD } } }, { version: 2 });
    const { adapter, via } = ownerEntryRemovalFor({ kernel, type: "widget" });
    assert.equal(via, "trash-purge");
    assert.deepEqual(await adapter.hide({ workspaceId: WS, entityId: "probe-a", at: NOW, expectedVersion: 1 }), { ok: false, reason: "version-changed" });
    assert.equal((await snapshot(kernel)).entries[0]?.deleted_at, null);
    assert.equal(ownerEntryRemovalFor({ kernel, type: "widget_area" }).via, "hard-delete");
  });
}

test("[sqlite] a row whose fields_json is not JSON is left alone (jsonb cannot hold one)", async () => {
  const [sqlite] = eachDialect({ tables: TABLES, make: (kernel) => kernel });
  const kernel = sqlite!.make();
  await prepare(kernel);
  await insertEntry(kernel, "garbled", "widget", "{not json");
  const before = await snapshot(kernel);

  const result = await removeUnreadableOwnerEntries({ kernel }, { log: () => {}, now: () => NOW });

  assert.deepEqual(result, { ran: true, removed: [] });
  assert.deepEqual(await snapshot(kernel), before);
});
