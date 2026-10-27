import type { Dirent } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import { PLUGIN_MANIFEST_FILENAMES } from "@jini-ai/plugins/host";

/**
 * The version folder a share exports from one site plugin slot `plugins/<id>/`, or `undefined` for a flat
 * plugin whose slot root is the package. A child is an installed version only when its own manifest
 * (`jini.plugin.json`, else the legacy `tovu.plugin.json`) names that same version, which is how Jini's
 * installer lays a slot out and what its discovery requires (`VERSION_FOLDER_MISMATCH` otherwise); a folder
 * name alone proves nothing (`1.2.3/` or `1.2.docs/` can be a flat plugin's content, Codex check 2026-10-27).
 * The active version is the activation pin when it is one of them, else the latest, as discovery picks it.
 * The other retained versions are rollback copies and stay behind (design 2026-10-27).
 * @complexity O(children) manifest reads.
 */
export async function activeSitePluginVersion(required: { slot: string; children: readonly Dirent[] }, optional: { pinned?: string | undefined } = {}): Promise<string | undefined> {
  const versions: string[] = [];
  for (const child of required.children) {
    if (child.isDirectory() && await manifestVersion({ dir: path.join(required.slot, child.name) }) === child.name) versions.push(child.name);
  }
  if (optional.pinned !== undefined && versions.includes(optional.pinned)) return optional.pinned;
  return versions.sort(newestFirst)[0];
}

/** The version the folder's first present manifest names; `undefined` when none is present or readable as one. */
async function manifestVersion(required: { dir: string }): Promise<string | undefined> {
  for (const name of PLUGIN_MANIFEST_FILENAMES) {
    let text: string;
    try { text = await readFile(path.join(required.dir, name), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    try { const version = (JSON.parse(text) as { version?: unknown } | null)?.version; return typeof version === "string" ? version : undefined; }
    catch { return undefined; } // A malformed manifest makes the plugin invalid in discovery; its folder is content.
  }
  return undefined;
}

/** Jini discovery's order: valid SemVer newest first, then other names (the legacy two-part `1.0`) last. */
function newestFirst(a: string, b: string): number {
  const [left, right] = [semver.valid(a), semver.valid(b)];
  if (left && right) return semver.rcompare(left, right);
  if (left || right) return left ? -1 : 1;
  return b.localeCompare(a);
}
