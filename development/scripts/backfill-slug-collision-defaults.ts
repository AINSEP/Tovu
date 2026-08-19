/**
 * Reclassify `posts.overrides_theme_page` from stored `false` to `NULL` ("never decided") for every
 * row whose slug could never have collided with any locally-available theme's own page.
 *
 * ## Why this script exists
 *
 * The slug-collision-override column (2026-08-10) was `NOT NULL DEFAULT false` until the tri-state
 * migration (`drizzle/0039_slimy_doctor_doom.sql`, 2026-08-15) widened it to nullable. That migration
 * deliberately does not touch a single existing value — a stored `false` is ambiguous between two
 * different histories, and a schema migration has no way to tell them apart:
 *
 *   1. An author genuinely saw the admin editor's collision warning and explicitly chose "keep the
 *      theme page" (a real decision this script must never overwrite).
 *   2. The row was simply written by `createPost`/migration `0029`'s old `NOT NULL DEFAULT false`,
 *      and the author never saw a collision warning at all, because the post's slug has never
 *      matched any theme page this install has ever shipped (the admin checkbox only renders on an
 *      actual `hasSlugCollision`, `use-post-editor.hooks.ts`) — this is "never decided", and should
 *      read that way.
 *
 * This script recovers case 2 using the one piece of information a migration cannot see: live theme
 * data. It resolves the SAME theme catalog the production site resolver consults
 * (`server/routes/site/pages.ts:765`, `discoverAllBuiltInThemes({ dir: builtInThemesDir() })` — the
 * exact call `server/app.ts`'s composition root makes, and the exact directory `themes/explore.ts`'s
 * install flow writes into, so this script sees precisely what the live server would have seen at
 * decision time, not an approximation of it) and reclassifies only rows whose slug matches NO page in
 * ANY of those themes, at ANY tier the collision check applies to (`static`, the only tier
 * `theme.pages` is ever populated for — see `loadStaticTierAssets`'s own early return).
 *
 * A row IS a genuine collision candidate — and is deliberately left at `false`, untouched — the
 * moment its slug matches a page in even ONE locally-available static theme, even if that theme is
 * not the currently active one. The stored preference is not tied to a theme id (a known, separate,
 * pre-existing gap — see `pages.ts`'s own resolver doc); the safest and most conservative read of
 * "could this checkbox ever plausibly have rendered" is therefore "against every theme this install
 * has ever had on disk", not just whichever theme happens to be active the moment this script runs.
 *
 * ## Not scoped per workspace, deliberately
 *
 * The theme catalog this script resolves is GLOBAL — `discoverAllBuiltInThemes` scans one directory
 * (`builtInThemesDir()`) with no per-workspace theme root anywhere in this codebase (grep-confirmed:
 * `discoverThemes` is only ever called against `builtInThemesDir()` or the marketplace root, never a
 * workspace-scoped path). So "every theme that workspace has" reduces to the same set for every
 * workspace, and this script queries `posts` across every `workspace_id` in one pass rather than
 * looping the `workspaces` table — looping would recompute the identical theme set on every
 * iteration for no safety benefit. If Tovu ever grows per-workspace theme roots, this reasoning (and
 * this script) needs revisiting — the doc comment says so explicitly rather than silently going stale.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write. A whole-file online-backup restore point
 * (`@jini-ai/infra`'s `SqliteDbOpsAdapter`, same mechanism `convert-legacy-doc-pages-to-html.ts`
 * already uses) is captured immediately before the first write in an `--apply` run.
 *
 * Idempotent: only rows currently `overrides_theme_page = 0` (SQL false) are ever selected. A row
 * this script reclassifies becomes `NULL` and is excluded from every later run's own `WHERE` clause;
 * a row this script leaves alone is re-evaluated identically next run and reaches the same "still a
 * collision candidate, still left alone" conclusion. A second run over an already-processed database
 * therefore changes nothing.
 *
 * Usage:
 *   npx tsx development/scripts/backfill-slug-collision-defaults.ts               (dry run)
 *   npx tsx development/scripts/backfill-slug-collision-defaults.ts --apply
 *   npx tsx development/scripts/backfill-slug-collision-defaults.ts --db <path> --apply
 *
 * Exit codes: always 0 — every candidate row is either reclassified or deliberately left alone; there
 * is no "wrong shape" row class the way `convert-legacy-doc-pages-to-html.ts` has (this script's
 * WHERE clause already excludes anything that isn't a plain stored `false`).
 */
import path from "node:path";

import { openContentDb, type ContentDb } from "../../src/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../src/db/sqlite/db-ops.js";
import { builtInThemesDir } from "../../src/server/deps.js";
import { discoverAllBuiltInThemes } from "../../src/features/theme/index.js";

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

