import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { CONTENT_MIGRATIONS, migrateContentDatabase } from "#src/platform/db/migrations/index";
import { readAppliedSchemaIdentity } from "../read-applied-schema-identity.js";

/** DBMERGE-PLAN bug B1 (P1): schema identity must name the same head on both dialects. Postgres
 * reads `tovu_migrations`; SQLite still reads `__drizzle_migrations.created_at`, so schema-state,
 * repair and adopt report the frozen Drizzle head forever and never see steps 0001–0012. The first
 * test is `todo` until the reader falls back to the Drizzle journal ONLY when `tovu_migrations`
 * is absent (a pre-adoption file).
 */
const head = CONTENT_MIGRATIONS.at(-1)!;
const expectedHead = { idx: CONTENT_MIGRATIONS.length - 1, tag: head.id };

test("SQLite at head reports the last tovu_migrations step, like Postgres", {
  todo: "B1: readAppliedSchemaIdentity reads __drizzle_migrations on SQLite (read-applied-schema-identity.ts:88-95)",
}, async () => {
  const kernel = freshSqliteContentKernel();
  try { assert.deepEqual(await readAppliedSchemaIdentity(kernel), expectedHead); } finally { await kernel.close(); }
});

test("PGlite at head reports the last tovu_migrations step (the reference B1 must match)", async () => {
  const kernel = openPgliteKernel<unknown>();
  try {
    await migrateContentDatabase(kernel as StorageKernel<unknown>);
    assert.deepEqual(await readAppliedSchemaIdentity(kernel), expectedHead);
  } finally { await kernel.close(); }
});

test("a pre-adoption SQLite file (no tovu_migrations) still maps through the Drizzle journal", async () => {
  const kernel = freshSqliteContentKernel();
  try {
    await kernel.execute(sql`DROP TABLE tovu_migrations`);
    const identity = await readAppliedSchemaIdentity(kernel);
    assert.ok(typeof identity === "object", `expected a journal entry, got ${JSON.stringify(identity)}`);
    assert.match(identity.tag, /^\d{4}_/);
    assert.ok(identity.idx >= 0);
  } finally { await kernel.close(); }
});
