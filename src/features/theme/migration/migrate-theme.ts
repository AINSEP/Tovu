import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { loadTheme, type ThemeTier } from "../theme.js";
import { validateThemePackage, type ValidateThemePackageResult } from "../validation/validate-theme-package.js";
import { planV2Migration, TOKENS_MODE_FILE_PATTERN, type ThemeMigrationPlan } from "./theme-migration-plan.js";

/**
 * @file Milestone 3's `tovu theme migrate` orchestrator — stages a v1 theme's on-disk shape into
 * schema v2 (`theme-authoring-guide-v2.md` §3), verifies the result two ways (Milestone 2's
 * structural validator, AND a real `loadTheme()` call — the validator's v2-strict path does not call
 * `loadTheme()`, so it alone would not catch a theme that's structurally approved but missing a
 * required template), and only replaces the real theme directory once both checks pass. Never
 * mutates the real theme directory before that point — see {@link migrateThemeToV2}'s own doc for
 * the exact sequencing.
 *
 * Scope: only the `declarative` tier has a migration plan (`theme-migration-plan.ts`) as of this
 * slice — `basic-declarative`, the approved lowest-risk starting theme (Milestone 3 dry-run
 * checkpoint). Other tiers are added incrementally as their own themes are migrated, matching the
 * "implement by requirement slice" rule — see that module's own header.
 */

export type MigrationStatus = "already-migrated" | "migrated" | "staged-dry-run" | "failed";

export interface MigrateThemeResult {
  readonly themeId: string;
  readonly status: MigrationStatus;
  readonly plan?: ThemeMigrationPlan;
  readonly validation?: ValidateThemePackageResult;
  readonly loadErrors?: readonly string[];
  /** Present only on success (`migrated`) or `staged-dry-run` — where the transformed output lives.
   * On `migrated`, this IS the real theme directory (the atomic replace already happened). On
   * `staged-dry-run` or `failed`, this is a scratch directory left behind for inspection — the real
   * theme directory is untouched either way. */
  readonly outputDir?: string;
  /** Present only on `migrated` — the pre-migration v1 copy, kept rather than deleted so a migration
   * can be manually reverted (`rmSync` the migrated dir, `renameSync` this back). */
  readonly backupDir?: string;
  readonly reason?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The template engine each non-static v1 tier's bare-number `engine` field actually named, matching
 * `manifest-v2.ts`'s own closed `V2_ENGINE_NAMES` list — `declarative` never carries an `engine` field
 * (no real theme on disk has one) so it has no entry here. */
const TIER_ENGINE_NAME: Readonly<Partial<Record<ThemeTier, string>>> = {
  templated: "liquid",
  handlebars: "handlebars",
};

/** v1's `engine` is a bare number the runtime never branches on (`theme.ts`'s own doc comment: "nothing
 * in the engine branches on it") — schema v2 restructures it into `{ name, version }` (real gap found
 * migrating `storefront`, which ships `engine: 1`; `basic-declarative`, Milestone 3's first real
 * migration, had no `engine` field at all so this path was untested until now). Leaves `raw.engine`
 * untouched when it is already an object (idempotent re-run) or when the tier has no known engine name
 * (nothing on disk today hits that case) — the v2-strict validator's own `v2-engine-shape`/`v2-engine-name`
 * rules catch anything this doesn't resolve, rather than this function guessing. */
function convertEngineField(raw: Record<string, unknown>, tier: ThemeTier): Record<string, unknown> {
  if (typeof raw.engine !== "number") return raw;
  const name = TIER_ENGINE_NAME[tier];
  if (!name) return raw;
  return { ...raw, engine: { name, version: String(raw.engine) } };
}

/**
 * A sibling of `themeDir` (same parent directory), never under `os.tmpdir()` — `renameSync` requires
 * both paths to be on the same filesystem/mount, which a system temp directory is not guaranteed to
 * share with the project directory (a real, non-hypothetical risk: this repo's own theme folders live
 * under the project's own disk location, not `/tmp`). A sibling directory is guaranteed same-filesystem
 * by construction, so the final atomic-replace rename below can never throw `EXDEV`.
 */
function createStagingDir(themeDir: string, id: string): string {
  const stagingDir = join(dirname(themeDir), `.tovu-migrate-staging-${id}-${randomBytes(6).toString("hex")}`);
  mkdirSync(stagingDir, { recursive: true });
  return stagingDir;
}

function readRawManifest(themeDir: string): Record<string, unknown> {
  const raw: unknown = JSON.parse(readFileSync(join(themeDir, "theme.json"), "utf8"));
  if (!isObject(raw)) throw new Error(`${themeDir}/theme.json is not a JSON object`);
  return raw;
}

/**
 * Copy every file `plan.moves` names from `themeDir` into `stagingDir` at its new relative path, plus
 * the tier-agnostic carry-over-unchanged files (`tokens.json`, `tokens.<mode>.json`) already verified
 * to exist by the planner. Directories are created as needed — `cpSync` on a single file does not
 * create missing parent directories on its own.
 */
function applyMoves(themeDir: string, stagingDir: string, plan: ThemeMigrationPlan): void {
  for (const move of plan.moves) {
    const destination = join(stagingDir, move.to);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(themeDir, move.from), destination);
  }
}

