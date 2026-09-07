/**
 * Backfills `media.slug` for every row written before the 2026-09-07 slug feature existed.
 *
 * ## Why this script exists
 *
 * `idx_media_workspace_slug` (`drizzle/0059_woozy_micromacro.sql`) added a nullable `slug` column
 * plus a `UNIQUE(workspace_id, slug)` index in one migration — safe to apply immediately against a
 * table with existing rows because SQL treats every `NULL` as distinct from every other `NULL` for
 * uniqueness purposes, so a table full of `NULL` slugs cannot violate the constraint. That migration
 * deliberately does not (and structurally cannot, being a schema-only DDL change) assign a real slug
 * to a single existing row — this script is the separate, explicit, re-runnable step that does.
 *
 * Every row this script ever touches has `slug IS NULL` in its `WHERE` clause — the same
 * "the WHERE clause itself is the blast-radius limiter, not a runtime check" discipline
 * `backfill-slug-collision-defaults.ts` documents for its own identically-shaped script.
 *
 * ## Derivation
 *
 * `deriveMediaSlug`/`uniqueSlugForRow` below duplicate (not import) the exact algorithm
 * `@jini-ai/cms/media`'s `media-service.ts` uses for a live upload's own slug derivation
 * (`slugifyMediaTitle`/`deriveUniqueMediaSlug`) — hand-copied across the repo boundary the same way
 * this codebase already mirrors `DEFAULT_ALLOWED_MIME_TYPES` into `FILE_HANDLER_ALLOWED_MIME_TYPES`/
 * `IMPORTABLE_CONTENT_TYPES`, since a one-off backfill script has no reason to make Tovu take on a
 * runtime dependency Jini doesn't otherwise export at that surface. Any future drift between the two
 * copies only affects which slug a legacy row gets on first backfill, never live-upload behavior.
 *
 * A title that slugifies to the empty string (all-punctuation, or a row somehow carrying a blank
 * title despite `uploadMedia`'s own non-empty guarantee) falls back to the literal base `"untitled"`
 * — the same fallback the live derivation uses, disambiguated by the identical `-2`/`-3`/... suffix
 * loop when more than one such row exists in the same workspace.
 *
 * Processed per-workspace (uniqueness is `(workspace_id, slug)`, matching `idx_media_workspace_slug`
 * exactly) and in `(created_at, id)` order within each workspace — a fixed, deterministic order so a
 * dry run and a following `--apply` run assign identical slugs to identical rows, and so re-running
 * against the same untouched data is fully reproducible.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write. A `--db` that does not resolve to a real,
 * already-existing file (the default included) fails loudly via `resolveExistingDbPath` before
 * anything is opened — `openContentDb` creates-and-migrates on open, so a typo'd path would otherwise
 * open (and migrate) a brand-new empty database and report "0 row(s) to backfill" instead of the real
 * problem. A dry run opens strictly read-only (`openContentDbReadOnly`), so unlike an ordinary
 * `openContentDb` open it never migrates the schema either — only `--apply` does.
 *
 * A whole-file online-backup restore point (`@jini-ai/infra`'s `SqliteDbOpsAdapter`) is captured
 * immediately before the first write in an `--apply` run — same mechanism
 * `backfill-slug-collision-defaults.ts`/`convert-legacy-doc-pages-to-html.ts` already use.
 *
 * Idempotent: only rows with `slug IS NULL` are ever selected, and every write sets a non-null slug
 * — a second `--apply` run over an already-processed database finds zero candidate rows and changes
 * nothing.
 *
 * Usage:
 *   npx tsx development/scripts/backfill-media-slugs.ts               (dry run)
 *   npx tsx development/scripts/backfill-media-slugs.ts --apply
 *   npx tsx development/scripts/backfill-media-slugs.ts --db <path> --apply
 *
 * Exit codes: always 0 — every candidate row is assigned a slug; there is no "wrong shape" row class
 * this script refuses to handle (a blank/null title still resolves via the "untitled" fallback).
 */
import path from "node:path";

import { openContentDb, openContentDbReadOnly, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { resolveExistingDbPath } from "./backfill-db-path.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

interface Args {
  readonly dbPath: string;
  readonly apply: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const dbFlag = argv.indexOf("--db");
  return {
    dbPath: dbFlag === -1 ? path.join(REPO_ROOT, "infra", "content.db") : path.resolve(argv[dbFlag + 1]),
    apply: argv.includes("--apply"),
  };
}

/** Same algorithm as `@jini-ai/cms/media`'s `media-service.ts` `slugifyMediaTitle` — see this
 *  file's header for why it is duplicated rather than imported. */
function slugifyMediaTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface MediaRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string | null;
}

