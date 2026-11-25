import { explainThemeTree as explain, inspectThemeManifests as inspect, writeExclusive as write, type ImportPlacementChecks, type ThemeManifestFindings } from "@jini-ai/devops/backup/site/import-restore-placement";
import { validateSharePath } from "./share-file-policy.js";

/**
 * @file Host binding: Tovu's theme catalog validation and share path policy behind the generic import
 * placement rules (`liveThemeTrees`/`restoreDestination` are pure and imported from devops directly).
 * The theme catalog validation is the theme owner's placement checks, injected by the host
 * composition root.
 */

/**
 * The theme owner's checks import placement reuses, bound once at the host: the compiled build's
 * `sourceDir` containment (a non-empty list refuses the theme before any placement) and the
 * theme loader's artifact validation.
 */
export type ThemePlacementChecks = Pick<ImportPlacementChecks, "checkSourceDirContainment" | "loadTheme">;

/** The theme owner's artifact validation (the injected theme checks) and the share path policy, as the placement rules need them. */
function placementChecks(required: { themeChecks: ThemePlacementChecks }): ImportPlacementChecks {
  const { themeChecks } = required;
  return {
    checkSourceDirContainment: (input) => themeChecks.checkSourceDirContainment(input),
    loadTheme: (input) => themeChecks.loadTheme(input),
    validateSharePath,
  };
}

/** Reads every staged static/declarative `theme.json` with the host theme checks.
 * @complexity O(themes × theme validation).
 */
export function inspectThemeManifests(required: { root: string; files: readonly string[]; themeChecks: ThemePlacementChecks }): ThemeManifestFindings {
  return inspect({ root: required.root, files: required.files, checks: placementChecks(required) });
}

/** Why one theme tree would be held back by import, in plain words; empty when import would place it live.
 * @complexity O(files), plus one manifest read (and a theme load for a compiled build).
 */
export function explainThemeTree(required: { root: string; id: string; files: readonly string[]; themeChecks: ThemePlacementChecks }): string[] {
  return explain({ root: required.root, id: required.id, files: required.files, checks: placementChecks(required) });
}

/** Private roots plus exclusive files prevent extraction through pre-existing links or aliases.
 * @param optional.validatePath the share path policy; injectable only so the containment guard
 *   behind it can be proven on its own.
 */
export function writeExclusive(required: { root: string; relative: string; bytes: Buffer }, optional: { validatePath?: (required: { path: string }) => void } = {}): void {
  write({ ...required, validatePath: optional.validatePath ?? validateSharePath });
}
