import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @file `seedSiteThemes()` — the one-time copy that gets a site's themes OUT of the Tovu package.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists to fix
 * ---------------------------------------------------------------------------
 * Themes used to live at `src/themes/`, INSIDE the product, and the admin Theme Studio wrote the
 * owner's edits straight into that tree — alongside `__original-themes__/`, which holds each
 * theme's own "reset to original" pristine copy. Upgrading Tovu replaces `src/`, so an upgrade
 * destroyed both the edits and the backups that could have restored them.
 *
 * A site now owns `<site>/themes/`. The package keeps a read-only STOCK tree
 * (`server/deps.ts`'s `builtInThemesDir()`), and this function copies it into the site the first
 * time that site boots. After that the site's copy is the only one anything reads or writes
 * (`RouteDeps.themesDir`), so an upgrade can replace the package tree freely.
 *
 * ---------------------------------------------------------------------------
 * Why it copies the WHOLE tree (~19MB), rather than filling in on demand
 * ---------------------------------------------------------------------------
 * Accepted tradeoff, agreed with the owner. There is no "install a stock theme" flow in the
 * product today — discovery of `themesDir` IS the site's theme list (`discoverAllBuiltInThemes`),
 * so a theme that is not on disk under the site simply does not exist to the admin UI. Copying
 * lazily would therefore require inventing an install flow nobody asked for. `__original-themes__/`
 * and `__marketplace__/` come along for the same reason: `theme-files.ts` resolves "reset to
 * original" at `join(themesRoot, THEME_CATALOG_DIR, ...)` and `marketplace.ts` resolves the
 * marketplace at `join(themesRoot, MARKETPLACE_CATALOG_DIR)`, both off the SITE's themes root —
 * omit either and the corresponding admin screen silently goes empty.
 *
 * Cost is paid once per site, and only on a boot where `<site>/themes/` is absent.
 *
 * Architectural role:
 * Pure filesystem effect, no domain logic and no port. Called from the real composition root
 * (`server/deps.ts`'s `createSqliteRouteDeps`) only — deliberately NOT from `server/app.ts`'s
 * in-memory `createRouteDeps()`, which is the hermetic/test path and would copy the whole tree per
 * test run.
 */

/** What a seed attempt did. Every outcome is a normal, non-exceptional boot state. */
export type SeedSiteThemesStatus =
  /** `<site>/themes/` was absent and now holds a full copy of the stock tree. */
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
 * Name of the sibling directory the copy lands in before being renamed into place. A fixed name,
 * not a pid/random suffix: a crash mid-copy must leave exactly ONE recoverable path to clean up on
 * the next boot, not an accumulating pile of orphans.
 */
const STAGING_DIR_NAME = ".themes-seed-staging";

/**
 * Copies the stock themes tree into a site's own themes directory, once, if that directory does
 * not exist yet.
 *
 * Presence of `<site>/themes/` — not its contents — is the "already seeded" signal. An existing but
 * empty directory is therefore left empty: an operator who deliberately cleared or mounted that
 * path gets what they asked for, and there is no state to distinguish "cleared on purpose" from
 * "never seeded" other than the directory itself.
 *
 * The copy is written to a sibling staging directory and then renamed into place, so an interrupted
 * boot can never leave a HALF-copied `themes/` that the next boot reads as already seeded — the
 * failure mode that would silently ship a site with three of its seven themes.
 *
 * @param required.stockDir - The package's read-only stock themes tree.
 * @param required.siteThemesDir - The site's themes root.
 * @returns Which of the three boot states occurred, plus the site themes path.
 * @throws Whatever `node:fs` throws on an unwritable site directory or a failed copy — a site whose
 *   themes cannot be written has no working Theme Studio, so this is a real boot failure, not
 *   something to swallow. An absent stock tree is NOT such a case and returns `no-stock-source`.
 * @complexity O(bytes in the stock tree) on a seeding boot; O(1) on every boot after.
 */
export function seedSiteThemes(required: SeedSiteThemesRequired): SeedSiteThemesResult {
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

  cpSync(stockDir, stagingDir, { recursive: true });
  // Same parent directory, so this is a same-filesystem rename: atomic, and the moment it returns
  // the site's themes root is complete or was never there at all.
  renameSync(stagingDir, siteThemesDir);

  return { status: "seeded", siteThemesDir };
}
