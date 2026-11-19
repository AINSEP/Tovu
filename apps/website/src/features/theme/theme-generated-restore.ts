import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ThemeManifest } from "./render-contract.js";
import { THEME_CATALOG_DIR } from "./theme-layout.js";
import { ThemePathError } from "./theme-files.js";
import { resolveThemeFileWriteScope } from "./theme-file-policy.js";
import { listThemeFiles } from "./theme-file-listing.js";


/**
 * Restore a BUILT theme's entire generated tree — every path {@link resolveThemeFileWriteScope}
 * classifies `generated-readonly` for this manifest — from its catalog original, as one operation.
 * Never partial: every existing generated file is removed first, then every catalog generated file is
 * recopied, so the live tree ends up an EXACT copy of the catalog's generated output rather than a
 * merge of old and new. `theme.json` and everything under `build.sourceDir` are untouched — this
 * restores only the region {@link resolveThemeFileWriteScope} already refuses to write, the other half
 * of ADR-020 §5's "restored atomically" (per-file reset still covers the source, unchanged).
 *
 * "One operation" here means indivisible from the CALLER's perspective — enumerate both sides fully
 * before mutating anything — not an OS-level transaction; a crash mid-restore can still leave a
 * partial tree, the same caveat every other multi-file write in this codebase already accepts.
 *
 * Reuses {@link listThemeFiles}'s walk for both sides (live and catalog) rather than a second directory
 * walker: `THEME_CATALOG_DIR`'s own layout mirrors a real themes root's `<tier>/<id>/` shape (see that
 * constant's doc), so `listThemeFiles({ themeDir: catalogDir, themesRoot: catalogRoot })` passes the
 * same recognized-root check a live theme's call does, and inherits the same symlink-refusing,
 * bounded walk for free.
 *
 * @throws {ThemePathError} If this theme is not a compiled build (nothing to restore — every file
 * already resets per-file), or has no catalog original to restore from at all.
 * @complexity O(f) in the theme's own generated file count — two bounded directory walks plus one
 * `rmSync`/`copyFileSync` per generated file.
 */
export function restoreBuiltThemeGeneratedTree(
  required: { themeDir: string; themesRoot: string; manifest: Pick<ThemeManifest, "id" | "tier" | "build"> },
  _optional: Record<string, never> = {}
): { restoredFiles: string[] } {
  const { themeDir, themesRoot, manifest } = required;
  if (manifest.build?.source !== "compiled") {
    throw new ThemePathError({ message: "this theme is not a built release; there is no generated tree to restore" });
  }

  const catalogDir = join(themesRoot, THEME_CATALOG_DIR, manifest.tier, manifest.id);
  if (!existsSync(catalogDir)) {
    throw new ThemePathError({ message: `theme '${manifest.id}' has no stored original, so its generated tree cannot be restored` });
  }

  const isGenerated = ({ relativePath }: { relativePath: string }, _optional = {}): boolean =>
    resolveThemeFileWriteScope({ manifest, relativePath }).kind === "generated-readonly";

  // Enumerate both sides fully before touching disk, so a read failure on either side aborts before
  // any file is removed.
  const liveGenerated = listThemeFiles({ themeDir, themesRoot }).filter((relativePath) => isGenerated({ relativePath }));
  const catalogRoot = join(themesRoot, THEME_CATALOG_DIR);
  const catalogGenerated = listThemeFiles({ themeDir: catalogDir, themesRoot: catalogRoot }).filter((relativePath) => isGenerated({ relativePath }));

  for (const relativePath of liveGenerated) {
    rmSync(join(themeDir, relativePath), { force: true });
  }
  for (const relativePath of catalogGenerated) {
    const dest = join(themeDir, relativePath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(catalogDir, relativePath), dest);
  }

  return { restoredFiles: catalogGenerated.sort() };
}
