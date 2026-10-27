import { editedArchiveWarnings } from "./archive-paths.js";
import fs from "node:fs";
import path from "node:path";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { readTemplate } from "#src/platform/site-dir/read-template";
import type { VerifiedSiteImport } from "./import-verifier.js";
import { restoreImportedPluginState, type ImportedExtensionState } from "./import-plugin-state.js";
import { inspectThemeManifests, liveThemeTrees, restoreDestination, writeExclusive } from "./import-restore-placement.js";

/** Persist only verified, freshly projected data; the stage is private and never served. */
export function stageVerifiedImport(required: { root: string; verified: VerifiedSiteImport }, _options: Record<string, never> = {}): void {
  fs.mkdirSync(required.root, { mode: 0o700 });
  writeExclusive({ root: required.root, relative: "database/content.db", bytes: required.verified.database });
  for (const [relative, bytes] of required.verified.files) writeExclusive({ root: required.root, relative, bytes });
  fs.writeFileSync(path.join(required.root, ".archive-state.json"), JSON.stringify({ plugins: required.verified.plugins, trustedPlugins: required.verified.trustedPlugins, modified: [...required.verified.modified] }), { flag: "wx", mode: 0o600 });
  fs.writeFileSync(path.join(required.root, ".inventory.json"), JSON.stringify([...required.verified.files.keys()]), { flag: "wx", mode: 0o600 });
}

/** Init's pre-commit restore port. Untrusted extensions never enter a discovery/activation root.
 * Static/declarative theme trees are eligible only when the whole tree contains supported assets;
 * executable themes and overrides remain preserved under the unserved quarantine directory.
 * @complexity O(files + bytes), capped by the verified inventory (2,000 entries/300 MiB).
 */
export async function restoreStagedImport(required: { root: string; dir: string; dbPath: string }, optional: { pluginSourceRoot?: string } = {}): Promise<void> {
  const files = JSON.parse(fs.readFileSync(path.join(required.root, ".inventory.json"), "utf8")) as string[];
  const state = JSON.parse(fs.readFileSync(path.join(required.root, ".archive-state.json"), "utf8")) as ImportedExtensionState;
  const findings = inspectThemeManifests({ root: required.root, files });
  const liveThemes = liveThemeTrees({ files, findings });
  for (const id of liveThemes) if (state.modified.includes("themes/" + id.split("/").at(-1))) liveThemes.delete(id);
  for (const id of liveThemes) fs.rmSync(path.join(required.dir, "themes", id), { recursive: true, force: true });
  // Copy the freshly rebuilt database, never the archived SQLite bytes. Exclusive creation and
  // init's DB-path resolver protect both in-site and app-data placement from overwriting a site.
  fs.copyFileSync(path.join(required.root, "database/content.db"), required.dbPath, fs.constants.COPYFILE_EXCL);
  const placedMemory = await restoreImportedPluginState({ root: required.root, dir: required.dir, state, files }, { sourceRoot: optional.pluginSourceRoot });
  for (const file of files) {
    if (placedMemory.has(file)) continue;
    const destination = restoreDestination({ file, liveThemes, compiledSources: findings.compiledSources });
    if (destination !== null) writeExclusive({ root: required.dir, relative: destination, bytes: fs.readFileSync(path.join(required.root, file)) });
  }
  await resetUnplacedActiveThemes({ dbPath: required.dbPath, liveThemes });
}

/** A workspace whose active theme was quarantined (or never shipped) falls back to the starter theme. */
async function resetUnplacedActiveThemes(required: { dbPath: string; liveThemes: ReadonlySet<string> }): Promise<void> {
  const db = openSqliteFileKernel<ContentDatabase>(required.dbPath);
  try {
    const active = await db.run(query => query.selectFrom("presentation_settings").select("active_theme_id").execute());
    const fallback = readTemplate({ templateId: "starter" }).seed.presentation.activeThemeId;
    for (const row of active) if (!required.liveThemes.has(row.active_theme_id)) {
      await db.run(query => query.updateTable("presentation_settings").set({ active_theme_id: fallback }).where("active_theme_id", "=", row.active_theme_id).execute());
    }
  } finally { await db.close(); }
}

/** Read pending-result warnings from the functional stage; nothing is added to import history. */
export function stagedImportWarnings(required: { root: string }, _optional = {}): string[] {
  const file = path.join(required.root, ".archive-state.json");
  if (!fs.existsSync(file)) return [];
  const state = JSON.parse(fs.readFileSync(file, "utf8")) as ImportedExtensionState;
  return editedArchiveWarnings({ units: state.modified });
}