/**
 * `tokens.json`, every `tokens.<mode>.json`, `screenshots/`, and `NOTICE.md` sit at the same name
 * and location in both schema versions, so carrying them forward is a plain copy, not a relocation —
 * never listed in `plan.moves` (which only names FROM !== TO relocations) to keep that list's meaning
 * literal. Matches `theme-migration-plan.ts`'s `CARRY_OVER_UNCHANGED` set (plus that module's
 * `TOKENS_MODE_FILE_PATTERN`, reused here rather than re-declared) — this is the physical-copy half
 * of that same list, kept in sync by hand (the planner's job is naming what's already-correct, not
 * performing disk IO).
 *
 * Two real bugs fixed here (found live during the fuel/gracious-timing/portfolite migrations, 2026-08-18):
 * `tokens.<mode>.json` (real light/dark-mode color values, not documentation) and `NOTICE.md`
 * (license/attribution provenance — load-bearing for the owner's Blocker B decision to carry
 * unconfirmed-license themes forward with their existing warnings intact) were both silently dropped.
 * Neither the validator nor `loadTheme()` catches a missing one (both are optional, lazy-loaded), so
 * the loss was invisible until someone diffed a migrated theme against its v1 backup by hand.
 */
function copyCarryOverFiles(themeDir: string, stagingDir: string): void {
  const tokensSource = join(themeDir, "tokens.json");
  if (existsSync(tokensSource)) cpSync(tokensSource, join(stagingDir, "tokens.json"));

  for (const name of readdirSync(themeDir)) {
    if (!TOKENS_MODE_FILE_PATTERN.test(name)) continue;
    cpSync(join(themeDir, name), join(stagingDir, name));
  }

  const noticeSource = join(themeDir, "NOTICE.md");
  if (existsSync(noticeSource)) cpSync(noticeSource, join(stagingDir, "NOTICE.md"));

  const screenshotsSource = join(themeDir, "screenshots");
  if (existsSync(screenshotsSource)) cpSync(screenshotsSource, join(stagingDir, "screenshots"), { recursive: true });
}

/**
 * Rewrite `plan.assetPathRewrites` (see that type's own header) into every moved page/partial file's
 * own text content, in place in `stagingDir`. Scoped to files landing under `render/` — the only place
 * a hardcoded absolute `/theme-assets/<id>/...` URL has been found on a real theme (`fuel`,
 * `fashion-modern`). A moved page/partial's own RELATIVE `../css/`/`../js/` references are a separate
 * case with a different shape (a plain filename/folder rename, not a variable-content asset bag) —
 * see {@link rewriteRelativeStaticAssetReferences} just below for that one.
 *
 * @complexity O(f * r) in the theme's own `render/`-bound file count times its (small, fixed)
 * rewrite-rule count.
 */
function applyAssetPathRewrites(stagingDir: string, id: string, plan: ThemeMigrationPlan): void {
  const rules = plan.assetPathRewrites;
  if (!rules || rules.length === 0) return;
  for (const move of plan.moves) {
    if (!move.to.startsWith("render/")) continue;
    const filePath = join(stagingDir, move.to);
    const original = readFileSync(filePath, "utf8");
    const rewritten = rules.reduce(
      (content, rule) => content.split(`/theme-assets/${id}/${rule.v1Prefix}`).join(`/theme-assets/${id}/${rule.v2Prefix}`),
      original
    );
    if (rewritten !== original) writeFileSync(filePath, rewritten, "utf8");
  }
}

