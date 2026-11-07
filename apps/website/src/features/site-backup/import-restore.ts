import { archiveCodeUnit, editedArchiveWarnings, keptOffArchiveWarnings, OVERRIDES_UNIT } from "./archive-paths.js";
import fs from "node:fs";
import type { SiteSavedKeysPort } from "./saved-keys-port.js";
import path from "node:path";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { readTemplate } from "#src/platform/site-dir/index";
import type { VerifiedSiteImport } from "./import-verifier.js";
import { restoreImportedPluginState, type ImportedExtensionState } from "./import-plugin-state.js";
import { inspectThemeManifests, liveThemeTrees, restoreDestination, writeExclusive } from "./import-restore-placement.js";
import { keepImportedCodeOff, unrecognisedThemes } from "./import-keep-off.js";

/** Persist only verified, freshly projected data; the stage is private and never served. */
export function stageVerifiedImport(required: { root: string; verified: VerifiedSiteImport }, _options: Record<string, never> = {}): void {
  fs.mkdirSync(required.root, { mode: 0o700 });
  writeExclusive({ root: required.root, relative: "database/content.db", bytes: required.verified.database });
  for (const [relative, bytes] of required.verified.files) writeExclusive({ root: required.root, relative, bytes });
  if (required.verified.encryptedKeys) writeExclusive({ root: required.root, relative: ".saved-keys.json", bytes: required.verified.encryptedKeys });
  const keptOff = keptOffUnits({ root: required.root, verified: required.verified });
  fs.writeFileSync(path.join(required.root, ".archive-state.json"), JSON.stringify({ plugins: required.verified.plugins, trustedPlugins: required.verified.trustedPlugins, modified: [...required.verified.modified], keptOff, warnings: required.verified.warnings }), { flag: "wx", mode: 0o600 });
  fs.writeFileSync(path.join(required.root, ".inventory.json"), JSON.stringify([...required.verified.files.keys()]), { flag: "wx", mode: 0o600 });
}

/**
 * Staged code units this install does not recognise, so restore keeps them switched off: every
 * plugin, skill, override and theme tree except live static/declarative themes, trusted agent
 * plugins, and edited units (those already carry their own notice). Reads the staged theme
 * manifests, so it runs after the files are written.
 * @complexity O(files + staged theme validation).
 */
function keptOffUnits(required: { root: string; verified: VerifiedSiteImport }): string[] {
  const files = [...required.verified.files.keys()];
  const live = liveThemeTrees({ files, findings: inspectThemeManifests({ root: required.root, files }) });
  const recognised = new Set([...required.verified.modified, ...required.verified.trustedPlugins.map(plugin => "agent-plugins/" + plugin.id)]);
  const units = new Set(files.map(file => stagedCodeUnit({ file, live })));
  return [...units].filter((unit): unit is string => unit !== undefined && !recognised.has(unit));
}

/** The code unit of one staged (runtime-path) file; `undefined` for data, originals and live themes. */
function stagedCodeUnit(required: { file: string; live: ReadonlySet<string> }): string | undefined {
  const theme = /^themes\/([^/]+)\/([^/]+)\//.exec(required.file);
  if (theme) return theme[1] === "__original-themes__" || required.live.has(theme[1] + "/" + theme[2]) ? undefined : "themes/" + theme[2];
  if (required.file.startsWith("overrides/")) return OVERRIDES_UNIT;
  return archiveCodeUnit({ path: required.file });
}

/** Init's pre-commit restore port. Untrusted extensions never enter a discovery/activation root.
 * Static/declarative theme trees are eligible only when the whole tree contains supported assets;
 * executable themes and overrides remain preserved under the unserved quarantine directory.
 * @complexity O(files + bytes), capped by the verified inventory (2,000 entries/300 MiB).
 */
