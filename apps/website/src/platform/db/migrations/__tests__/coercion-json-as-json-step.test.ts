import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { sql } from "kysely";

import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { sqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { COERCION_JSON_AS_JSON_ID } from "../0003_coercion_json_as_json.js";
import { migrateContentDatabase } from "../index.js";

/**
 * @file Step `0003_coercion_json_as_json`: a SQLite `setting_definitions.coercion_json` holding a
 * bare coercer tag (`identity`, as the settings repo once wrote it) becomes the JSON string
 * `"identity"`, so a storage move can load it into Postgres's jsonb column. Postgres/PGlite:
 * recorded, nothing changed (jsonb never held a bare tag).
 */

const opened: StorageKernel<unknown>[] = [];
after(async () => {
  for (const kernel of opened) await kernel.close();
});

/** A content database at the legacy chain's head (drizzle's migrator), not yet adopted. */
function legacyContentKernel(): StorageKernel<unknown> {
  const kernel = sqliteKernel<unknown>(openContentDb(":memory:"));
  opened.push(kernel);
  return kernel;
}

async function insertDefinition(kernel: StorageKernel<unknown>, settingId: string, coercionJson: string | null): Promise<void> {
  await kernel.execute(
    sql`INSERT INTO setting_definitions (setting_id, version, namespace, key, owner_kind, schema_json, scopes, status, coercion_json, created_at, updated_at)
        VALUES (${settingId}, 1, 'core.test', ${settingId}, 'core', '{"type":"string"}', 1, 'active', ${coercionJson}, 'now', 'now')`
  );
}

const coercionJsonOf = async (kernel: StorageKernel<unknown>, settingId: string) =>
  (await kernel.query<{ coercion_json: string | null }>(sql`SELECT coercion_json FROM setting_definitions WHERE setting_id = ${settingId}`))[0]?.coercion_json;

describe(COERCION_JSON_AS_JSON_ID, () => {
  test("SQLite: a bare tag becomes a JSON string; JSON and NULL rows are untouched", async () => {
    const kernel = legacyContentKernel();
    await insertDefinition(kernel, "bare", "identity");
    await insertDefinition(kernel, "encoded", '"identity"');
    await insertDefinition(kernel, "none", null);
    const report = await migrateContentDatabase(kernel);
    assert.ok(report.applied.includes(COERCION_JSON_AS_JSON_ID));
    assert.equal(await coercionJsonOf(kernel, "bare"), '"identity"');
    assert.equal(await coercionJsonOf(kernel, "encoded"), '"identity"');
    assert.equal(await coercionJsonOf(kernel, "none"), null);
  });

  test("PGlite: recorded", async () => {
    const kernel = openPgliteKernel<unknown>();
    opened.push(kernel);
    const report = await migrateContentDatabase(kernel);
    assert.ok(report.applied.includes(COERCION_JSON_AS_JSON_ID));
  });
});
