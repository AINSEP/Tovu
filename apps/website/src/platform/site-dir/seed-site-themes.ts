import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { seedStarterTitle } from "./seed-starter-title.js";

/**
 * @file `seedSiteThemes()` — the one-time copy that gets a site's themes OUT of the Tovu package.
 *
 * A plain filesystem copy with no theme-domain logic, so it lives in `platform/site-dir` beside its
 * caller `init-site.ts`; importing `features/theme` from `platform` would close a module cycle.
 *
 * Site-owned theme edits and pristine reset copies must survive product upgrades,
 * which replace the package's stock tree.
 *
 * A site now owns `<site>/themes/`. The package keeps a read-only STOCK tree
 * (`server/deps.ts`'s `builtInThemesDir()`), and this function copies it into the site the first
 * time that site boots. After that the site's copy is the only one anything reads or writes
 * (`RouteDeps.themesDir`), so an upgrade can replace the package tree freely.
 *
 * ---------------------------------------------------------------------------
 * Why it copies ONLY {@link SEEDED_STOCK_THEME_IDS} (owner, 2026-10-08)
 * ---------------------------------------------------------------------------
 * It used to copy the whole stock tree (~19MB), so every new site started with every stock theme
 * (basic-2, Meridian, Northbound, the templated demos, ...). The owner wants a new site to hold
 * only `tovu-starter`. The other stock themes stay in the package; they are just not copied.
 * Discovery of `themesDir` IS the site's theme list (`discoverAllBuiltInThemes`), so a theme left
 * out here does not exist to that site's admin UI. The seeded theme's `__original-themes__/` entry
 * comes along: `theme-files.ts` resolves "reset to original" at `join(themesRoot,
 * THEME_CATALOG_DIR, ...)` off the SITE's themes root — omit it and "reset to original" silently
 * has nothing to restore from. Originals of themes not seeded are left out too, so the catalog
 * never claims a theme the site does not have.
 *
 * Cost is paid once per site, and only on a boot where `<site>/themes/` is absent.
 *
 * Architectural role:
 * Pure filesystem effect, no domain logic and no port. Called from the real composition root
 * (`server/deps.ts`'s `createSiteRouteDeps`) only — deliberately NOT from `server/app.ts`'s
 * in-memory `createRouteDeps()`, which is the hermetic/test path and would copy the whole tree per
 * test run.
 */

/** What a seed attempt did. Every outcome is a normal, non-exceptional boot state. */
export type SeedSiteThemesStatus =
  /** `<site>/themes/` was absent and now holds the seeded stock themes ({@link SEEDED_STOCK_THEME_IDS}). */
  | "seeded"
  /** `<site>/themes/` already existed and was left exactly as it was. */
  | "already-present"
  /** No stock tree to copy from; nothing was written. */
  | "no-stock-source";

export interface SeedSiteThemesResult {
  readonly status: SeedSiteThemesStatus;
  /** Echoed back so a caller logging the outcome does not have to re-derive the path. */
  readonly siteThemesDir: string;
}

export interface SeedSiteThemesRequired {
  /** The read-only stock tree shipped with the package (`builtInThemesDir()`). */
  readonly stockDir: string;
  /** Where this site's own themes live (`siteThemesDir()`). Created only when seeding happens. */
  readonly siteThemesDir: string;
}

/**
 * The stock themes a new site is seeded with — `features/theme/active-theme.ts`'s `DEFAULT_THEME_ID`
 * (owner, 2026-10-08: "the only theme I want is Tovu starter"). Spelled out rather than imported
 * because `platform` must not import `features/theme` (see the file header); the test pins the two
 * equal so they cannot drift.
 */
export const SEEDED_STOCK_THEME_IDS: readonly string[] = ["tovu-starter"];

/** `features/theme/theme.ts`'s `THEME_CATALOG_DIR`, the "reset to original" copies — same cycle reason. */
const CATALOG_DIR_NAME = "__original-themes__";

