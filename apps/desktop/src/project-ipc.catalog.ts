import { shareSiteDirectories } from "./shared-sites.ts";
import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import fs from "node:fs";

import { uniqueSiteName } from "./site-name-policy.ts";
import { readProjectsFile, readTrackedSites, discoverSiteDirs, adoptDiscoveredSites, updateProjectsFile } from "./tracked-sites.ts";
import { relocateMovedSites, repointTrackedSite, type RelocationGate } from "./site-relocation.ts";
import { type ProjectIpcDeps, type SiteRow } from "./project-ipc.types.ts";
import { buildSiteRecord } from "./project-ipc.records.ts";


/** Import catalog discovery without transferring local origin or deletion authority. O(n) rows. */
export function importSharedSiteDiscovery(
  { projectsPath, sharedSites, readSiteName }: Pick<ProjectIpcDeps, "projectsPath" | "sharedSites" | "readSiteName">, _options = {},
): void {
  if (!sharedSites) return;
  try {
    // The shared catalog supplies discovery, never the local origin/deletion authority.
    const rows = readTrackedSites({ projectsPath });
    if (rows.length) shareSiteDirectories({ workspace: sharedSites, dirs: rows.map((row) => row.siteDir), createdBy: "desktop-legacy", migration: `projects:${projectsPath}` });
    adoptWithUniqueNames({ deps: { projectsPath, readSiteName }, siteDirs: sharedSites.registry({}).list({}).map((entry) => entry.path) });
  } catch (error) { console.warn("tovu desktop: shared discovery is unavailable; showing local website cards.", formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)); }
}

/**
 * Every tracked project's record, after healing any whose folder was renamed or moved
 * (`site-relocation.ts`). The heal is best-effort: a list that cannot be SAVED still has to render,
 * so a failed write is logged and the rows are shown as they stand.
 *
 * With `relocationGate` (production: {@link registerSiteIpcHandlers}), the heal runs only when the
 * gate says something could have moved, so a 4 s poll over a missing folder does not rescan its
 * siblings every time. Without one, it runs on every call.
 *
 * @complexity O(n) in the tracked-project count, plus `relocateMovedSites`' scan for a missing row.
 */
export function handleList(
  deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> &
    Partial<Pick<ProjectIpcDeps, "siteScanRoots" | "siteFolders" | "classifySiteDir" | "externalSites">> & { relocationGate?: RelocationGate },
) {
  importSharedSiteDiscovery({ projectsPath: deps.projectsPath, sharedSites: deps.sharedSites, readSiteName: deps.readSiteName });
  const file = readProjectsFile({ projectsPath: deps.projectsPath });
  if (deps.relocationGate && !deps.relocationGate.shouldRun({ file })) return recordsWithRememberedNames({ rows: file.rows, deps });
  try {
    relocateMovedSites({ projectsPath: deps.projectsPath }, { searchRoots: deps.siteFolders?.read({}).roots ?? deps.siteScanRoots ?? [], classifySiteDir: deps.classifySiteDir });
  } catch (error) {
    console.warn(`tovu desktop: could not save moved site folders — ${(error as Error).message}`);
  }
  const rows = readTrackedSites({ projectsPath: deps.projectsPath });
  if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: rows.map((row) => row.siteDir), createdBy: "desktop-legacy" });
  return recordsWithRememberedNames({ rows, deps });
}

/** Store only the name, never lifecycle status or deletion authority. */
export function rememberSiteName(
  { projectsPath, siteDir, displayName }: { projectsPath: string; siteDir: string; displayName: string }, _optional = {},
): void {
  try {
    updateProjectsFile({ projectsPath, change: (current) => ({
      rows: current.rows.map((row) => row.siteDir === siteDir ? { ...row, displayName } : row),
      dismissed: current.dismissed,
    }) });
  } catch (error) {
    // A metadata cache failure must not report a completed Create/Add/Rename as a failed action.
    console.warn('tovu desktop: could not remember website name', error);
  }
}
function recordsWithRememberedNames(
  { rows, deps }: { rows: SiteRow[]; deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> }, _optional = {},
) {
  const records = rows.map((row) => buildSiteRecord(row, deps));
  const names = new Map(records.filter((record) => !record.folderMissing).map((record) => [record.id, record.displayName]));
  if (rows.some((row) => names.has(row.siteDir) && names.get(row.siteDir) !== row.displayName)) {
    try {
      updateProjectsFile({ projectsPath: deps.projectsPath, change: (current) => ({
        rows: current.rows.map((row) => {
          const displayName = names.get(row.siteDir);
          return displayName === undefined ? row : { ...row, displayName };
        }),
        dismissed: current.dismissed,
      }) });
    } catch (error) { console.warn('tovu desktop: could not remember website names', error); }
  }
  return records;
}

