import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { missingDbPathMessage } from "../backfill-db-path.js";

/**
 * @file Adversarial coverage for `backfill-media-slugs.ts` — same "run the real script as a child
 * process against a throwaway `content.db`" pattern `backfill-slug-collision-defaults.test.ts`
 * already establishes for a sibling `development/scripts/` backfill, for the identical reason: the
 * script's `main()` runs unconditionally at import time, so a child process is the only way to
 * invoke it without inheriting this test runner's own argv/cwd.
 *
 * Forces every branch a single-happy-path run against real data would not: a same-base-title
 * collision needing a `-2` suffix, an already-slugged row seeding the collision set, a blank title
 * falling back to `"untitled"`, per-workspace isolation (two workspaces may both legitimately use
 * the same slug), idempotency of a second `--apply`, and the two loud-failure paths
 * (`backfill-slug-collision-defaults.test.ts`'s own unmigrated-db and missing-db cases, mirrored
 * here since this script shares the identical `resolveExistingDbPath`/`openContentDb(ReadOnly)`
 * safety shape).
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-media-slugs.ts");

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function countTables(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

interface SeedRow {
  id: string;
  workspaceId: string;
  title: string | null;
  slug: string | null;
}

function seedDb(dbPath: string, rows: SeedRow[]): void {
  const db = openContentDb(dbPath);
  const insert = db.$client.prepare(
    `INSERT INTO media (id, workspace_id, title, alt, caption, credit, source_sha256, status, created_at, updated_at, version, slug)
     VALUES (?, ?, ?, '', '', '', 'deadbeef', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1, ?)`
  );
  for (const row of rows) {
    insert.run(row.id, row.workspaceId, row.title, row.slug);
  }
  db.$client.close();
}

function readSlugs(dbPath: string): Record<string, string | null> {
  const db = openContentDb(dbPath);
  const rows = db.$client.prepare("SELECT id, slug FROM media").all() as Array<{ id: string; slug: string | null }>;
  db.$client.close();
  return Object.fromEntries(rows.map((r) => [r.id, r.slug]));
}

function runScript(dbPath: string, extraArgs: string[] = []): string {
  return execFileSync("node", ["--import", "tsx", SCRIPT, "--db", dbPath, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

test("backfill-media-slugs: derives per-title slugs, suffixes a same-base collision, isolates per workspace, and defaults a blank title to 'untitled'", () => {
  const scratch = tmpDir("backfill-media-slugs-");
  const dbPath = path.join(scratch, "content.db");

  seedDb(dbPath, [
    // Two rows in the SAME workspace with the same slugified base — must disambiguate -2.
    { id: "row-cat-1", workspaceId: "ws-1", title: "Cat Photo", slug: null },
    { id: "row-cat-2", workspaceId: "ws-1", title: "CAT PHOTO", slug: null },
    // A row that already has a slug matching what a NEW row in the same workspace would derive —
    // must seed the collision set so the new row does NOT collide with it.
    { id: "row-existing", workspaceId: "ws-1", title: "already slugged", slug: "dog-photo" },
    { id: "row-dog", workspaceId: "ws-1", title: "Dog Photo", slug: null },
    // Same title/base slug, but a DIFFERENT workspace — must NOT be suffixed against ws-1's rows.
    { id: "row-cat-ws2", workspaceId: "ws-2", title: "Cat Photo", slug: null },
    // Blank title — must fall back to "untitled".
    { id: "row-blank", workspaceId: "ws-1", title: "", slug: null },
  ]);

  const dryRunOutput = runScript(dbPath);
  assert.match(dryRunOutput, /DRY RUN: id=row-cat-1 .* would set slug='cat-photo'/);
  assert.match(dryRunOutput, /DRY RUN: id=row-cat-2 .* would set slug='cat-photo-2'/);
  assert.match(dryRunOutput, /DRY RUN: id=row-dog .* would set slug='dog-photo-2'/);
  assert.match(dryRunOutput, /DRY RUN: id=row-cat-ws2 .* would set slug='cat-photo'/);
  assert.match(dryRunOutput, /DRY RUN: id=row-blank .* would set slug='untitled'/);
  assert.doesNotMatch(dryRunOutput, /row-existing/, "a row that already has a slug is not a backfill candidate");

  // Dry run must never write.
  const beforeApply = readSlugs(dbPath);
  assert.equal(beforeApply["row-cat-1"], null);
  assert.equal(beforeApply["row-existing"], "dog-photo");

  const applyOutput = runScript(dbPath, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, /BACKFILLED: id=row-cat-1 .* slug='cat-photo'/);

  const afterApply = readSlugs(dbPath);
  assert.equal(afterApply["row-cat-1"], "cat-photo");
  assert.equal(afterApply["row-cat-2"], "cat-photo-2");
  assert.equal(afterApply["row-dog"], "dog-photo-2", "must not collide with row-existing's pre-existing 'dog-photo'");
  assert.equal(afterApply["row-cat-ws2"], "cat-photo", "a different workspace may reuse the same slug text");
  assert.equal(afterApply["row-blank"], "untitled");
  assert.equal(afterApply["row-existing"], "dog-photo", "an already-slugged row must never be touched");

  // Idempotency: running --apply again over an already-processed database must change nothing.
  const secondApplyOutput = runScript(dbPath, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to backfill/);
  assert.deepEqual(readSlugs(dbPath), afterApply, "a second --apply run must be a complete no-op");

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-media-slugs: a dry run against a not-yet-migrated content.db must not migrate it — asserted on the actual file, not a log line", () => {
  const scratch = tmpDir("backfill-media-slugs-nomigrate-");
  const dbPath = path.join(scratch, "content.db");

  new Database(dbPath).close();
  assert.equal(countTables(dbPath), 0, "fixture must start with zero tables");
  const bytesBefore = fs.readFileSync(dbPath);

  assert.throws(() => runScript(dbPath), /Command failed/, "a dry run against an unmigrated db must fail loudly, not silently succeed");

  assert.equal(countTables(dbPath), 0, "dry run must not have created any tables — it must never call migrate()");
  assert.deepEqual(fs.readFileSync(dbPath), bytesBefore, "dry run must not modify the database file at all");

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-media-slugs: a mistyped --db path fails loudly and creates nothing, instead of silently opening an empty database", () => {
  const scratch = tmpDir("backfill-media-slugs-missingdb-");
  const missing = path.join(scratch, "content.db"); // deliberately never created

  let stderr = "";
  try {
    runScript(missing);
    assert.fail("expected the script to throw");
  } catch (err) {
    stderr = `${(err as { stderr?: string }).stderr ?? ""}`;
  }
  assert.equal(stderr.includes(missingDbPathMessage(path.resolve(missing))), true, `expected the exact missing-db message. Got:\n${stderr}`);
  assert.doesNotMatch(stderr, /Nothing to backfill/);
  assert.equal(fs.existsSync(missing), false, "the script must not have created a database at the missing path");

  fs.rmSync(scratch, { recursive: true, force: true });
});