/**
 * Whether one path of the stock tree belongs in a new site: root files, tier folders, and anything
 * inside a seeded theme's folder (live or catalog). A top-level folder holding a `theme.json` is a
 * legacy top-level theme, named by that folder; any other top-level folder is a tier whose children
 * are themes. Theme folders are named by their id (`theme-trash.ts` relies on the same rule).
 *
 * @complexity O(depth) per path, plus one `existsSync` for a path under a top-level folder.
 */
function isSeededStockPath(required: { stockDir: string; path: string }): boolean {
  const rel = relative(required.stockDir, required.path);
  if (rel === "") return true;
  const parts = rel.split(sep);
  const inCatalog = parts[0] === CATALOG_DIR_NAME;
  const scoped = inCatalog ? parts.slice(1) : parts;
  if (scoped.length === 0) return true;
  const topLevelTheme = existsSync(join(required.stockDir, ...(inCatalog ? [CATALOG_DIR_NAME] : []), scoped[0]!, "theme.json"));
  const themeId = topLevelTheme ? scoped[0] : scoped[1];
  // A tier folder itself, or a file at the root/catalog root.
  if (themeId === undefined) return true;
  return SEEDED_STOCK_THEME_IDS.includes(themeId);
}

/**
 * Name of the sibling directory the copy lands in before being renamed into place. A fixed name,
 * not a pid/random suffix: a crash mid-copy must leave exactly ONE recoverable path to clean up on
 * the next boot, not an accumulating pile of orphans.
 */
const STAGING_DIR_NAME = ".themes-seed-staging";

/**
 * Copies the seeded stock themes ({@link SEEDED_STOCK_THEME_IDS}, plus their originals and the
 * tier folders around them) into a site's own themes directory, once, if that directory does not
 * exist yet.
 *
 * Presence of `<site>/themes/` — not its contents — is the "already seeded" signal. An existing but
 * empty directory is therefore left empty: an operator who deliberately cleared or mounted that
 * path gets what they asked for, and there is no state to distinguish "cleared on purpose" from
 * "never seeded" other than the directory itself.
 *
 * The copy is written to a sibling staging directory and then renamed into place, so an interrupted
 * boot can never leave a HALF-copied `themes/` that the next boot reads as already seeded — the
 * failure mode that would silently ship a site with half of a theme.
 *
 * @param required.stockDir - The package's read-only stock themes tree.
 * @param required.siteThemesDir - The site's themes root.
 * @returns Which of the three boot states occurred, plus the site themes path.
 * @throws Whatever `node:fs` throws on an unwritable site directory or a failed copy — a site whose
 *   themes cannot be written has no working Theme Studio, so this is a real boot failure, not
 *   something to swallow. An absent stock tree is NOT such a case and returns `no-stock-source`.
 * @complexity O(bytes in the seeded themes) plus one filter call per stock path on a seeding boot;
 *   O(1) on every boot after.
 */
export function seedSiteThemes(required: SeedSiteThemesRequired, optional: { siteName?: string } = {}): SeedSiteThemesResult {
  const { stockDir, siteThemesDir } = required;

  if (existsSync(siteThemesDir)) return { status: "already-present", siteThemesDir };
  if (!existsSync(stockDir)) return { status: "no-stock-source", siteThemesDir };

  const siteRoot = dirname(siteThemesDir);
  const stagingDir = join(siteRoot, STAGING_DIR_NAME);

  mkdirSync(siteRoot, { recursive: true });
  // Clears an orphan left by a previous interrupted boot. Unconditional rather than guarded by
  // `existsSync` — `force: true` already makes the absent case a no-op, and one syscall is cheaper
  // than two.
  rmSync(stagingDir, { recursive: true, force: true });

  cpSync(stockDir, stagingDir, { recursive: true, filter: (path) => isSeededStockPath({ stockDir, path }) });
  // Creation owns the name; subsequent boots must preserve the site's Theme Studio edits.
  if (optional.siteName !== undefined) seedStarterTitle({ themesDir: stagingDir, siteName: optional.siteName });
  // Same parent directory, so this is a same-filesystem rename: atomic, and the moment it returns
  // the site's themes root is complete or was never there at all.
  renameSync(stagingDir, siteThemesDir);

  return { status: "seeded", siteThemesDir };
}
