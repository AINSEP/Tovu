import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
 *
 * `asset_blobs.storage_key` is content-addressed (`ws/{workspaceId}/blobs/{shard}/{sha256}`), so
 * `findMissingSeedBlobs()` verifies more than bare existence: the file at that path must be a
 * REGULAR file (not a directory or symlink) whose actual bytes hash to the row's own `sha256`
 * column. The tests below cover all three ways a stale `fs.existsSync()`-only check could be
 * fooled into shipping an unusable "blob": a directory, a symlink, and a wrong-content file.
 */

/** A minimal, hermetic `asset_blobs` table — the columns `findMissingSeedBlobs` reads. */
function makeAssetBlobsDb(rows: Array<{ storageKey: string; sha256: string }>): Database.Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE asset_blobs (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL, sha256 TEXT NOT NULL)`);
  const insert = db.prepare(`INSERT INTO asset_blobs (id, storage_key, sha256) VALUES (?, ?, ?)`);
  rows.forEach((row, i) => insert.run(`blob-${i}`, row.storageKey, row.sha256));
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

/** Writes `bytes` under `<liveDir>/uploads/ws/<workspaceId>/blobs/<shard>/<sha256>`, matching
 *  `computeBlobStorageKey`'s own template, and returns the resulting row shape. */
function writeUploadFile(liveDir: string, input: { workspaceId: string; bytes: Buffer | string }): { storageKey: string; sha256: string } {
  const bytes = typeof input.bytes === "string" ? Buffer.from(input.bytes) : input.bytes;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `ws/${input.workspaceId}/blobs/${sha256.slice(0, 2)}/${sha256}`;
  const filePath = join(liveDir, "uploads", ...storageKey.split("/"));
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, bytes);
  return { storageKey, sha256 };
}

test("findMissingSeedBlobs: returns [] when every asset_blobs row has a matching, correctly-hashed uploads file", () => {
  withTempLiveDir((liveDir) => {
    const written = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "real bytes" });

    const db = makeAssetBlobsDb([written]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), []);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: REPRODUCES THE INCIDENT — a row whose storage_key has no file is reported, not silently shipped", () => {
  withTempLiveDir((liveDir) => {
    const present = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "present" });
    // Deliberately no file written for this key — this is exactly the state
    // `tovu.fly.dev/admin/media` was found in: a real `asset_blobs` row, no corresponding file.
    const missingKey = "ws/workspace-x/blobs/cd/" + "f".repeat(64);

    const db = makeAssetBlobsDb([present, { storageKey: missingKey, sha256: "f".repeat(64) }]);
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

test("findMissingSeedBlobs: REGRESSION — a DIRECTORY at the storage_key path is reported, not accepted as a blob", () => {
  withTempLiveDir((liveDir) => {
    // A directory happens to sit at the exact path a blob file would occupy — e.g. a botched
    // extraction step, or a leftover empty `mkdir -p` from an earlier run. `fs.existsSync()` alone
    // returns true for this; `hydrateBlobStoreFromSeed()`'s runtime traversal skips it (it only
    // picks up `entry.isFile()` dirents), so a row that passes this check because of a directory
    // would ship with permanently missing bytes — this is the exact incident this check exists to
    // prevent, just via a directory instead of an absent path.
    const sha256 = "a".repeat(64);
    const storageKey = `ws/workspace-x/blobs/${sha256.slice(0, 2)}/${sha256}`;
    mkdirSync(join(liveDir, "uploads", ...storageKey.split("/")), { recursive: true });

    const db = makeAssetBlobsDb([{ storageKey, sha256 }]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [storageKey]);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: REGRESSION — a SYMLINK at the storage_key path is reported, even one pointing at valid bytes", () => {
  withTempLiveDir((liveDir) => {
    // The symlink's TARGET has the exact right bytes — proving this is not merely a "the file is
    // unreadable" check. It is still rejected because `hydrateBlobStoreFromSeed()`'s directory walk
    // (Dirent-based `entry.isFile()`) does not pick up symlinks either — shipping one here would
    // pass this build-time check but still be silently skipped by the runtime hydrator, landing the
    // deploy in the exact same "row with no bytes" state this check exists to prevent.
    const bytes = Buffer.from("bytes a symlink points at");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storageKey = `ws/workspace-x/blobs/${sha256.slice(0, 2)}/${sha256}`;
    const realPath = join(liveDir, "real-target-file");
    writeFileSync(realPath, bytes);
    const linkPath = join(liveDir, "uploads", ...storageKey.split("/"));
    mkdirSync(join(linkPath, ".."), { recursive: true });
    symlinkSync(realPath, linkPath);

    const db = makeAssetBlobsDb([{ storageKey, sha256 }]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [storageKey]);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: REGRESSION — a regular file with the WRONG bytes at the storage_key path is reported, not accepted on path match alone", () => {
  withTempLiveDir((liveDir) => {
    // The path is exactly right; the bytes are not what the row's sha256 (and therefore the key's
    // own hash segment) claims. `fs.existsSync()` cannot see this at all — only a hash comparison
    // against the row's actual content can, which is the whole point of this check existing at
    // build time rather than trusting the filesystem shape alone.
    const claimedSha256 = "c".repeat(64);
    const storageKey = `ws/workspace-x/blobs/${claimedSha256.slice(0, 2)}/${claimedSha256}`;
    const filePath = join(liveDir, "uploads", ...storageKey.split("/"));
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "these bytes do not hash to claimedSha256");

    const db = makeAssetBlobsDb([{ storageKey, sha256: claimedSha256 }]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [storageKey]);
    } finally {
      db.close();
    }
  });
});
