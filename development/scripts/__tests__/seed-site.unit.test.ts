import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { findMissingSeedBlobs, seedSite } from "../seed-site.mjs";

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
 *
 * It must ALSO be a file git tracks (2026-09-18). CI and the Fly image build from a git CLONE, so a
 * blob that only ever existed in someone's working tree is absent from the build context no matter
 * how valid it looks locally — the working-tree-only version of this check passed 16 such rows on
 * branch HEAD (see `ADS-memory/reports/2026-09-18-deploy-content-inventory.md` §c). Every temp live
 * dir below is therefore a real `git init` repo, and what is staged in it is the part of the setup
 * that decides pass from fail.
 */

/** A minimal, hermetic `asset_blobs` table — the columns `findMissingSeedBlobs` reads. */
function makeAssetBlobsDb(rows: Array<{ storageKey: string; sha256: string }>): Database.Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE asset_blobs (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL, sha256 TEXT NOT NULL)`);
  const insert = db.prepare(`INSERT INTO asset_blobs (id, storage_key, sha256) VALUES (?, ?, ?)`);
  rows.forEach((row, i) => insert.run(`blob-${i}`, row.storageKey, row.sha256));
  return db;
}

/** Runs one git command in `cwd` with the host's global/system config neutralised, so a developer's
 *  own `core.excludesFile`, template dir, or hooks cannot decide what these tests stage. */
function runGit(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
  if (result.status !== 0) {
    throw new Error(`test setup: git ${args.join(" ")} failed (status ${result.status}): ${result.stderr}`);
  }
}

/** A temp site dir that IS a git repo — the shape a real `sites/<site>/` has. */
function withTempLiveDir(fn: (liveDir: string) => void): void {
  const liveDir = mkdtempSync(join(tmpdir(), "tovu-seed-site-blob-check-"));
  try {
    runGit(liveDir, ["-c", "init.defaultBranch=main", "init", "-q"]);
    fn(liveDir);
  } finally {
    rmSync(liveDir, { recursive: true, force: true });
  }
}

/** A temp site dir that is NOT a git repo and is not inside one — `tmpdir()` never is. */
function withTempNonGitLiveDir(fn: (liveDir: string) => void): void {
  const liveDir = mkdtempSync(join(tmpdir(), "tovu-seed-site-no-git-"));
  try {
    fn(liveDir);
  } finally {
    rmSync(liveDir, { recursive: true, force: true });
  }
}

/** Stages one uploads file into the temp repo's index — `git ls-files` is what the guard reads. */
function trackUpload(liveDir: string, storageKey: string): void {
  runGit(liveDir, ["add", "--", `uploads/${storageKey}`]);
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

test("findMissingSeedBlobs: returns [] when every asset_blobs row has a matching, correctly-hashed, git-tracked uploads file", () => {
  withTempLiveDir((liveDir) => {
    const written = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "real bytes" });
    trackUpload(liveDir, written.storageKey);

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
    trackUpload(liveDir, present.storageKey);
    // Deliberately no file written for this key — this is exactly the state
    // `tovu.fly.dev/admin/media` was found in: a real `asset_blobs` row, no corresponding file.
    const missingKey = "ws/workspace-x/blobs/cd/" + "f".repeat(64);

    const db = makeAssetBlobsDb([present, { storageKey: missingKey, sha256: "f".repeat(64) }]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [{ storageKey: missingKey, reason: "missing" }]);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: REPRODUCES THE DEPLOY GAP — a valid blob that git does not track is reported, because CI builds from a clone", () => {
  withTempLiveDir((liveDir) => {
    // The file is a real, regular file whose bytes hash to the row's own sha256: the working-tree
    // check has nothing to object to, and passed exactly this state 16 times on branch HEAD. It is
    // still unusable to a deploy — `git ls-files` does not list it, so the CI/Fly clone that the
    // Dockerfile copies `uploads/` out of simply does not contain it, and the site boots with media
    // rows whose bytes can never arrive.
    const written = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "on disk, never staged" });
    // Deliberately NOT tracked.

    const db = makeAssetBlobsDb([written]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [{ storageKey: written.storageKey, reason: "untracked" }]);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: a blob tracked by git but deleted from the working tree is reported, not trusted on the index alone", () => {
  withTempLiveDir((liveDir) => {
    // `git ls-files` lists INDEX entries, so it keeps naming a path whose file has been deleted from
    // disk. The bytes cannot be hashed from the working tree any more, and this guard never reads
    // them back out of git's object store, so the honest answer is "missing" rather than a pass
    // granted purely because the index still mentions it.
    const written = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "staged then deleted" });
    trackUpload(liveDir, written.storageKey);
    rmSync(join(liveDir, "uploads", ...written.storageKey.split("/")));

    const db = makeAssetBlobsDb([written]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [{ storageKey: written.storageKey, reason: "missing" }]);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: a gitignored blob is reported as untracked, however valid its bytes are", () => {
  withTempLiveDir((liveDir) => {
    // Ignored is a stronger form of untracked: nothing will ever stage it by accident, so a clone is
    // guaranteed not to have it. (The 16 real cases on branch HEAD were NOT ignored — `git
    // check-ignore` returns rc=1 on them — but the deploy outcome is identical either way.)
    writeFileSync(join(liveDir, ".gitignore"), "uploads/\n");
    const written = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "ignored bytes" });

    const db = makeAssetBlobsDb([written]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [{ storageKey: written.storageKey, reason: "untracked" }]);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: ADVERSARIAL BATCH — one valid, one untracked and one absent row are each reported by their own reason", () => {
  withTempLiveDir((liveDir) => {
    // A mixed batch is the realistic shape (branch HEAD: 26 rows, 13 tracked files, 16 bad). A guard
    // that short-circuits on the first defect, or that lets one good row vouch for the rest, passes
    // every single-row test above and still ships the incident.
    const tracked = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "tracked bytes" });
    trackUpload(liveDir, tracked.storageKey);
    const untracked = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "untracked bytes" });
    const absentKey = "ws/workspace-x/blobs/ab/" + "b".repeat(64);

    const db = makeAssetBlobsDb([tracked, untracked, { storageKey: absentKey, sha256: "b".repeat(64) }]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [
        { storageKey: untracked.storageKey, reason: "untracked" },
        { storageKey: absentKey, reason: "missing" },
      ]);
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: throws rather than passing rows when git cannot answer (live dir is not a git checkout)", () => {
  withTempNonGitLiveDir((liveDir) => {
    // Without git there is no way to tell a blob that will travel from one that will not, and the
    // failure this guard exists to prevent is silent. So it fails loud instead of falling back to
    // the working-tree-only answer that would report this row as fine.
    const written = writeUploadFile(liveDir, { workspaceId: "workspace-x", bytes: "valid but unverifiable" });

    const db = makeAssetBlobsDb([written]);
    try {
      assert.throws(
        () => findMissingSeedBlobs(db, liveDir),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /^seed-site: cannot ask git which files under /);
          assert.match(error.message, /not a git repository/);
          return true;
        }
      );
    } finally {
      db.close();
    }
  });
});

