import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import type { PGlite } from "@electric-sql/pglite";
import { sql } from "kysely";

import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { readSchemaShape, type SchemaShape } from "../../kernel/schema-shape.js";
import { ensurePgContentSchema } from "../../__tests__/pg-content-schema.js";
import { CONTENT_MIGRATIONS, migrateContentDatabase } from "../index.js";
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
    const actual = await readSchemaShape(kernel, { exclude: ["tovu_migrations", "post_search_document"] });
    const expected = withoutNotValid(await readSchemaShape(reference));
    assert.deepEqual(Object.keys(actual.tables).sort(), Object.keys(expected.tables).sort());
    // ALTER TABLE appends columns; their definitions, defaults and constraints must still match.
    for (const name of Object.keys(expected.tables)) assert.deepEqual(
      { ...actual.tables[name], columns: [...actual.tables[name].columns].sort() },
      { ...expected.tables[name], columns: [...expected.tables[name].columns].sort() },
      `table ${name}`,
    );
    assert.deepEqual((await migrateContentDatabase(kernel)).applied, [], "a rerun applies nothing");
  });

  test("the composite FK to member_tiers is in place (the 42830 case)", async () => {
    const kernel = pglite();
    await migrateContentDatabase(kernel);
    const rows = await kernel.query<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND conrelid = 'commerce_products'::regclass AND confrelid = 'member_tiers'::regclass`
    );
    assert.equal(rows[0].n, 1);
  });

  test("a prototype schema with no ledger is refused, not overwritten", async () => {
    const kernel = pglite(ensurePgContentSchema);
    await assert.rejects(migrateContentDatabase(kernel), (error: unknown) => error instanceof LegacyHistoryError && /recreate the data dir/.test(error.message));
  });
});
