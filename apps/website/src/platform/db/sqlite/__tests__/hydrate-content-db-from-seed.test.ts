import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { hydrateContentDbFromSeed } from "../hydrate-content-db-from-seed.js";

/**
 * @file `hydrateContentDbFromSeed()` — the first-boot copy that connects a deployed container's
 * committed `content.seed.db` to the `content.db` it actually boots from.
 *
 * This is the regression surface for the gap `seed-site.mjs`'s own header flags as open: a fresh
 * container volume had neither file wired together, so a deploy came up with no site. The property
 * that matters most here is the inverse of that bug: once `content.db` exists, a later redeploy must
 * never overwrite it — that would be silent, unrecoverable production data loss.
 *
 * Every case runs against a throwaway seed file and a throwaway site dir under `os.tmpdir()`, never
 * the real `sites/tovu-com/`.
 */

const tempRoots: string[] = [];

after(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway stock seed file — content.seed.db is a plain SQLite file; a byte string stands in. */
function makeSeedDb(contents = "SEED-BYTES"): string {
  const root = mkdtempSync(join(tmpdir(), "tovu-content-seed-"));
  tempRoots.push(root);
  const seedDbPath = join(root, "content.seed.db");
  writeFileSync(seedDbPath, contents);
  return seedDbPath;
}

/** A throwaway site root whose `content.db` does NOT yet exist. */
function makeEmptySiteRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tovu-hydrate-site-"));
  tempRoots.push(root);
  return root;
}

test("hydrates content.db from the seed on a fresh volume with no content.db yet", () => {
  const seedDbPath = makeSeedDb("SEED-BYTES");
  const dbPath = join(makeEmptySiteRoot(), "content.db");

  const result = hydrateContentDbFromSeed({ seedDbPath, dbPath });

  assert.equal(result.status, "seeded");
  assert.equal(result.dbPath, dbPath);
  assert.equal(readFileSync(dbPath, "utf8"), "SEED-BYTES");
});

test("REGRESSION: a second boot never touches an existing content.db -- redeploying must not clobber live production data", () => {
  const seedDbPath = makeSeedDb("SEED-BYTES");
  const dbPath = join(makeEmptySiteRoot(), "content.db");
  // Simulates real production data written after the first-boot hydration: distinct from the seed.
  writeFileSync(dbPath, "LIVE-PRODUCTION-DATA-DO-NOT-OVERWRITE");
  const before = readFileSync(dbPath);

  const result = hydrateContentDbFromSeed({ seedDbPath, dbPath });

  assert.equal(result.status, "already-present");
  assert.deepEqual(readFileSync(dbPath), before);
  assert.notEqual(readFileSync(dbPath, "utf8"), "SEED-BYTES");
});

test("reports no-seed-source instead of throwing when no stock seed ships for this site", () => {
  const dbPath = join(makeEmptySiteRoot(), "content.db");

  const result = hydrateContentDbFromSeed({
    seedDbPath: join(tmpdir(), "tovu-seed-that-does-not-exist.db"),
    dbPath,
  });

  assert.equal(result.status, "no-seed-source");
  assert.equal(existsSync(dbPath), false);
});

test("is idempotent across many boots: seeds once, then leaves every later boot's edits untouched", () => {
  const seedDbPath = makeSeedDb("SEED-BYTES");
  const dbPath = join(makeEmptySiteRoot(), "content.db");

  assert.equal(hydrateContentDbFromSeed({ seedDbPath, dbPath }).status, "seeded");
  writeFileSync(dbPath, "EDITED-AFTER-FIRST-BOOT");

  assert.equal(hydrateContentDbFromSeed({ seedDbPath, dbPath }).status, "already-present");
  assert.equal(readFileSync(dbPath, "utf8"), "EDITED-AFTER-FIRST-BOOT");

  assert.equal(hydrateContentDbFromSeed({ seedDbPath, dbPath }).status, "already-present");
  assert.equal(readFileSync(dbPath, "utf8"), "EDITED-AFTER-FIRST-BOOT");
});

test("creates missing parent directories of the site's content.db path", () => {
  const seedDbPath = makeSeedDb("SEED-BYTES");
  const dbPath = join(makeEmptySiteRoot(), "nested", "deeper", "content.db");

  assert.equal(hydrateContentDbFromSeed({ seedDbPath, dbPath }).status, "seeded");
  assert.ok(existsSync(dbPath));
});

test("leaves no staging file behind after a successful hydration", () => {
  const seedDbPath = makeSeedDb("SEED-BYTES");
  const siteRoot = makeEmptySiteRoot();
  const dbPath = join(siteRoot, "content.db");

  hydrateContentDbFromSeed({ seedDbPath, dbPath });

  assert.deepEqual(readdirSync(siteRoot), ["content.db"]);
});

test("a leftover staging file from an interrupted boot does not block the next hydration", () => {
  const seedDbPath = makeSeedDb("SEED-BYTES");
  const siteRoot = makeEmptySiteRoot();
  const dbPath = join(siteRoot, "content.db");
  mkdirSync(siteRoot, { recursive: true });
  writeFileSync(join(siteRoot, "content.db.hydrate-seed-staging"), "PARTIAL-JUNK");

  const result = hydrateContentDbFromSeed({ seedDbPath, dbPath });

  assert.equal(result.status, "seeded");
  assert.equal(readFileSync(dbPath, "utf8"), "SEED-BYTES");
});

test("REGRESSION: a stray -wal/-shm sidecar left at the target path does not survive a fresh hydration", () => {
  // seed-site.mjs's own vacuumAndVerify TRUNCATE-checkpoints before publishing, so the seed itself
  // never carries a sidecar -- but a fresh hydration must still not let some earlier interrupted
  // attempt's sidecar ride along, or a WAL replay would run against the wrong main file.
  const seedDbPath = makeSeedDb("SEED-BYTES");
  const siteRoot = makeEmptySiteRoot();
  const dbPath = join(siteRoot, "content.db");
  writeFileSync(`${dbPath}-wal`, "stale-wal");
  writeFileSync(`${dbPath}-shm`, "stale-shm");

  const result = hydrateContentDbFromSeed({ seedDbPath, dbPath });

  assert.equal(result.status, "seeded");
  assert.equal(existsSync(`${dbPath}-wal`), false);
  assert.equal(existsSync(`${dbPath}-shm`), false);
});
