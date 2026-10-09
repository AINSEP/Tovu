import { isAbsolute, join, relative, resolve } from "node:path";

import { writeGeneratedThemeOriginal } from "./sync-originals.js";
import { resolveThemeOriginalSource } from "./theme-files.js";
import { THEME_CATALOG_DIR, type DiscoveredTheme } from "./theme.js";

/**
 * @file Explore's "Save as original" (owner 2026-10-08): a theme with no stored original — so Reset
 * has nothing to restore from — gets its CURRENT files written as that original, at the exact place
 * a seeded theme keeps its own (`<themes>/__original-themes__/<tier>/<id>`). The catalog is excluded
 * from discovery, so this never shows up as a theme; it only gives Reset something to read.
 *
 * Reuses `writeGeneratedThemeOriginal` — the writer the shipped originals and a duplicate's original
 * come from — so what gets saved is filtered exactly like theirs (no generated `preview/` output).
 */

/** Why a save was refused; nothing was written in either case. */
export type SaveThemeOriginalRefusal =
  | { ok: false; code: "ORIGINAL_EXISTS"; message: string }
  | { ok: false; code: "NOT_A_SITE_THEME"; message: string };

/**
 * Write `theme`'s current files as its stored original.
 *
 * Refuses when the theme already has an original (the site's own, or the package's read-only
 * fallback — the same lookup Reset uses): that one is what Reset should keep restoring to, and
 * replacing it would silently discard it. Also refuses a theme folder outside `themesRoot`, which
 * has no place in this site's catalog.
 *
 * @param required.theme - The live discovered theme to snapshot. Only read.
 * @param required.themesRoot - The site's themes root (`RouteDeps.themesDir`).
 * @param required.packageThemesRoot - The package's stock themes root, or `undefined` (see
 *   `resolveThemeOriginalSource`).
 * @returns `{ ok: true, originalDir }`, or a refusal.
 * @throws Whatever `node:fs` throws while writing the catalog folder.
 * @complexity O(f) in the theme's file count: one filtered copy.
 */
export function saveThemeAsOriginal(
  required: { theme: DiscoveredTheme; themesRoot: string; packageThemesRoot: string | undefined },
  _optional: Record<string, never> = {}
): { ok: true; originalDir: string } | SaveThemeOriginalRefusal {
  const { theme, themesRoot, packageThemesRoot } = required;
  const { id, tier } = theme.manifest;
  const fromRoot = relative(resolve(themesRoot), resolve(theme.dir));
  if (fromRoot === "" || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    return { ok: false, code: "NOT_A_SITE_THEME", message: `theme '${id}' is not inside this site's themes folder` };
  }
  if (resolveThemeOriginalSource({ manifest: theme.manifest, siteThemesRoot: themesRoot, packageThemesRoot }) !== null) {
    return { ok: false, code: "ORIGINAL_EXISTS", message: `theme '${id}' already has a stored original` };
  }
  const originalDir = join(themesRoot, THEME_CATALOG_DIR, tier, id);
  writeGeneratedThemeOriginal({ liveDir: theme.dir, targetDir: originalDir });
  return { ok: true, originalDir };
}