export async function restoreStagedImport(required: { root: string; dir: string; dbPath: string; siteId?: string; savedKeys?: Pick<SiteSavedKeysPort, "restore">; pluginLayout: Parameters<typeof restoreImportedPluginState>[0]["layout"]; openContent: (required: { filePath: string }) => StorageKernel<ContentDatabase> }, optional: { pluginSourceRoot?: string; savedKeysPassword?: string; signal?: AbortSignal } = {}): Promise<void> {
  const files = JSON.parse(fs.readFileSync(path.join(required.root, ".inventory.json"), "utf8")) as string[];
  const state = JSON.parse(fs.readFileSync(path.join(required.root, ".archive-state.json"), "utf8")) as ImportedExtensionState;
  const findings = inspectThemeManifests({ root: required.root, files });
  const liveThemes = liveThemeTrees({ files, findings });
  for (const id of liveThemes) if (state.modified.includes("themes/" + id.split("/").at(-1))) liveThemes.delete(id);
  const fallback = readTemplate({ templateId: "starter" }).seed.presentation.activeThemeId;
  const unrecognised = unrecognisedThemes({ root: required.root, dir: required.dir, files, liveThemes });
  // This site's own fallback theme is never replaced: the archive's copy is set aside and the site keeps rendering with a real theme.
  const setAside = unrecognised.delete(fallback);
  if (setAside) liveThemes.delete("static/" + fallback), liveThemes.delete("declarative/" + fallback);
  for (const id of liveThemes) fs.rmSync(path.join(required.dir, "themes", id), { recursive: true, force: true });
  // Copy the freshly rebuilt database, never the archived SQLite bytes. Exclusive creation and
  // init's DB-path resolver protect both in-site and app-data placement from overwriting a site.
  fs.copyFileSync(path.join(required.root, "database/content.db"), required.dbPath, fs.constants.COPYFILE_EXCL);
  const placedMemory = await restoreImportedPluginState({ root: required.root, dir: required.dir, layout: required.pluginLayout, state, files }, { sourceRoot: optional.pluginSourceRoot });
  for (const file of files) {
    if (placedMemory.has(file)) continue;
    const destination = restoreDestination({ file, liveThemes, compiledSources: findings.compiledSources });
    if (destination !== null) writeExclusive({ root: required.dir, relative: destination, bytes: fs.readFileSync(path.join(required.root, file)) });
  }
  addStagedWarnings({ root: required.root, notices: await keepImportedCodeOff({ dbPath: required.dbPath, fallback, liveThemes, unrecognised, setAside, openContent: required.openContent }) });
  await restoreOptionalSavedKeys(required, optional);
}

/** Optional keys never prevent an otherwise valid site from being created. The adapter owns
 * authentication, validation and atomic recipient writes; error details must never reach notices.
 */
async function restoreOptionalSavedKeys(required: { root: string; dir: string; dbPath: string; siteId?: string; savedKeys?: Pick<SiteSavedKeysPort, "restore"> }, optional: { savedKeysPassword?: string; signal?: AbortSignal }): Promise<void> {
  const file = path.join(required.root, ".saved-keys.json");
  if (!fs.existsSync(file)) return;
  // restore() already turns every non-abort failure into a fixed notice.
  const notices = required.savedKeys && required.siteId
    ? (await required.savedKeys.restore({ encryptedKeys: fs.readFileSync(file), password: optional.savedKeysPassword, siteId: required.siteId, dir: required.dir, dbPath: required.dbPath }, { signal: optional.signal })).notices
    : ["Saved keys were left out because their restore service was unavailable."];
  addStagedWarnings({ root: required.root, notices });
}

/** Merge notices into the private stage state that `stagedImportWarnings` reads. O(notices). */
function addStagedWarnings(required: { root: string; notices: readonly string[] }): void {
  if (!required.notices.length) return;
  const stateFile = path.join(required.root, ".archive-state.json");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  fs.writeFileSync(stateFile, JSON.stringify({ ...state, warnings: [...new Set([...(state.warnings ?? []), ...required.notices])] }), { mode: 0o600 });
}

/** Read bounded safe notices and extension warnings from the private functional stage. */
export function stagedImportWarnings(required: { root: string }, _optional = {}): string[] {
  const file = path.join(required.root, ".archive-state.json");
  if (!fs.existsSync(file)) return [];
  const state = JSON.parse(fs.readFileSync(file, "utf8")) as ImportedExtensionState & { warnings?: string[] };
  return [...new Set([...(state.warnings ?? []), ...editedArchiveWarnings({ units: state.modified }), ...keptOffArchiveWarnings({ units: state.keptOff ?? [] })])];
}
