import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { sql } from "kysely";

import { contentKernel, schemaErasedKernel } from "../content-kernel.js";
import { openContentDb } from "../sqlite/content-db.js";

/**
 * @file `schemaErasedKernel` is `contentKernel` seen through a schema-less type: the SAME kernel
 * object, never a wrapper, so a transaction opened through one is the transaction the other joins
 * (the storage kernel's nested-call rule) and a rollback through either undoes both writes.
 */

describe("schemaErasedKernel", () => {
  test("returns the kernel contentKernel returns for the same content db handle", () => {
    const db = openContentDb(":memory:");
    assert.equal(schemaErasedKernel({ store: db }), contentKernel({ store: db }));
  });

  test("returns a kernel passed as the store unchanged", () => {
    const kernel = contentKernel({ store: openContentDb(":memory:") });
    assert.equal(schemaErasedKernel({ store: kernel }), kernel);
  });

  test("a transaction opened through one view is joined by the other and rolls back both writes", async () => {
    const db = openContentDb(":memory:");
    const erased = schemaErasedKernel({ store: db });
    const typed = contentKernel({ store: db });
    await typed.execute(sql`CREATE TABLE erased_probe (id INTEGER PRIMARY KEY)`);
    await assert.rejects(
      typed.transaction(async () => {
        await typed.execute(sql`INSERT INTO erased_probe (id) VALUES (1)`);
        await erased.transaction(async () => {
          await erased.run(async (handle) => {
            await sql`INSERT INTO erased_probe (id) VALUES (2)`.execute(handle);
          });
        });
        throw new Error("force rollback");
      }),
      /force rollback/,
    );
    const rows = await typed.query<{ id: number }>(sql`SELECT id FROM erased_probe`);
    assert.deepEqual(rows, []);
  });
});