/**
 * A missing card's Locate: the operator picks where the site's folder is now, and the card is
 * pointed there — keeping its place in the grid, and merging into the existing card when that
 * folder is already tracked. Main owns the dialog, as with `handleAddSite`, so the renderer never
 * names a path.
 *
 * @returns the record at its new folder.
 * @throws {Error} operator-facing, when the dialog is cancelled, the picked folder is not a complete
 *   Tovu site, or `id` is not tracked.
 * @complexity O(n + r + m) for n tracked rows, r catalog rows and m marker bytes.
 */
export async function handleLocate({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "dialog" | "classifySiteDir" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> }, _options = {}) {
  const picked = await deps.dialog.showOpenDialog({
    title: "Locate your Tovu website's folder",
    message: `Pick the folder that now holds the website that was at ${id}. Nothing in it will be changed.`,
    buttonLabel: "Use this folder",
    properties: ["openDirectory"],
  });
  const [siteDir] = picked.filePaths; // Use the first picked path only after checking it exists.
  if (picked.canceled || siteDir === undefined) {
    throw new Error("No folder was chosen.");
  }
  const kind = deps.classifySiteDir({ dir: siteDir });
  if (kind !== "site") {
    throw new Error(`${siteDir} is not a complete Tovu site (${kind}). Pick the folder that holds this website.`);
  }
  // The old row was repointed onto, or merged into, this exact siteDir above.
  const row = repointTrackedSite({ projectsPath: deps.projectsPath, fromDir: id, toDir: siteDir }).find((entry) => entry.siteDir === siteDir);
  if (!row) throw new Error(`Located site ${siteDir} is missing from tracked projects.`);
  if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: [siteDir], createdBy: "Desktop", allowRelocation: true });
  return buildSiteRecord(row, deps);
}

/** Live names include registry aliases and cached names for missing folders. Excluding the target
 * keeps re-adding a tracked folder and renaming a site to its own name idempotent. */
export function otherSiteNames({ deps, siteDir }: {
  deps: Pick<ProjectIpcDeps, "projectsPath" | "readSiteName">; siteDir: string;
}, _optional = {}): string[] {
  return readTrackedSites({ projectsPath: deps.projectsPath }).filter((row) => row.siteDir !== siteDir).map((row) =>
    row.displayNameAlias ?? (!fs.existsSync(row.siteDir) && row.displayName ? row.displayName : deps.readSiteName({ siteDir: row.siteDir })));
}

/** Adding a website must not rewrite its config. Persist a shell alias only when disambiguating. */
export function rememberSiteAlias({ projectsPath, siteDir, displayNameAlias }: {
  projectsPath: string; siteDir: string; displayNameAlias?: string;
}, _optional = {}): void {
  updateProjectsFile({ projectsPath, change: (current) => ({
    rows: current.rows.map((row) => row.siteDir === siteDir ? { ...row, displayNameAlias } : row),
    dismissed: current.dismissed,
  }) });
}

/**
 * Track discovered sites the way Add existing tracks a picked one: each NEWLY adopted card whose
 * name collides gets a shell alias ("Name 2"), never a config rewrite. Rows already tracked keep
 * their names — only this call's adoptions are named, one at a time so they also differ from each
 * other. O(a·n) for a adoptions over n tracked rows.
 */
function adoptWithUniqueNames({ deps, siteDirs }: {
  deps: Pick<ProjectIpcDeps, "projectsPath" | "readSiteName">; siteDirs: string[];
}, _optional = {}): void {
  for (const siteDir of adoptDiscoveredSites({ projectsPath: deps.projectsPath, siteDirs })) {
    const originalName = deps.readSiteName({ siteDir });
    const displayName = uniqueSiteName({ name: originalName, names: otherSiteNames({ deps, siteDir }) });
    if (displayName !== originalName) rememberSiteAlias({ projectsPath: deps.projectsPath, siteDir, displayNameAlias: displayName });
  }
}

