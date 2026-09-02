import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { findMissingSeedBlobs } from "../seed-site.mjs";

/**
 * @file Direct unit test for `seed-site.mjs`'s `findMissingSeedBlobs()` — the build-time guard that
 * refuses to publish a `content.seed.db` whose `asset_blobs` rows point at bytes the seed payload
 * does not actually have (the exact production incident `hydrate-blob-store-from-seed.ts`'s header
 * documents: real rows, missing files, every admin media preview 500ing). Mirrors
 * `generate-seed-content.unit.test.ts`'s precedent — this function is exported specifically so it
 * is importable here without running the rest of the script's live-db-copying `main()`.
 */

/** A minimal, hermetic `asset_blobs` table — only the one column `findMissingSeedBlobs` reads. */
function makeAssetBlobsDb(storageKeys: string[]): Database.Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE asset_blobs (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL)`);
  const insert = db.prepare(`INSERT INTO asset_blobs (id, storage_key) VALUES (?, ?)`);
  storageKeys.forEach((storageKey, i) => insert.run(`blob-${i}`, storageKey));
  return db;
}

function withTempLiveDir(fn: (liveDir: string) => void): void {
  const liveDir = mkdtempSync(join(tmpdir(), "tovu-seed-site-blob-check-"));
  try {
    fn(liveDir);
  } finally {
    rmSync(liveDir, { recursive: true, force: true });
  }
}

test("findMissingSeedBlobs: returns [] when every asset_blobs row has a matching uploads file", () => {
  withTempLiveDir((liveDir) => {
    const storageKey = "ws/workspace-x/blobs/ab/abc123";
    mkdirSync(join(liveDir, "uploads", "ws", "workspace-x", "blobs", "ab"), { recursive: true });
    writeFileSync(join(liveDir, "uploads", storageKey), "bytes");

    const db = makeAssetBlobsDb([storageKey]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), []);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: REPRODUCES THE INCIDENT — a row whose storage_key has no file is reported, not silently shipped", () => {
  withTempLiveDir((liveDir) => {
    const presentKey = "ws/workspace-x/blobs/ab/present";
    const missingKey = "ws/workspace-x/blobs/cd/missing";
    mkdirSync(join(liveDir, "uploads", "ws", "workspace-x", "blobs", "ab"), { recursive: true });
    writeFileSync(join(liveDir, "uploads", presentKey), "bytes");
    // Deliberately no file written for `missingKey` — this is exactly the state
    // `tovu.fly.dev/admin/media` was found in: a real `asset_blobs` row, no corresponding file.

    const db = makeAssetBlobsDb([presentKey, missingKey]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [missingKey]);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: returns [] for an empty asset_blobs table", () => {
  withTempLiveDir((liveDir) => {
    const db = makeAssetBlobsDb([]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), []);
    } finally {
      db.close();
    }
  });
});
