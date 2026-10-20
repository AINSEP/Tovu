import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";

import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import { CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { readAppliedSchemaIdentity } from "../../read-applied-schema-identity.js";
import { runtimeSchemaVersion } from "../../schema-guard.js";

test("SQLite current identity uses the content head, including empty and unknown heads, before falling back when absent", async () => {
  const kernel = freshSqliteContentKernel();
  const first = CONTENT_MIGRATIONS[0].id;
  const later = CONTENT_MIGRATIONS[2].id;
  const runtime = runtimeSchemaVersion();
  try {
    await kernel.execute(sql`DELETE FROM tovu_migrations`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "none");
    await kernel.execute(sql`INSERT INTO tovu_migrations (id, checksum, applied_at) VALUES
      (${first}, 'c', 'later-time'), (${later}, 'c', 'earlier-time')`);
    assert.deepEqual(await readAppliedSchemaIdentity(kernel), { idx: 2, tag: later });
    await kernel.execute(sql`INSERT INTO tovu_migrations (id, checksum, applied_at) VALUES ('9999_unknown', 'c', 'now')`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "diverged");
    await kernel.execute(sql`DROP TABLE tovu_migrations`);
    assert.deepEqual(await readAppliedSchemaIdentity(kernel), { idx: runtime.index, tag: runtime.tag });
    await kernel.execute(sql`DELETE FROM __drizzle_migrations`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "none");
    await kernel.execute(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('unknown', 9999999999999)`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "diverged");
    await kernel.execute(sql`DROP TABLE __drizzle_migrations`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "none");
  } finally {
    await kernel.close();
  }
});

test("SQLite legacy-stamp ignores an adopted content ledger and reports matched, divergent, empty, and absent legacy history", async () => {
  const kernel = freshSqliteContentKernel();
  const runtime = runtimeSchemaVersion();
  const options = { identity: "legacy-stamp" } as const;
  try {
    assert.deepEqual(await readAppliedSchemaIdentity(kernel, options), { idx: runtime.index, tag: runtime.tag });
    await kernel.execute(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('unknown', 9999999999999)`);
    assert.equal(await readAppliedSchemaIdentity(kernel, options), "diverged");
    await kernel.execute(sql`DELETE FROM __drizzle_migrations`);
    assert.equal(await readAppliedSchemaIdentity(kernel, options), "none");
    await kernel.execute(sql`DROP TABLE __drizzle_migrations`);
    assert.equal(await readAppliedSchemaIdentity(kernel, options), "none");
  } finally {
    await kernel.close();
  }
});

for (const identity of ["current", "legacy-stamp"] as const) {
  test(`Postgres ${identity} always uses the content ledger, including absent, empty, known, and unknown heads`, async () => {
    const kernel = openPgliteKernel<unknown>();
    const options = { identity };
    const first = CONTENT_MIGRATIONS[0].id;
    const later = CONTENT_MIGRATIONS[2].id;
    try {
      await kernel.execute(sql`CREATE TABLE __drizzle_migrations (created_at bigint)`);
      await kernel.execute(sql`INSERT INTO __drizzle_migrations VALUES (9999999999999)`);
      assert.equal(await readAppliedSchemaIdentity(kernel, options), "none");
      await kernel.execute(sql`CREATE TABLE tovu_migrations (id text PRIMARY KEY, checksum text, applied_at text)`);
      assert.equal(await readAppliedSchemaIdentity(kernel, options), "none");
      await kernel.execute(sql`INSERT INTO tovu_migrations VALUES
        (${later}, 'c', 'earlier-time'), (${first}, 'c', 'later-time')`);
      assert.deepEqual(await readAppliedSchemaIdentity(kernel, options), { idx: 2, tag: later });
      await kernel.execute(sql`INSERT INTO tovu_migrations VALUES ('9999_unknown', 'c', 'now')`);
      assert.equal(await readAppliedSchemaIdentity(kernel, options), "diverged");
    } finally {
      await kernel.close();
    }
  });
}
