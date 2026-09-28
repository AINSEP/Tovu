import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { DatabaseDestinationRecord } from "#src/features/database-transfer/destination-store";
import { contentKernel } from "#src/platform/db/content-kernel";
import { prepareContentStore } from "#src/platform/db/prepare-content-store";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { getCurrentWatermark } from "#src/platform/db/sqlite/watermark";
import { sqliteOnlyServices } from "../sqlite-only-services.js";

/**
 * @file R1d — `sqliteOnlyServices`, the one SQLite-bound seam of the composition body.
 *
 * Outcome Matrix:
 *   Given an open, prepared content.db   -> stampWatermark bumps the file's watermark
 *   Given the same                       -> dbOps captures a restore point of that file at the current watermark
 *   Given the same                       -> the transfer destination repo round-trips a row
 */

test("each SQLite-bound service works on the handle and file it was given", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sqlite-only-services-"));
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  try {
    await prepareContentStore(contentKernel(db));
    const services = sqliteOnlyServices(db, dbPath);

    const before = getCurrentWatermark({ db }).value;
    services.stampWatermark();
    assert.equal(getCurrentWatermark({ db }).value, before + 1);

    const restorePoint = await services.dbOps.captureRestorePoint({ scopeId: "r1d-test" });
    assert.equal(restorePoint.watermarkAtCapture, before + 1);
    assert.equal(typeof restorePoint.artifactRef, "string");

    const record: DatabaseDestinationRecord = {
      workspaceId: "workspace-local",
      description: { host: "db.example", port: "5432", database: "site", user: "tovu" },
      sealed: { keyId: "k", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
      aadVersion: 1,
      savedAt: "2026-09-28T00:00:00.000Z",
      lastRunJson: null,
    };
    await services.databaseTransferDestinationRepo.upsert(record);
    assert.deepEqual(await services.databaseTransferDestinationRepo.find("workspace-local"), record);
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
