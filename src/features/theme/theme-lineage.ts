import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ThemeTier } from "./theme.js";

/**
 * @file Install-local provenance metadata for a downloaded theme — where a working copy came from,
 * never anything the renderer resolves.
 *
 * Schema v2 decision (2026-08-18): `lineage` used to be written straight into an installed copy's
 * own `theme.json` (`marketplace.ts`'s `rewriteThemeManifestId`'s now-removed `extra` merge
 * parameter) — a raw key present in the manifest FILE even though `loadTheme()` deliberately never parsed it onto
 * `ThemeManifest` (see `explore.ts`'s GET route, which read it back via a second raw `JSON.parse`).
 * That split was already half the right shape — `lineage` was never a schema field — but a strict
 * v2 manifest schema (`additionalProperties: false`) validates the RAW `theme.json` content, and an
 * unknown `lineage` key there would fail that check regardless of whether anything parses it. Moving
 * the value to its own sibling file removes it from the manifest's own JSON body entirely, so it is
 * install-local metadata by construction, not a publisher-facing schema field a strict parse has to
 * special-case.
 */

/** One installed copy's provenance — where it came from, for the Explore banner's "reset" promise. */
export interface ThemeLineage {
  from: "marketplace";
  tier: ThemeTier;
  /** The marketplace fixture's `theme.json` version at download time. */
  version: string;
  /** This copy's paired catalog original, as a `{@link THEME_CATALOG_DIR}/<tier>/<id>` path relative
   * to the themes root — what "reset to original" would restore from. */
  catalog: string;
  /** The marketplace fixture's own folder id — stable across machines and across repeat downloads,
   * unlike the installed copy's own (possibly collision-suffixed) id. */
  marketplaceId: string;
  /** The marketplace fixture's own display name at download time. */
  name: string;
}

/** The sibling file's name — a dotfile so a package-shape validator recognizes it as install-local
 * metadata on sight, the same treatment `preview/` gets as generated (not hand-authored) output. */
export const THEME_LINEAGE_FILENAME = ".tovu-lineage.json";

/**
 * Write one theme's lineage to its own install-local sidecar file, never into `theme.json` itself.
 *
 * @complexity O(s) in the lineage object's own (small, fixed-shape) size.
 */
export function writeThemeLineageFile(
  required: { themeDir: string; lineage: ThemeLineage },
  _optional: Record<string, never> = {}
): void {
  const { themeDir, lineage } = required;
  writeFileSync(join(themeDir, THEME_LINEAGE_FILENAME), `${JSON.stringify(lineage, null, 2)}\n`, "utf8");
}

/**
 * Read one theme's lineage sidecar file, if it has one. A theme with no stored lineage (every
 * hand-authored theme, and any installed before this file existed) simply has none to report —
 * `null`, not an error.
 *
 * @complexity O(s) in the sidecar file's own (small, fixed-shape) size.
 */
export function readThemeLineageFile(
  required: { themeDir: string },
  _optional: Record<string, never> = {}
): ThemeLineage | null {
  const path = join(required.themeDir, THEME_LINEAGE_FILENAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ThemeLineage;
  } catch {
    return null;
  }
}