/**
 * Pure text rewrite: a static-tier page/partial's own `<link href="../css/styles.css">` /
 * `<script src="../js/...">` reference, rewritten to the v2 filename/folder (`../css/theme.css`,
 * `../scripts/...`) the static-tier move plan (`planStaticTierMigration`) actually relocates the real
 * file to. Matches both quote styles (`"`/`'`), mirroring `static-asset-contract.ts`'s own
 * `rewriteAssetPaths` convention, and echoes the captured quote back verbatim.
 *
 * Exported so the same rule can be applied to already-migrated theme content on disk (a one-off data
 * fix), not only to a fresh migration run.
 *
 * @complexity O(n) over `html`'s length — two regex passes.
 */
export function rewriteStaticAssetHtml(html: string): string {
  return html
    .replace(/href=(["'])\.\.\/css\/styles\.css\1/g, (_match, quote: string) => `href=${quote}../css/theme.css${quote}`)
    .replace(/src=(["'])\.\.\/js\//g, (_match, quote: string) => `src=${quote}../scripts/`);
}

/**
 * Applies {@link rewriteStaticAssetHtml} to every moved page/partial in `stagingDir`. A plain file
 * MOVE (`applyMoves`) relocates bytes, it never touches a page's OWN authored HTML text — so
 * `css/styles.css` -> `css/theme.css` and `js/` -> `scripts/` both left every migrated page still
 * literally saying the v1 name. That silently broke two ways: the request-time rewrite in
 * `static-asset-contract.ts` only remaps the URL PREFIX (`../css/` -> `/theme-assets/<id>/css/`),
 * never the filename attached to it, so a page still saying `styles.css` resolved to a URL for a file
 * that no longer existed (404, real bug found live on `fuel`/`gracious-timing`/`portfolite`/
 * `tailark-*` — all six already-migrated static themes shipped this broken); and `../js/` has no v2
 * prefix rule to rewrite into at all, so it stayed completely unrewritten. Scoped to `render/` the
 * same way {@link applyAssetPathRewrites} is; kept as its own pass rather than folded into
 * `plan.assetPathRewrites` because that rule shape targets absolute `/theme-assets/<id>/...` URLs, not
 * a page's own relative `../css/`/`../js/` references — a differently-shaped bug needs a differently-
 * shaped fix, not a forced reuse of the nearest existing mechanism.
 *
 * @complexity O(f) in the theme's own `render/`-bound file count — one read/replace/write pass.
 */
function rewriteRelativeStaticAssetReferences(stagingDir: string, plan: ThemeMigrationPlan): void {
  for (const move of plan.moves) {
    if (!move.to.startsWith("render/")) continue;
    const filePath = join(stagingDir, move.to);
    const original = readFileSync(filePath, "utf8");
    const rewritten = rewriteStaticAssetHtml(original);
    if (rewritten !== original) writeFileSync(filePath, rewritten, "utf8");
  }
}

/** Adds/overwrites exactly the fields a v2 migration touches — `$schema`, `apiVersion`, and (via
 * {@link convertEngineField}) a bare-number `engine` restructured into its v2 object shape. Every
 * other field carries forward unchanged (description, fonts, author, etc.) — see
 * `theme-authoring-guide-v2.md` §5 for the target shape. Never invents `license`/`LICENSE` (Blocker
 * B's own decision: don't silently resolve a genuinely absent or unconfirmed license). */
function buildV2Manifest(raw: Record<string, unknown>, tier: ThemeTier): Record<string, unknown> {
  return {
    $schema: "https://tovu.dev/schemas/theme/v2/theme.schema.json",
    apiVersion: 2,
    ...convertEngineField(raw, tier),
  };
}

/**
 * Migrate one theme directory to schema v2. Sequencing (never deviates, see file header for why each
 * step exists):
 *
 * 1. Read the real `theme.json`. Already `apiVersion: 2` -> no-op, `status: "already-migrated"`
 *    (idempotent — a second run is always safe).
 * 2. Build the tier's move plan (`theme-migration-plan.ts`). Any root-level file the planner doesn't
 *    recognize -> refuse (`status: "failed"`, real theme untouched) rather than guess what to do
 *    with an author's file this migration slice wasn't told about.
 * 3. Stage into a fresh temp directory — copy every moved/carried-over file, rewrite any moved
 *    page/partial's own hardcoded `/theme-assets/<id>/...` references (`applyAssetPathRewrites`, only
 *    when the plan reports any) AND its own relative `../css/`/`../js/` references
 *    (`rewriteRelativeStaticAssetReferences`), write the rewritten `theme.json`. The real theme
 *    directory is not touched up to this point.
 * 4. Verify the staged output two ways: `validateThemePackage` (structural/schema check) AND a real
 *    `loadTheme()` call (catches a missing required template the structural check's v2-strict path
 *    does not independently verify — see this file's header). Both must pass.
 * 5. `dryRun: true` stops here regardless of outcome (`status: "staged-dry-run"` on structural
 *    success, `"failed"` otherwise) — the staging directory is left on disk either way for
 *    inspection, the real theme directory is never touched.
 * 6. `dryRun: false` (default) and both checks passed: atomic replace — rename the real directory
 *    aside as a timestamped backup, rename staging into its place. On any verification failure, the
 *    real directory is left exactly as it was; the staging directory is kept for inspection.
 *
 * @complexity O(f) in the theme's own file count — one copy pass, one validator walk, one loadTheme
 * discovery pass.
 */
export function migrateThemeToV2(
  required: { themeDir: string; id: string },
  optional: { dryRun?: boolean } = {}
): MigrateThemeResult {
  const { themeDir, id } = required;
  const { dryRun = false } = optional;

  const raw = readRawManifest(themeDir);
  if (raw.apiVersion === 2) {
    return { themeId: id, status: "already-migrated" };
  }

  const tier = typeof raw.tier === "string" ? (raw.tier as ThemeTier) : "declarative";
  let plan: ThemeMigrationPlan;
  try {
    plan = planV2Migration({ themeDir, tier });
  } catch (err) {
    return { themeId: id, status: "failed", reason: (err as Error).message };
  }
  if (plan.unrecognized.length > 0) {
    return {
      themeId: id,
      status: "failed",
      plan,
      reason: `refusing to migrate: ${plan.unrecognized.length} root-level file(s) with no known v2 destination: ${plan.unrecognized.join(", ")}`,
    };
  }

  const stagingDir = createStagingDir(themeDir, id);
  applyMoves(themeDir, stagingDir, plan);
  copyCarryOverFiles(themeDir, stagingDir);
  applyAssetPathRewrites(stagingDir, id, plan);
  rewriteRelativeStaticAssetReferences(stagingDir, plan);
  writeFileSync(join(stagingDir, "theme.json"), JSON.stringify(buildV2Manifest(raw, tier), null, 2) + "\n", "utf8");

  const validation = validateThemePackage({ themeDir: stagingDir, id, profile: "author" });
  const loaded = loadTheme({ themeDir: stagingDir, id, source: "site" });
  const loadValid = loaded.status === "valid";

  if (dryRun) {
    return {
      themeId: id,
      status: validation.valid && loadValid ? "staged-dry-run" : "failed",
      plan,
      validation,
      loadErrors: loaded.errors,
      outputDir: stagingDir,
    };
  }

  if (!validation.valid || !loadValid) {
    return {
      themeId: id,
      status: "failed",
      plan,
      validation,
      loadErrors: loaded.errors,
      outputDir: stagingDir,
      reason: "staged output failed verification — real theme directory left untouched",
    };
  }

  const backupDir = `${themeDir}.v1-backup-${Date.now()}`;
  renameSync(themeDir, backupDir);
  renameSync(stagingDir, themeDir);

  return {
    themeId: id,
    status: "migrated",
    plan,
    validation,
    loadErrors: loaded.errors,
    outputDir: themeDir,
    backupDir,
  };
}

/** Test/CLI convenience — remove a `staged-dry-run`/`failed` run's leftover staging directory once a
 * caller is done inspecting it. Never call this on a `migrated` result's `outputDir` (that's the real
 * theme directory) or its `backupDir` (the v1 rollback copy). */
export function cleanupMigrationOutput(outputDir: string): void {
  rmSync(outputDir, { recursive: true, force: true });
}
