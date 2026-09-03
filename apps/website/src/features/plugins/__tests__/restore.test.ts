import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreFromSnapshot } from "../restore.js";

test("restoreFromSnapshot: restores db from snapshot and cleans wal/shm sidecars", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "restore-test-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const dbPath = join(dir, "content.db");
  const snapshotPath = join(dir, "content.db.snapshot");
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  writeFileSync(snapshotPath, "snapshot-content", "utf8");
  writeFileSync(dbPath, "corrupt-content", "utf8");
  writeFileSync(walPath, "stale-wal", "utf8");
  writeFileSync(shmPath, "stale-shm", "utf8");

  // Call with explicit optional parameter
  restoreFromSnapshot({ dbPath, snapshotPath }, {});

  assert.equal(readFileSync(dbPath, "utf8"), "snapshot-content");
  assert.equal(existsSync(walPath), false, "wal should be removed");
  assert.equal(existsSync(shmPath), false, "shm should be removed");

  // Call again without sidecars existing and with default _optional argument
  writeFileSync(snapshotPath, "snapshot-content-v2", "utf8");
  restoreFromSnapshot({ dbPath, snapshotPath });

  assert.equal(readFileSync(dbPath, "utf8"), "snapshot-content-v2");
  assert.equal(existsSync(walPath), false);
  assert.equal(existsSync(shmPath), false);
});