test("findMissingSeedBlobs: returns [] for an empty asset_blobs table, without needing git at all", () => {
  withTempNonGitLiveDir((liveDir) => {
    // Zero rows means nothing can ship without its bytes, so there is nothing to ask git about — and
    // a seed run in a non-checkout directory with no blobs must not fail on that account.
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
    // prevent, just via a directory instead of an absent path. (An empty directory cannot be staged
    // at all, so the working-tree defect is the only one there is to report.)
    const sha256 = "a".repeat(64);
    const storageKey = `ws/workspace-x/blobs/${sha256.slice(0, 2)}/${sha256}`;
    mkdirSync(join(liveDir, "uploads", ...storageKey.split("/")), { recursive: true });

    const db = makeAssetBlobsDb([{ storageKey, sha256 }]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [{ storageKey, reason: "missing" }]);
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
    // deploy in the exact same "row with no bytes" state this check exists to prevent. Staged on
    // purpose: git tracks symlinks happily, so tracking cannot be what saves this case.
    const bytes = Buffer.from("bytes a symlink points at");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storageKey = `ws/workspace-x/blobs/${sha256.slice(0, 2)}/${sha256}`;
    const realPath = join(liveDir, "real-target-file");
    writeFileSync(realPath, bytes);
    const linkPath = join(liveDir, "uploads", ...storageKey.split("/"));
    mkdirSync(join(linkPath, ".."), { recursive: true });
    symlinkSync(realPath, linkPath);
    trackUpload(liveDir, storageKey);

    const db = makeAssetBlobsDb([{ storageKey, sha256 }]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [{ storageKey, reason: "missing" }]);
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
    // build time rather than trusting the filesystem shape alone. Staged on purpose: being tracked
    // must not launder wrong bytes into a pass.
    const claimedSha256 = "c".repeat(64);
    const storageKey = `ws/workspace-x/blobs/${claimedSha256.slice(0, 2)}/${claimedSha256}`;
    const filePath = join(liveDir, "uploads", ...storageKey.split("/"));
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "these bytes do not hash to claimedSha256");
    trackUpload(liveDir, storageKey);

    const db = makeAssetBlobsDb([{ storageKey, sha256: claimedSha256 }]);
    try {
      assert.deepEqual(findMissingSeedBlobs(db, liveDir), [{ storageKey, reason: "missing" }]);
    } finally {
      db.close();
    }
  });
});

/**
 * `openContentDb` drops `ai_chat_messages`/`assistant_agent_sessions`/`ai_chats` (via
 * `dropEmptyLegacyChatTables`) the moment they are empty — which is every site that has never
 * chatted, including a brand-new one. `pruneTransientTables` (this file) then ran an unconditional
 * `DELETE FROM "<table>"` for each of its `PRUNE_TABLES` entries, so seeding such a site failed with
 * "no such table" even though there was nothing to prune. Reproduces without booting a whole site:
 * `openContentDb` on a bare temp path is enough to leave the live db in the exact missing-tables
 * state `site-title-preservation.integration.test.ts`'s AC-23/AC-24 previously had to work around by
 * recreating the three tables empty with `openChatDb` before calling `seedSite`.
 */
test("seedSite: succeeds against a live db that has never chatted, so openContentDb already dropped the empty legacy chat tables", () => {
  withTempLiveDir((liveDir) => {
    const liveDbPath = join(liveDir, "content.db");
    openContentDb(liveDbPath).$client.close();

    const seedDbPath = join(liveDir, "content.seed.db");
    seedSite({ siteName: "prune-guard-test", liveDir, liveDbPath, seedDbPath });

    assert.ok(existsSync(seedDbPath), "seedSite must still publish content.seed.db");
  });
});
