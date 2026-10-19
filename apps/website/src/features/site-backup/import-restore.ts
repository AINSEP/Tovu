import fs from "node:fs";
import path from "node:path";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { readTemplate } from "#src/platform/site-dir/read-template";
import { validateSharePath } from "./share-file-policy.js";
import type { VerifiedSiteImport } from "./import-verifier.js";
import { checkSourceDirContainment } from "#src/features/theme/validation/structure";
import { loadTheme } from "#src/features/theme/theme";

/** Persist only verified, freshly projected data; the stage is private and never served. */
export function stageVerifiedImport(required: { root: string; verified: VerifiedSiteImport }, _options: Record<string, never> = {}): void {
  fs.mkdirSync(required.root, { mode: 0o700 });
  writeExclusive({ root: required.root, relative: "database/content.db", bytes: required.verified.database });
  for (const [relative, bytes] of required.verified.files) writeExclusive({ root: required.root, relative, bytes });
  fs.writeFileSync(path.join(required.root, ".inventory.json"), JSON.stringify([...required.verified.files.keys()]), { flag: "wx", mode: 0o600 });
}

/** Init's pre-commit restore port. Untrusted extensions never enter a discovery/activation root.
 * Static/declarative theme trees are eligible only when the whole tree contains supported assets;
 * executable themes and overrides remain preserved under the unserved quarantine directory.
 * @complexity O(files + bytes), capped by the verified inventory (2,000 entries/300 MiB).
 */
export async function restoreStagedImport(required: { root: string; dir: string; dbPath: string }, _options: Record<string, never> = {}): Promise<void> {
  const files = JSON.parse(fs.readFileSync(path.join(required.root, ".inventory.json"), "utf8")) as string[];
  const allowedThemes = new Set<string>();
  const quarantinedThemes = new Set<string>();
  const compiledSources = new Map<string, string>();
  for (const file of files) {
    const match = /^themes\/(static|declarative)\/([^/]+)\/theme.json$/.exec(file);
    if (!match) continue;
    const id = match[1] + "/" + match[2];
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(required.root, file), "utf8"));
      if (manifest.tier !== match[1]) { quarantinedThemes.add(id); continue; }
      if (manifest.build?.source !== "compiled") continue;
      const build = manifest.build;
      if (manifest.tier !== "static" || typeof build.sourceDir !== "string" || checkSourceDirContainment({ build, schemaVersion: 2 }).length) { quarantinedThemes.add(id); continue; }
      validateSharePath({ path: build.sourceDir });
      // The theme owner treats compiled output as static, never as a server code tier. Reuse its
      // artifact validation; preserve authored build source ONLY in the quarantine tree.
      const theme = loadTheme({ themeDir: path.join(required.root, "themes", id), id: match[2]!, source: "site" });
      if (theme.status === "invalid") { quarantinedThemes.add(id); continue; }
      compiledSources.set(id, "themes/" + id + "/" + build.sourceDir.replace(/\/$/, "") + "/");
    } catch { quarantinedThemes.add(id); }
  }
  for (const file of files) {
    const match = /^themes\/(static|declarative)\/([^/]+)\/(.+)$/.exec(file);
    if (!match) continue;
    const id = match[1] + "/" + match[2];
    allowedThemes.add(id);
    if (compiledSources.has(id) && file.startsWith(compiledSources.get(id)!)) continue;
    // Browser JS is an ordinary static asset, unlike TS/JS modules in a code theme. The whole
    // tree is quarantined if it includes build source or declares a different executable tier.
    if (!/\.(?:html|css|js|json|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|txt|md|mp4|webm|pdf)$/i.test(match[3]!)) quarantinedThemes.add(id);
  }
  for (const id of quarantinedThemes) allowedThemes.delete(id);
  for (const id of allowedThemes) fs.rmSync(path.join(required.dir, "themes", id), { recursive: true, force: true });
  // Copy the freshly rebuilt database, never the archived SQLite bytes. Exclusive creation and
  // init's DB-path resolver protect both in-site and app-data placement from overwriting a site.
  fs.copyFileSync(path.join(required.root, "database/content.db"), required.dbPath, fs.constants.COPYFILE_EXCL);
  for (const file of files) {
    if (file.startsWith("settings/")) continue; // Init regenerates host config and fresh identity.
    const theme = /^themes\/((?:static|declarative)\/[^/]+)\//.exec(file)?.[1];
    const isCompiledSource = theme !== undefined && compiledSources.has(theme) && file.startsWith(compiledSources.get(theme)!);
    const destination = file.startsWith("uploads/") || theme && allowedThemes.has(theme) && !isCompiledSource
      ? file : ".import-quarantine/" + file;
    writeExclusive({ root: required.dir, relative: destination, bytes: fs.readFileSync(path.join(required.root, file)) });
  }
  const db = openSqliteFileKernel<ContentDatabase>(required.dbPath);
  try {
    const active = await db.run(query => query.selectFrom("presentation_settings").select("active_theme_id").execute());
    const fallback = readTemplate({ templateId: "starter" }).seed.presentation.activeThemeId;
    for (const row of active) if (!allowedThemes.has(row.active_theme_id)) {
      await db.run(query => query.updateTable("presentation_settings").set({ active_theme_id: fallback }).where("active_theme_id", "=", row.active_theme_id).execute());
    }
  } finally { await db.close(); }
}

/** Private roots plus exclusive files prevent extraction through pre-existing links or aliases. */
function writeExclusive(required: { root: string; relative: string; bytes: Buffer }): void {
  validateSharePath({ path: required.relative });
  const target = path.resolve(required.root, required.relative);
  if (!target.startsWith(path.resolve(required.root) + path.sep)) throw new Error("Import path escaped staging");
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, required.bytes, { flag: "wx", mode: 0o600 });
}
