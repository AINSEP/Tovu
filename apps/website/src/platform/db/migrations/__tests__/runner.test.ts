import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { sql } from "kysely";

import { listTables } from "../../kernel/dialect.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { assertValidSteps, runMigrations } from "../runner.js";
import { MigrationChecksumError, type MigrationStep, UnknownAppliedMigrationError } from "../step.js";

/**
 * @file The migration runner's rules on every embedded dialect: pending steps apply in order and
 * are recorded with their checksum; a rerun applies nothing; a failing step rolls back and stops the
 * run; a recorded step whose checksum changed, or that this runtime does not know, stops the run
 * before anything is applied. Serialization across real connections is `runner.postgres.test.ts`.
 */

const sum = (char: string) => char.repeat(64);

function tableStep(id: string, table: string, checksum = sum("a")): MigrationStep {
  return {
    id,
    checksum,
    up: async (kernel) => {
      await kernel.execute(sql`CREATE TABLE ${sql.table(table)} (id text PRIMARY KEY)`);
    },
  };
}

const kernels: Array<StorageKernel<unknown>> = [];
after(async () => {
  for (const kernel of kernels) await kernel.close();
});

const dialects: Array<{ name: string; open: () => StorageKernel<unknown> }> = [
  { name: "sqlite", open: () => openMemorySqliteKernel<unknown>() },
  { name: "pglite", open: () => openPgliteKernel<unknown>() },
];

for (const { name, open } of dialects) {
  describe(`runMigrations on ${name}`, () => {
    const fresh = () => {
      const kernel = open();
      kernels.push(kernel);
      return kernel;
    };

    test("applies pending steps in order, records them, and a rerun applies nothing", async () => {
      const kernel = fresh();
      const steps = [tableStep("0001_first", "first_t"), tableStep("0002_second", "second_t", sum("b"))];
      const report = await runMigrations(kernel, steps);
      assert.deepEqual(report.applied, ["0001_first", "0002_second"]);
      assert.deepEqual(report.alreadyApplied, []);
      const ledger = await kernel.query<{ id: string; checksum: string; applied_at: string }>(
        sql`SELECT id, checksum, applied_at FROM tovu_migrations ORDER BY id`
      );
      assert.deepEqual(
        ledger.map((row) => [row.id, row.checksum]),
        [
          ["0001_first", sum("a")],
          ["0002_second", sum("b")],
        ]
      );
      assert.match(ledger[0].applied_at, /^\d{4}-\d\d-\d\dT/);

      const again = await runMigrations(kernel, steps);
      assert.deepEqual(again.applied, []);
      assert.deepEqual(again.alreadyApplied, ["0001_first", "0002_second"]);
    });

    test("a failing step rolls back its own changes, is not recorded, and stops later steps", async () => {
      const kernel = fresh();
      const failing: MigrationStep = {
        id: "0002_fails",
        checksum: sum("c"),
        up: async (k) => {
          await k.execute(sql`CREATE TABLE half_done (id text)`);
          throw new Error("boom");
        },
      };
      await assert.rejects(runMigrations(kernel, [tableStep("0001_first", "first_t"), failing, tableStep("0003_third", "third_t")]), /boom/);
      const tables = await listTables(kernel);
      assert.ok(tables.includes("first_t"));
      assert.ok(!tables.includes("half_done"), "the failed step's DDL rolled back");
      assert.ok(!tables.includes("third_t"), "later steps were not attempted");
      const ids = await kernel.query<{ id: string }>(sql`SELECT id FROM tovu_migrations`);
      assert.deepEqual(
        ids.map((row) => row.id),
        ["0001_first"]
      );
    });

    test("a recorded step whose checksum changed stops the run before anything is applied", async () => {
      const kernel = fresh();
      await runMigrations(kernel, [tableStep("0001_first", "first_t")]);
      await assert.rejects(
        runMigrations(kernel, [tableStep("0001_first", "first_t", sum("d")), tableStep("0002_second", "second_t")]),
        (error: unknown) => error instanceof MigrationChecksumError && error.id === "0001_first"
      );
      assert.ok(!(await listTables(kernel)).includes("second_t"));
    });

    test("a recorded step this runtime does not know stops the run (database from a newer Tovu)", async () => {
      const kernel = fresh();
      await runMigrations(kernel, [tableStep("0001_first", "first_t"), tableStep("0002_newer", "newer_t")]);
      await assert.rejects(
        runMigrations(kernel, [tableStep("0001_first", "first_t")]),
        (error: unknown) => error instanceof UnknownAppliedMigrationError && error.ids.join() === "0002_newer"
      );
    });
  });
}

describe("assertValidSteps", () => {
  test("rejects malformed, unordered or duplicate ids and missing checksums", () => {
    assert.throws(() => assertValidSteps([tableStep("1_bad", "t")]), /NNNN_snake_name/);
    assert.throws(() => assertValidSteps([tableStep("0002_b", "t"), tableStep("0001_a", "t")]), /out of order/);
    assert.throws(() => assertValidSteps([tableStep("0001_a", "t"), tableStep("0001_a", "t")]), /out of order or duplicated/);
    assert.throws(() => assertValidSteps([tableStep("0001_a", "t", "nope")]), /sha256/);
  });
});
