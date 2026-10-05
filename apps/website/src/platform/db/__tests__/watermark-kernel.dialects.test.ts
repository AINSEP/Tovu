import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import Database from "better-sqlite3";
import { sql } from "kysely";

import type { MirrorStorePort } from "#src/contracts/core/gated-mutations/ports";
import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { closeSqliteConnection } from "../kernel/drivers/sqlite.js";
import { freshSqliteContentKernel, sharedPgContentKernel } from "../kernel/__tests__/dialect-matrix.js";
import { prepareContentStore } from "../prepare-content-store.js";
import { openContentDb } from "../sqlite/content-db.js";
import { kernelStampWatermark, readKernelWatermark, reconcileMirror } from "../watermark-kernel.js";

/**
 * @file SPEC-016 C-004 / U-002 / U-004 / INV-01 / AC-01 — the site write watermark on the content
 * kernel, SQLite and PGlite: the stamp advances by exactly 1 and commits or rolls back with the
 * transaction it joins; the read; the read-side mirror reconciliation. Plus SQLite's single-writer
 * serialization of a stamping transaction against a second connection (EC-01).
 */

/** A prepared content store (the watermark singleton row at 0). */
async function preparedKernel(dialect: "sqlite" | "pglite"): Promise<ContentKernel> {
  const kernel = dialect === "sqlite" ? freshSqliteContentKernel() : sharedPgContentKernel();
  await prepareContentStore(kernel);
  await kernel.execute(sql`UPDATE database_write_watermark SET value = 0 WHERE id = 1`);
  return kernel;
}

function fakeMirror(initial: { value: number; staleness: "fresh" | "unrefreshable" }): MirrorStorePort & { value: number; staleness: string } {
  return {
    ...initial,
    async set(value: number) {
      this.value = value;
      this.staleness = "fresh";
    },
    async markUnrefreshable() {
      this.staleness = "unrefreshable";
    },
  } as MirrorStorePort & { value: number; staleness: string };
}

for (const dialect of ["sqlite", "pglite"] as const) {
  describe(`watermark on the content kernel [${dialect}]`, () => {
    test("AC-01 / U-002-B1: a stamp inside a transaction commits with its sibling write, +1 exactly", async () => {
      const kernel = await preparedKernel(dialect);
      const stamp = kernelStampWatermark(kernel);
      await kernel.transaction(async () => {
        await stamp();
        await kernel.execute(sql`UPDATE database_write_watermark SET last_stamped_at = 'sibling' WHERE id = 1`);
      });
      assert.equal(await readKernelWatermark(kernel), 1);
      const row = await kernel.run((db) => db.selectFrom("database_write_watermark").select("last_stamped_at").where("id", "=", 1).executeTakeFirstOrThrow());
      assert.equal(row.last_stamped_at, "sibling");
    });

    test("an ordinary stamp records the current timestamp", async (t) => {
      const kernel = await preparedKernel(dialect);
      t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-04T12:34:56.789Z") });
      await kernelStampWatermark(kernel)();
      const row = await kernel.run((db) => db.selectFrom("database_write_watermark").select("last_stamped_at").where("id", "=", 1).executeTakeFirstOrThrow());
      assert.equal(row.last_stamped_at, "2026-10-04T12:34:56.789Z");
    });

    test("INV-01: a transaction that fails rolls its stamp back", async () => {
      const kernel = await preparedKernel(dialect);
      const stamp = kernelStampWatermark(kernel);
      await assert.rejects(
        kernel.transaction(async () => {
          await stamp();
          throw new Error("the gated write failed");
        }),
        /the gated write failed/
      );
      assert.equal(await readKernelWatermark(kernel), 0);
    });

    test("INV-01: N stamps leave initial + N, never decreasing", async () => {
      const kernel = await preparedKernel(dialect);
      const stamp = kernelStampWatermark(kernel);
      const observed = [await readKernelWatermark(kernel)];
      for (let i = 0; i < 10; i += 1) {
        await stamp();
        observed.push(await readKernelWatermark(kernel));
      }
      assert.deepEqual(observed, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test("U-004-B1 / REQ-04: reconcileMirror overwrites the mirror from the authoritative value", async () => {
      const kernel = await preparedKernel(dialect);
      const stamp = kernelStampWatermark(kernel);
      await stamp();
      await stamp();
      const mirror = fakeMirror({ value: 999, staleness: "fresh" });
      await reconcileMirror({ kernel, mirror });
      assert.equal(mirror.value, 2, "never the stale prior value");
      assert.equal(mirror.staleness, "fresh");
    });
  });
}

describe("watermark: dialect-free cases", () => {
  test("U-004-B2 / REQ-05: no content database leaves the mirror's value and marks it 'unrefreshable'", async () => {
    const mirror = fakeMirror({ value: 42, staleness: "fresh" });
    await reconcileMirror({ kernel: null, mirror });
    assert.equal(mirror.value, 42);
    assert.equal(mirror.staleness, "unrefreshable");
  });

  test("a store without the singleton row reads 0", async () => {
    assert.equal(await readKernelWatermark(freshSqliteContentKernel()), 0);
  });

  test("EC-01 (SQLite): a second connection cannot open a write transaction while a stamping one is open", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-watermark-kernel-"));
    const file = path.join(dir, "content.db");
    const db = openContentDb(file);
    const kernel = contentKernel(db);
    await prepareContentStore(kernel);
    const other = new Database(file);
    other.pragma("busy_timeout = 0");
    let code: string | undefined;
    try {
      await kernel.transaction(async () => {
        await kernelStampWatermark(kernel)();
        try {
          other.exec("BEGIN IMMEDIATE; COMMIT;");
        } catch (err) {
          code = (err as NodeJS.ErrnoException).code;
        }
      });
      assert.equal(code, "SQLITE_BUSY", "the single writer serializes; never an interleaved write");
      assert.equal(await readKernelWatermark(kernel), 1);
    } finally {
      other.close();
      closeSqliteConnection(db);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
