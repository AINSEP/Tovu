import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { CONTENT_MIGRATIONS, migrateContentDatabase } from "#src/platform/db/migrations/index";
import { readAppliedSchemaIdentity } from "../read-applied-schema-identity.js";

/** DBMERGE-PLAN bug B1 (P1): current schema identity names the same head on both dialects.
 * The reader falls back to the Drizzle journal only for pre-adoption files; the file wrapper's
 * explicit legacy-stamp view continues serving boot/repair's frozen site-meta comparison.
 */
const head = CONTENT_MIGRATIONS.at(-1)!;
const expectedHead = { idx: CONTENT_MIGRATIONS.length - 1, tag: head.id };

test("SQLite at head reports the last tovu_migrations step, like Postgres", async () => {
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

test("an adopted SQLite ledger never falls back to stale Drizzle history when empty or diverged", async () => {
  const kernel = freshSqliteContentKernel();
  try {
    await kernel.execute(sql`UPDATE tovu_migrations SET id = '9999_newer_content_step' WHERE id = ${head.id}`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "diverged");
    await kernel.execute(sql`DELETE FROM tovu_migrations`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "none");
    assert.equal(typeof await readAppliedSchemaIdentity(kernel, { identity: "legacy-stamp" }), "object");
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
