import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import { SITE_TITLE_KEY, SITE_TITLE_NAMESPACE } from "#src/features/settings/site-title";
import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID } from "#src/server/runtime/configuration/seed";
import {
  resetLegacySiteTitlePin,
  SITE_TITLE_PIN_ACTOR,
  SITE_TITLE_PIN_KEY,
  SITE_TITLE_PIN_NAMESPACE,
} from "../reset-legacy-site-title-pin.js";

/**
 * @file SPEC-050 v0.3.0 (REQ-12, REQ-14, INV-07): `resetLegacySiteTitlePin` over a real, fully
 * migrated content schema on every dialect (`describeEachDialect`), so every row below has to
 * satisfy the real columns and foreign keys. The value rows are inserted the way the settings
 * ledger stores them; the end-to-end version (a real boot writing a real pin) lives in
 * `site-title-preservation.integration.test.ts`.
 */

const SYSTEM = "system-settings-migration";
const OWNER = "principal-owner-1";
const NOW = "2026-09-14T00:00:00.000Z";
const TABLES = ["workspaces", "setting_definitions", "setting_values_workspace", "site_title_preexisting_workspaces"];

/** Rolls a test's own schema changes back: thrown at the end of a `kernel.transaction`. */
class Rollback extends Error {}

async function withWorkspaces(kernel: ContentKernel, workspaceIds: readonly string[]): Promise<ContentKernel> {
  for (const id of workspaceIds) {
    await kernel.run((db) => db.insertInto("workspaces").values({ id, name: `Workspace ${id}`, slug: `slug-${id}`, created_at: NOW }).execute());
  }
  return kernel;
}

async function insertDefinition(
  kernel: ContentKernel,
  required: { settingId: string; namespace: string; key: string; version?: number }
): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("setting_definitions")
      .values({
        setting_id: required.settingId,
        version: required.version ?? 1,
        workspace_id: null,
        namespace: required.namespace,
        key: required.key,
        owner_kind: "core",
        owner_id: null,
        schema_json: '{"type":"string"}',
        default_json: '"default"',
        scopes: 2,
        status: "active",
        alias_of_key: null,
        alias_of_ns: null,
        coercion_json: null,
        created_at: NOW,
        updated_at: NOW,
      })
      .execute()
  );
}

async function insertWorkspaceValue(
  kernel: ContentKernel,
  required: { settingId: string; workspaceId: string; updatedBy: string; value: string | null; state?: "set" | "cleared" }
): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("setting_values_workspace")
      .values({
        setting_id: required.settingId,
        workspace_id: required.workspaceId,
        value_json: required.value === null ? null : JSON.stringify(required.value),
        state: required.state ?? "set",
        def_version: 1,
        seq: 1,
        updated_by: required.updatedBy,
        updated_at: NOW,
        origin_plugin_id: null,
      })
      .execute()
  );
}

async function insertMarker(kernel: ContentKernel, workspaceId: string, preservedAt: string | null): Promise<void> {
  await kernel.run((db) => db.insertInto("site_title_preexisting_workspaces").values({ workspace_id: workspaceId, preserved_at: preservedAt }).execute());
}

async function workspaceValues(kernel: ContentKernel): Promise<string[]> {
  const rows = await kernel.run((db) =>
    db
      .selectFrom("setting_values_workspace")
      .select(["setting_id", "workspace_id", "updated_by", "state"])
      .orderBy("setting_id")
      .orderBy("workspace_id")
      .execute()
  );
  return rows.map((row) => `${row.setting_id}|${row.workspace_id}|${row.updated_by}|${row.state}`);
}

async function markerWorkspaceIds(kernel: ContentKernel): Promise<string[]> {
  const rows = await kernel.run((db) =>
    db.selectFrom("site_title_preexisting_workspaces").select("workspace_id").orderBy("workspace_id").execute()
  );
  return rows.map((row) => row.workspace_id);
}

test("drift guard: the mirrored literals are the site-title setting's own namespace and key, and the pin's own actor", () => {
  assert.equal(SITE_TITLE_PIN_NAMESPACE, SITE_TITLE_NAMESPACE);
  assert.equal(SITE_TITLE_PIN_KEY, SITE_TITLE_KEY);
  assert.equal(SITE_TITLE_PIN_ACTOR, SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID);
});