/** Every row still missing a slug, ordered so a dry run and a later `--apply` (and any re-run of
 *  either) assign identical slugs to identical rows. */
function loadRowsMissingSlug(db: ContentDb): MediaRow[] {
  return db.$client
    .prepare("SELECT id, workspace_id AS workspaceId, title FROM media WHERE slug IS NULL ORDER BY workspace_id, created_at, id")
    .all() as MediaRow[];
}

/** Every slug already claimed in `workspaceId` — seeds each workspace's collision set with whatever
 *  real slugs already exist there (from a prior partial `--apply`, or a live upload that ran between
 *  two invocations of this script) so a freshly derived slug can never collide with one already saved. */
function loadTakenSlugsByWorkspace(db: ContentDb): Map<string, Set<string>> {
  const rows = db.$client.prepare("SELECT workspace_id AS workspaceId, slug FROM media WHERE slug IS NOT NULL").all() as Array<{
    workspaceId: string;
    slug: string;
  }>;
  const byWorkspace = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = byWorkspace.get(row.workspaceId) ?? new Set<string>();
    set.add(row.slug);
    byWorkspace.set(row.workspaceId, set);
  }
  return byWorkspace;
}

/** Derives a slug for one row and reserves it in `taken` — mutates `taken` so the NEXT row in the
 *  same workspace sees this one as already claimed, the in-memory equivalent of `deriveUniqueMediaSlug`'s
 *  own live repo round-trip. Empty/blank titles fall back to `"untitled"` (see this file's header). */
function uniqueSlugForRow(title: string | null, taken: Set<string>): string {
  const base = slugifyMediaTitle(title ?? "") || "untitled";
  let slug = base;
  let suffix = 1;
  while (taken.has(slug)) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  taken.add(slug);
  return slug;
}

interface PlannedSlug {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string | null;
  readonly slug: string;
}

/** Pure planning pass — no DB write, so the dry-run and `--apply` paths share one derivation instead
 *  of two copies that could silently drift. */
function planSlugs(rows: readonly MediaRow[], takenByWorkspace: Map<string, Set<string>>): PlannedSlug[] {
  return rows.map((row) => {
    const taken = takenByWorkspace.get(row.workspaceId) ?? new Set<string>();
    takenByWorkspace.set(row.workspaceId, taken);
    const slug = uniqueSlugForRow(row.title, taken);
    return { id: row.id, workspaceId: row.workspaceId, title: row.title, slug };
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove the database is really there BEFORE opening it — see this file's header for why a typo'd
  // path must fail loudly rather than silently open (and migrate) a brand-new empty database.
  const dbPath = resolveExistingDbPath(args.dbPath);
  const db = args.apply ? openContentDb(dbPath) : openContentDbReadOnly(dbPath);

  const rows = loadRowsMissingSlug(db);
  console.log(`Found ${rows.length} media row(s) with no slug, across every workspace.`);
  if (rows.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const takenByWorkspace = loadTakenSlugsByWorkspace(db);
  const planned = planSlugs(rows, takenByWorkspace);

  if (!args.apply) {
    for (const row of planned) {
      console.log(`DRY RUN: id=${row.id} workspace=${row.workspaceId} title=${JSON.stringify(row.title)} would set slug='${row.slug}'.`);
    }
    console.log(`DRY RUN: ${planned.length} row(s) would be backfilled. Re-run with --apply to write.`);
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-media-slugs" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const update = db.$client.prepare("UPDATE media SET slug = ? WHERE id = ? AND slug IS NULL");
  let updated = 0;
  for (const row of planned) {
    const result = update.run(row.slug, row.id);
    if (result.changes > 0) {
      updated += 1;
      console.log(`BACKFILLED: id=${row.id} workspace=${row.workspaceId} title=${JSON.stringify(row.title)} slug='${row.slug}'.`);
    } else {
      // Re-checked at write time (`AND slug IS NULL`) rather than trusting the read above — the only
      // way to reach this branch is a concurrent write (a live upload or edit) landing a slug on this
      // exact row between this script's read and write. Idempotency makes this harmless: a re-run
      // sees the row already has a slug and simply excludes it next time.
      console.log(`SKIPPED (slug set concurrently since read): id=${row.id} workspace=${row.workspaceId}.`);
    }
  }
  console.log(`Done: ${updated} row(s) backfilled with a new slug.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
