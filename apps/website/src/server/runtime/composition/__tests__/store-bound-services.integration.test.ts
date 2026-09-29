import assert from "node:assert/strict";
import { test } from "node:test";

import { RestorePointsUnavailableError } from "#src/platform/db/postgres/db-ops-adapter";
import { sharedPgContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { prepareContentStore } from "#src/platform/db/prepare-content-store";
import { pgOnlyServices } from "../store-bound-services.js";

/**
 * @file R1f — `pgOnlyServices`, the Postgres/PGlite twin of `sqliteOnlyServices`, on a migrated
 * PGlite content database (real Postgres: `create-site-route-deps.postgres.test.ts`).
 *
 * Outcome Matrix:
 *   Given a prepared database   -> stampWatermark (awaited) advances the singleton row by one per call
 *   Given the same              -> dbOps reports restore points unavailable; capture and restore refuse
 */

// Closed by the matrix module after the file.
const kernel = sharedPgContentKernel();

async function watermark(): Promise<number> {
  const row = await kernel.run((db) => db.selectFrom("database_write_watermark").select("value").where("id", "=", 1).executeTakeFirstOrThrow());
  return Number(row.value);
}

test("stampWatermark advances the watermark once per awaited call", async () => {
  await prepareContentStore(kernel);
  const services = pgOnlyServices(kernel);
  const before = await watermark();
  await services.stampWatermark();
  await services.stampWatermark();
  assert.equal(await watermark(), before + 2);
});

test("dbOps: restore points are reported unavailable and refused", async () => {
  const { dbOps } = pgOnlyServices(kernel);
  assert.deepEqual(await dbOps.getCapabilities(), { restorePoint: { costClass: "unavailable", kind: "logical-dump" } });
  await assert.rejects(dbOps.captureRestorePoint({ scopeId: "r1f" }), RestorePointsUnavailableError);
  await assert.rejects(dbOps.restoreFromArtifact({ artifactRef: "x" }), RestorePointsUnavailableError);
});
