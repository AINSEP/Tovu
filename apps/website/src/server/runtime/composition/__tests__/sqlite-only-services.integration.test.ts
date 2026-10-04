import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { contentKernel } from "#src/platform/db/content-kernel";
import { prepareContentStore } from "#src/platform/db/prepare-content-store";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { readKernelWatermark } from "#src/platform/db/watermark-kernel";
import { sqliteOnlyServices } from "../sqlite-only-services.js";

/**
 * @file R1d — `sqliteOnlyServices`, the one SQLite-bound seam of the composition body.
 *
 * Outcome Matrix:
 *   Given an open, prepared content.db   -> stampWatermark bumps the file's watermark
 *   Given the same                       -> dbOps captures a restore point of that file at the current watermark
 * (The transfer destination repo left this seam in R1f: it is a kernel repo on every dialect.)
 */

test("each SQLite-bound service works on the handle and file it was given", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sqlite-only-services-"));
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  try {
    await prepareContentStore(contentKernel(db));
    const services = sqliteOnlyServices(db, dbPath);

    const before = await readKernelWatermark(contentKernel(db));
    await services.stampWatermark();
    assert.equal(await readKernelWatermark(contentKernel(db)), before + 1);

    db.$client.exec("CREATE TABLE service_capture_probe (value TEXT NOT NULL); INSERT INTO service_capture_probe VALUES ('captured row')");

    const restorePoint = await services.dbOps.captureRestorePoint({ scopeId: "r1d-test" });
    assert.equal(restorePoint.watermarkAtCapture, before + 1);
    assert.equal(typeof restorePoint.artifactRef, "string");

    assert.ok(fs.statSync(restorePoint.artifactRef).size > 0);
    const artifact = new Database(restorePoint.artifactRef, { readonly: true, fileMustExist: true });
    try {
      assert.deepEqual(artifact.prepare("SELECT value FROM database_write_watermark WHERE id = 1").get(), { value: before + 1 });
      assert.deepEqual(artifact.prepare("SELECT value FROM service_capture_probe").all(), [{ value: "captured row" }]);
    } finally { artifact.close(); }
    await services.stampWatermark();
    db.$client.exec("UPDATE service_capture_probe SET value = 'later mutation'");
    assert.deepEqual(await services.dbOps.restoreFromArtifact({ artifactRef: restorePoint.artifactRef }), { restartRequired: true });
    db.$client.close();
    const restored = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.deepEqual(restored.prepare("SELECT value FROM database_write_watermark WHERE id = 1").get(), { value: before + 1 });
      assert.deepEqual(restored.prepare("SELECT value FROM service_capture_probe").all(), [{ value: "captured row" }]);
    } finally { restored.close(); }

  } finally {
    if (db.$client.open) db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
