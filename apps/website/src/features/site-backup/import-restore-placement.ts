import { explainThemeTree as explain, inspectThemeManifests as inspect, writeExclusive as write, type ImportPlacementChecks, type ThemeManifestFindings } from "@jini-ai/devops/backup/site/import-restore-placement";
import { checkSourceDirContainment, loadTheme } from "#src/features/theme/catalog";
import { validateSharePath } from "./share-file-policy.js";

/**
 * @file Host binding: Tovu's theme catalog validation and share path policy behind the generic import
 * placement rules (`liveThemeTrees`/`restoreDestination` are pure and imported from devops directly).
 */

/** The theme owner's artifact validation and the share path policy, as the placement rules need them. */
const HOST_CHECKS: ImportPlacementChecks = { checkSourceDirContainment, loadTheme, validateSharePath };

/** Reads every staged static/declarative `theme.json` with the host theme checks.
 * @complexity O(themes × theme validation).
 */
export function inspectThemeManifests(required: { root: string; files: readonly string[] }): ThemeManifestFindings {
  return inspect({ ...required, checks: HOST_CHECKS });
}

/** Why one theme tree would be held back by import, in plain words; empty when import would place it live.
 * @complexity O(files), plus one manifest read (and a theme load for a compiled build).
 */
export function explainThemeTree(required: { root: string; id: string; files: readonly string[] }): string[] {
  return explain({ ...required, checks: HOST_CHECKS });
}

/** Private roots plus exclusive files prevent extraction through pre-existing links or aliases.
 * @param optional.validatePath the share path policy; injectable only so the containment guard
 *   behind it can be proven on its own.
 */
export function writeExclusive(required: { root: string; relative: string; bytes: Buffer }, optional: { validatePath?: (required: { path: string }) => void } = {}): void {
  write({ ...required, validatePath: optional.validatePath ?? validateSharePath });
}