describeEachDialect("resetLegacySiteTitlePin", { tables: TABLES, make: (kernel) => kernel }, (make) => {
  test("REQ-12/REQ-14, EC-02: every workspace's system pin and every marker row, pending or resolved, are removed, and the counts say so", async () => {
    const kernel = await withWorkspaces(make(), ["ws-a", "ws-b", "ws-c"]);
    // Two definition versions for one setting id: the reset must still delete each pin exactly once.
    await insertDefinition(kernel, { settingId: "def-title", namespace: "core.site", key: "title", version: 1 });
    await insertDefinition(kernel, { settingId: "def-title", namespace: "core.site", key: "title", version: 2 });
    await insertWorkspaceValue(kernel, { settingId: "def-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "Tovu Demo Site" });
    await insertWorkspaceValue(kernel, { settingId: "def-title", workspaceId: "ws-b", updatedBy: SYSTEM, value: "Tovu Demo Site" });
    await insertMarker(kernel, "ws-a", NOW);
    await insertMarker(kernel, "ws-b", NOW);
    await insertMarker(kernel, "ws-c", null); // recorded, pin never landed: a copy must not pin it on first boot either.

    assert.deepEqual(await resetLegacySiteTitlePin({ db: kernel }), { markerRowsDeleted: 3, pinRowsDeleted: 2 });

    assert.deepEqual(await workspaceValues(kernel), []);
    assert.deepEqual(await markerWorkspaceIds(kernel), []);
  });

  test("INV-07, AC-21, EC-09: an owner's own title travels — a set or cleared row by anyone but the system is kept", async () => {
    const kernel = await withWorkspaces(make(), ["ws-a", "ws-b"]);
    await insertDefinition(kernel, { settingId: "def-title", namespace: "core.site", key: "title" });
    await insertWorkspaceValue(kernel, { settingId: "def-title", workspaceId: "ws-a", updatedBy: OWNER, value: "Acme Field Notes" });
    await insertWorkspaceValue(kernel, { settingId: "def-title", workspaceId: "ws-b", updatedBy: OWNER, value: null, state: "cleared" });
    await insertMarker(kernel, "ws-a", NOW);
    await insertMarker(kernel, "ws-b", NOW);

    assert.deepEqual(await resetLegacySiteTitlePin({ db: kernel }), { markerRowsDeleted: 2, pinRowsDeleted: 0 });

    assert.deepEqual(await workspaceValues(kernel), [`def-title|ws-a|${OWNER}|set`, `def-title|ws-b|${OWNER}|cleared`]);
    assert.deepEqual(await markerWorkspaceIds(kernel), []);
  });

  test("adversarial: the system actor alone is not the pin — its rows for any other setting, including a same-named key elsewhere, are kept", async () => {
    const kernel = await withWorkspaces(make(), ["ws-a"]);
    await insertDefinition(kernel, { settingId: "def-title", namespace: "core.site", key: "title" });
    await insertDefinition(kernel, { settingId: "def-seo-title", namespace: "site.seo", key: "title" });
    await insertDefinition(kernel, { settingId: "def-site-tagline", namespace: "core.site", key: "tagline" });
    await insertWorkspaceValue(kernel, { settingId: "def-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "Tovu Demo Site" });
    await insertWorkspaceValue(kernel, { settingId: "def-seo-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "%s" });
    await insertWorkspaceValue(kernel, { settingId: "def-site-tagline", workspaceId: "ws-a", updatedBy: SYSTEM, value: "A tagline" });

    assert.deepEqual(await resetLegacySiteTitlePin({ db: kernel }), { markerRowsDeleted: 0, pinRowsDeleted: 1 });

    assert.deepEqual(await workspaceValues(kernel), [`def-seo-title|ws-a|${SYSTEM}|set`, `def-site-tagline|ws-a|${SYSTEM}|set`]);
  });

  test("a second run over an already-reset copy deletes nothing", async () => {
    const kernel = await withWorkspaces(make(), ["ws-a"]);
    await insertDefinition(kernel, { settingId: "def-title", namespace: "core.site", key: "title" });
    await insertWorkspaceValue(kernel, { settingId: "def-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "Tovu Demo Site" });
    await insertMarker(kernel, "ws-a", NOW);

    await resetLegacySiteTitlePin({ db: kernel });
    assert.deepEqual(await resetLegacySiteTitlePin({ db: kernel }), { markerRowsDeleted: 0, pinRowsDeleted: 0 });
  });

  test("a copy from before the marker migration has no marker table: the pin rows still go, and the missing table is not an error", async () => {
    const kernel = await withWorkspaces(make(), ["ws-a"]);
    // DDL is transactional on both dialects: the drop is rolled back so later tests keep the table.
    await assert.rejects(
      kernel.transaction(async () => {
        await kernel.execute(sql`DROP TABLE site_title_preexisting_workspaces`);
        await insertDefinition(kernel, { settingId: "def-title", namespace: "core.site", key: "title" });
        await insertWorkspaceValue(kernel, { settingId: "def-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "Tovu Demo Site" });

        assert.deepEqual(await resetLegacySiteTitlePin({ db: kernel }), { markerRowsDeleted: 0, pinRowsDeleted: 1 });
        assert.deepEqual(await workspaceValues(kernel), []);
        throw new Rollback();
      }),
      Rollback
    );
  });
});

// SQLite only: a bare legacy file. (An empty Postgres schema has no path to this function.)
test("a database with none of the three tables is left untouched rather than failing", async () => {
  const kernel = openSqliteFileKernel<unknown>(":memory:");
  try {
    await kernel.execute(sql`CREATE TABLE unrelated (id TEXT PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO unrelated (id) VALUES ('kept')`);

    assert.deepEqual(await resetLegacySiteTitlePin({ db: kernel as ContentKernel }), { markerRowsDeleted: 0, pinRowsDeleted: 0 });
    assert.deepEqual(await kernel.query(sql`SELECT id FROM unrelated`), [{ id: "kept" }]);
  } finally {
    await kernel.close();
  }
});