/**
 * Find every Tovu site on disk the operator has no stored answer about, track it, and return the
 * whole refreshed list.
 *
 * This is the fix for the Projects screen having no discovery at all: {@link handleList} renders
 * `desktop-projects.json` and nothing else — no scan, no rescan, no fallback — so a site created by
 * `tovu init` outside the shell, or restored from a backup, was invisible forever no matter how
 * plainly it sat on disk. Runs once at boot (`main.ts`) and again whenever the operator asks.
 *
 * **A directory the operator removed on purpose is never brought back**, however many times this
 * runs. That is `adoptDiscoveredSites`' rule, not this function's, and the reason it lives down
 * there is that the boot pass and the operator's button must not be able to disagree about it: a
 * rescan that resurrected deleted cards would be the same bug the seed guard exists to prevent,
 * and worse here, since a button can be pressed again. Their way back is the folder dialog, which
 * reaches `trackSite` directly — see that function's own comment on why only the explicit adder
 * clears a dismissal.
 *
 * @param deps.siteScanRoots directories whose immediate children are candidate sites.
 * @param deps.siteFolders Profile settings read on every scan: built-in roots, remembered
 *   creation parents and extra roots. Supersedes the static roots when supplied.
 * @param deps.recentSiteDirs `site-dir-store.ts`'s recently-opened list, as a thunk — the sites
 *   own-server mode has been recording all along, which are the operator's by definition and
 *   generally do not live under any scan root.
 * @param deps.discoverSites Production's bounded, cancellable worker; reads roots/MRU off-thread.
 * @returns A promise for the same records {@link handleList} would return, after the pass.
 * @throws Discovery limit, timeout or cancellation errors before any candidate is adopted.
 * @complexity O(n log n) discovery plus O(n + m) adoption for n candidates and m stored rows.
 */
export async function rescanSites(deps: Pick<ProjectIpcDeps, "siteScanRoots" | "recentSiteDirs" | "classifySiteDir" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "siteFolders" | "sharedSites" | "siteRuntime" | "discoverSites">) {
  // Production injects the read-only worker. Legacy hosts/tests retain the same discovery owner.
  const found = deps.discoverSites ? await deps.discoverSites({}) : discoverSiteDirs({
    scanRoots: deps.siteFolders?.read({}).roots ?? deps.siteScanRoots,
    knownDirs: deps.recentSiteDirs(),
    classifySiteDir: deps.classifySiteDir,
  }, { homeDir: deps.sharedSites?.homeDir, sitesHome: deps.sharedSites?.home({}) });
  adoptWithUniqueNames({ deps, siteDirs: found });
  return handleList(deps);
}

/** Main owns the picker; adding a root only changes future discovery, never site files/processes.
 * @returns Fresh settings, or null on cancellation.
 * @throws Native picker or persistence errors, preserving their actual message.
 * @complexity O(n log n) bounded discovery in the worker, then O(r) settings for r roots.
 */
export async function handleAddSiteFolder({ deps }: { deps: Pick<ProjectIpcDeps, "dialog" | "siteFolders" | "discoverSites" | "classifySiteDir" | "recentSiteDirs" | "sharedSites"> }, _options = {}) {
  if (!deps.siteFolders) throw new Error("Sites folders settings are unavailable in this desktop version.");
  const picked = await deps.dialog.showOpenDialog({
    title: "Add sites folder", message: "Choose a folder containing Tovu website folders. Use Rescan to discover them.",
    buttonLabel: "Add folder", properties: ["openDirectory"],
  });
  const [folder] = picked.filePaths;
  if (picked.canceled || folder === undefined) return null;
  const root = fs.realpathSync(folder);
  const scanRoots = [...new Set([...deps.siteFolders.read({}).roots, root])];
  // Use the discovery owner before committing settings, including aggregate entry/root limits.
  // A failed scan leaves both shared config and legacy profile settings byte-for-byte unchanged.
  if (deps.discoverSites) await deps.discoverSites({ scanRoots });
  else discoverSiteDirs({ scanRoots, knownDirs: deps.recentSiteDirs(), classifySiteDir: deps.classifySiteDir }, { homeDir: deps.sharedSites?.homeDir, sitesHome: deps.sharedSites?.home({}) });
  return deps.siteFolders.add({ root });
}
