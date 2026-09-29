import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import { dropDatabase } from "../../migration/pg-fixture.js";
import { freshPostgresDatabase } from "../../__tests__/postgres-database.js";
import { openPostgresKernel } from "../drivers/postgres.js";
import { StorageOpError, StorageOpNotSupportedError, storageOps } from "../ops.js";
import type { StorageKernel } from "../port.js";

/**
 * @file The storage ops port on a real Postgres server (node-postgres): no file copy, with the reason
 * named; compacting is `VACUUM (ANALYZE)` plus a read-back of the migration ledger.
 */

const DB = "tovu_kernel_ops_test";
let kernel: StorageKernel<unknown>;

before(() => {
  kernel = openPostgresKernel<unknown>({ connectionString: freshPostgresDatabase(DB) });
});
after(async () => {
  await kernel.close();
  dropDatabase(DB);
});

test("Postgres copyTo is refused with what to do instead", async () => {
  await assert.rejects(storageOps(kernel).copyTo("/never"), (err: unknown) => {
    assert.ok(err instanceof StorageOpNotSupportedError);
    assert.equal(
      err.message,
      "storage op copyTo is not supported on the node-postgres driver: a Postgres site is backed up by its provider; use the move/transfer tools to copy it"
    );
    return true;
  });
});

test("Postgres compactAndVerify refuses a missing ledger, then passes once it has a step", async () => {
  await assert.rejects(storageOps(kernel).compactAndVerify(), (err: unknown) => {
    assert.ok(err instanceof StorageOpError);
    assert.match(err.message, /^the migration ledger tovu_migrations cannot be read back: relation "tovu_migrations" does not exist/);
    return true;
  });
  await kernel.execute(sql`CREATE TABLE tovu_migrations (id text PRIMARY KEY)`);
  await kernel.execute(sql`INSERT INTO tovu_migrations VALUES ('0000_test')`);
  await storageOps(kernel).compactAndVerify();
  await assert.rejects(kernel.transaction(async () => storageOps(kernel).compactAndVerify()), /must be called outside a transaction/);
});