/**
 * Every slug that could plausibly have triggered the admin editor's collision checkbox, across every
 * locally-available theme — the union of `theme.pages` keys for every STATIC-tier discovered theme,
 * minus `"index"` (never itself a collision target — mirrors `pages.ts:765`'s own `slug !== "index"`
 * gate exactly, so this script's notion of "could collide" matches the live resolver's, not a looser
 * or stricter approximation of it). Non-static tiers never populate `theme.pages` at all
 * (`loadStaticTierAssets` early-returns `NO_STATIC_TIER_ASSETS` for any other tier), so filtering on
 * tier here is belt-and-suspenders, not load-bearing — included for the same reason the resolver
 * itself states the check explicitly rather than relying on `pages` happening to be empty.
 *
 * Deliberately includes themes regardless of `DiscoveredTheme.status` ("valid" vs "invalid"): a theme
 * that loaded fine when an author made their decision and only later became invalid (e.g. a page file
 * removed) must not make this script forget that decision was ever reachable.
 *
 * @complexity O(t + p) — t discovered themes, p total page entries across all of them; both are small,
 * fixed by what ships on disk (single digits to low tens as of 2026-08-15), never row-scaled.
 */
function collectPossiblyCollidingSlugs(themesDir: string): Set<string> {
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  const slugs = new Set<string>();
  for (const theme of themes) {
    if (theme.manifest.tier !== "static") continue;
    for (const pageId of Object.keys(theme.pages)) {
      if (pageId === "index") continue;
      slugs.add(pageId);
    }
  }
  return slugs;
}

interface CandidateRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly slug: string;
}

/**
 * Every row currently stored as an explicit `false` — the only shape this script is ever allowed to
 * touch. `NULL` rows (already "never decided") and `true` rows (an explicit post-wins choice) are
 * excluded by the WHERE clause itself, not by a runtime check, so there is no code path that could
 * accidentally widen this script's blast radius to a value class it was not designed to classify.
 */
function loadFalseRows(db: ContentDb): CandidateRow[] {
  const rows = db.$client
    .prepare("SELECT id, workspace_id AS workspaceId, slug FROM posts WHERE overrides_theme_page = 0")
    .all() as CandidateRow[];
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = openContentDb(args.dbPath);

  const possiblyCollidingSlugs = collectPossiblyCollidingSlugs(builtInThemesDir());
  console.log(
    `Resolved ${possiblyCollidingSlugs.size} possibly-colliding slug(s) across every locally-available static theme: ${[...possiblyCollidingSlugs].sort().join(", ") || "(none)"}`
  );

  const rows = loadFalseRows(db);
  console.log(`Found ${rows.length} row(s) currently stored as explicit false, across every workspace.`);

  const toReclassify = rows.filter((row) => !possiblyCollidingSlugs.has(row.slug));
  const leftAlone = rows.filter((row) => possiblyCollidingSlugs.has(row.slug));

  for (const row of leftAlone) {
    console.log(
      `LEFT ALONE (possible real collision): id=${row.id} workspace=${row.workspaceId} slug='${row.slug}' — matches a locally-available static theme page.`
    );
  }

  if (toReclassify.length === 0) {
    console.log("Nothing to reclassify — every stored false is a possible real collision, or there were no false rows at all.");
    return;
  }

  if (!args.apply) {
    for (const row of toReclassify) {
      console.log(`DRY RUN: id=${row.id} workspace=${row.workspaceId} slug='${row.slug}' would reclassify false -> NULL.`);
    }
    console.log(`DRY RUN: ${toReclassify.length} row(s) would be reclassified. Re-run with --apply to write.`);
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: args.dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-slug-collision-defaults" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const update = db.$client.prepare("UPDATE posts SET overrides_theme_page = NULL WHERE id = ? AND overrides_theme_page = 0");
  let updated = 0;
  for (const row of toReclassify) {
    const result = update.run(row.id);
    if (result.changes > 0) {
      updated += 1;
      console.log(`RECLASSIFIED: id=${row.id} workspace=${row.workspaceId} slug='${row.slug}' false -> NULL.`);
    } else {
      // Re-checked at write time (`AND overrides_theme_page = 0`) rather than trusting the read from
      // `loadFalseRows` above — the only way to reach this branch is a concurrent write between this
      // script's read and write, which idempotency already makes harmless: a re-run will simply see
      // the row's new value and re-decide from there.
      console.log(`SKIPPED (changed since read): id=${row.id} workspace=${row.workspaceId} slug='${row.slug}'.`);
    }
  }
  console.log(`Done: ${updated} row(s) reclassified false -> NULL.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
