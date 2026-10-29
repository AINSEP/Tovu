import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import type { PGlite } from "@electric-sql/pglite";
import { sql } from "kysely";

import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { listTables } from "../../kernel/dialect.js";
import type { StorageKernel } from "../../kernel/port.js";
import { readSchemaShape, type SchemaShape } from "../../kernel/schema-shape.js";
import { ensurePgContentSchema } from "../../__tests__/pg-content-schema.js";
import { CONTENT_MIGRATIONS, migrateContentDatabase, runMigrations } from "../index.js";
import { LegacyHistoryError } from "../step.js";

/**
 * @file The Postgres half of `0000_legacy_baseline` (ADR-066 §6), on PGlite: the frozen statements
 * apply (drizzle-kit's own baseline did not: 42830, a composite FK before its unique index), and a
 * fresh database at head has the same tables, columns, defaults, indexes and constraints as the
 * reference built from `schema.postgres.ts` today (`__tests__/pg-content-schema.ts`) — the check that a
 * schema-file change without a migration step goes red. Real Postgres: `runner.postgres.test.ts`.
 */

const opened: Array<StorageKernel<unknown>> = [];
after(async () => {
  for (const kernel of opened) await kernel.close();
});

function pglite(prepare?: (client: PGlite) => Promise<void>): StorageKernel<unknown> {
  const kernel = openPgliteKernel<unknown>({ prepare });
  opened.push(kernel);
  return kernel;
}

/** The reference validates constraints after copying data (`NOT VALID` + VALIDATE); same rules. */
function withoutNotValid(shape: SchemaShape): SchemaShape {
  for (const table of Object.values(shape.tables)) table.constraints = table.constraints.map((c) => c.replace(/ NOT VALID$/, ""));
  return shape;
}

describe("0000_legacy_baseline on Postgres (PGlite)", () => {
  test("applies on an empty database and matches schema.postgres.ts at head", async () => {
    const kernel = pglite();
    const report = await migrateContentDatabase(kernel);
    assert.deepEqual(report.applied, CONTENT_MIGRATIONS.map(step => step.id));
    const reference = pglite(ensurePgContentSchema);
    // `post_search_document` is step 0001's, not the baseline's (`post-search-step.test.ts`).
    // 0012 retains these exact pre-vault restore tables outside the live schema.
    const backups = ["site_assistant_credentials", "admin_execution_credentials", "media_provider_credentials",
      "custom_credential_sets", "publish_content_peers", "database_transfer_destinations", "vendor_credential_sets",
      "source_control_credential_sets", "publish_credential_sets", "external_mcp_servers",
      "oauth_pending_authorizations", "tovu_migrations", "external_mcp_tool_approvals"].map(name => `_vault_backup_${name}`);
    assert.deepEqual((await listTables(kernel)).filter(name => name.startsWith("_vault_backup_")).sort(), [...backups].sort());
    assert.deepEqual(await kernel.query(sql`SELECT id FROM _vault_backup_tovu_migrations ORDER BY id`),
      CONTENT_MIGRATIONS.filter(step => step.id < "0012_secrets_vault").map(step => ({ id: step.id })));
    const actual = await readSchemaShape(kernel, { exclude: ["tovu_migrations", "post_search_document", ...backups] });
    const expected = withoutNotValid(await readSchemaShape(reference));
    // 0021–0030 add these outside Drizzle; 0035's member_external_identities is in both schemas.
    const migrationOnlyTables = [
      "site_consent_revisions", "site_consent_heads", "mail_send_ledger", "mail_suppression",
      "mail_feedback_inbox", "mail_capture", "domain_binding", "search_index_state",
      "search_index_watermarks", "search_index_targets", "search_index_retired",
      "mail_activity_attempts", "mail_suppression_removals",
    ];
    assert.deepEqual(Object.keys(actual.tables).sort(), [...Object.keys(expected.tables), ...migrationOnlyTables].sort());
    // ALTER TABLE appends columns; their definitions, defaults and constraints must still match.
    for (const name of Object.keys(expected.tables)) assert.deepEqual(
      { ...actual.tables[name], columns: [...actual.tables[name].columns].sort() },
      { ...expected.tables[name], columns: [...expected.tables[name].columns].sort() },
      `table ${name}`,
    );
    assert.deepEqual((await migrateContentDatabase(kernel)).applied, [], "a rerun applies nothing");
  });

  test("the frozen baseline creates the composite FK (the 42830 case), then head retires core commerce", async () => {
    const kernel = pglite();
    await runMigrations(kernel, CONTENT_MIGRATIONS.slice(0, 1));
    const rows = await kernel.query<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND conrelid = 'commerce_products'::regclass AND confrelid = 'member_tiers'::regclass`
    );
    assert.equal(rows[0].n, 1);
    await migrateContentDatabase(kernel);
    assert.deepEqual(await kernel.query(sql`SELECT to_regclass('commerce_products') AS table_name`), [{ table_name: null }]);
  });

  test("a prototype schema with no ledger is refused, not overwritten", async () => {
    const kernel = pglite(ensurePgContentSchema);
    await assert.rejects(migrateContentDatabase(kernel), (error: unknown) => error instanceof LegacyHistoryError && /recreate the data dir/.test(error.message));
  });
});
