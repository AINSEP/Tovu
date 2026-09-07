/**
 * @file Which sites the operator considers "theirs" — the list the Projects screen renders cards
 * from. A JSON file in `userData`, not a sqlite table: porting Tovu-Runner's `project-registry.ts`
 * wholesale would drag `@jini-ai/sqlite` + `better-sqlite3` into a shell that has twice, in writing,
 * decided not to have them (`site-dir-store.cjs`'s own header makes the same call for its MRU list).
 *
 * Status is deliberately NOT stored here. `openSites.has(siteDir)` in `main.cjs` is ground truth for
 * "running" — a status written to this file would go stale the moment Electron is killed hard,
 * exactly the failure mode `site-registry.cjs`'s crash-safety design exists to avoid for the
 * supervision side of the same problem. `buildProjectRecord` (`main.cjs`) is what joins one row here
 * with `openSites` to produce the `ProjectRecord` the renderer actually gets.
 *
 * No `electron` import, so this is testable under plain `node --test` — same convention as
 * `site-dir-store.cjs` and `site-registry.cjs`.
 */
const fs = require("node:fs");
const path = require("node:path");

const PROJECTS_FILE_NAME = "desktop-projects.json";

/**
 * A tracked row's PROVENANCE — who made the directory it points at. Recorded because project delete
 * ends in a recursive `fs.rm` (`project-ipc.cjs`'s `handleDelete`), and that is only ever a correct
 * thing to do to a directory this app itself created.
 *
 * Two values, and the split is exactly `classifySiteDir`'s: `handleCreate` classifies the picked
 * folder BEFORE `adoptSiteDir` runs, so `"empty"` (which `tovu init` is about to fill) is the one
 * case that becomes `created`, and a folder that was already a site becomes `adopted` — the same
 * value `seedDevFallbackProject` writes. `adoptSiteDir` alone cannot tell the two apart: it returns
 * the same path either way.
 *
 * Not a boolean, because a boolean would have to be named for the CONSEQUENCE ("removable") and
 * would then have to change meaning if the deletion policy ever gains another rule. This records the
 * FACT; `project-delete-guard.cjs` owns the policy over it.
 */
const PROJECT_ORIGIN = Object.freeze({
  /** This app ran `tovu init` into an empty folder — every byte under it is ours. */
  created: "created",
  /** The directory already existed as a site when this app started tracking it. Never erased. */
  adopted: "adopted",
});

/** @returns the tracked-projects file's path inside Electron's per-user `userData` directory. */
function projectsFilePath(userDataDir) {
  return path.join(userDataDir, PROJECTS_FILE_NAME);
}

/**
 * Coerce a row's stored `origin` to a known {@link PROJECT_ORIGIN} value, FAIL-CLOSED: anything that
 * is not literally `"created"` — absent (a row written before provenance existed), misspelled, or a
 * non-string a hand-edited file put there — reads as `adopted`, the value that never erases files.
 *
 * @complexity O(1).
 */
function normalizeOrigin(origin) {
  return origin === PROJECT_ORIGIN.created ? PROJECT_ORIGIN.created : PROJECT_ORIGIN.adopted;
}

/**
 * Parse the registry file, or `undefined` when it is absent, unreadable, or not a JSON object.
 *
 * The one place the file is read from disk, so {@link readTrackedProjects} and
 * {@link readDismissedProjects} can never disagree about whether a given file exists — the
 * distinction between "no file at all" and "a file holding an empty list" is load-bearing for
 * {@link migrateLegacyDismissals}, and two independent readers would eventually drift on it.
 *
 * @complexity O(n) in file size.
 */
function readRegistryFile(projectsPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the tracked project list, treating any unreadable or malformed file as "nothing tracked yet".
 *
 * Deliberately forgiving, the same rule `site-dir-store.cjs`'s `readDesktopState` follows: this file
 * is a convenience list over sites that still exist for real on disk, not the sites themselves, so a
 * truncated or corrupt copy should read as empty rather than crash the Projects screen.
 *
 * Every row comes back with a definite {@link PROJECT_ORIGIN} value: a row written before
 * provenance existed, or one carrying an unrecognized value, reads as `adopted`. That is the single
 * place the fail-closed rule lives, so no consumer has to remember to default it — see
 * {@link normalizeOrigin}.
 *
 * @returns rows shaped `{siteDir, createdAt, origin}`, oldest first.
 * @complexity O(n) in file size.
 */
function readTrackedProjects(projectsPath) {
  const parsed = readRegistryFile(projectsPath);
  const rows = Array.isArray(parsed?.projects) ? parsed.projects : [];
  return rows
    .filter((row) => typeof row?.siteDir === "string" && typeof row?.createdAt === "string")
    .map((row) => ({ ...row, origin: normalizeOrigin(row.origin) }));
}

/**
 * Directories the operator has REMOVED on purpose — the tombstone list, and the reason a removal
 * survives the row it removed.
 *
 * Nothing automatic may ever add a directory named here: not {@link seedDevFallbackProject}, not
 * {@link adoptDiscoveredProjects} on boot, not a rescan. Only {@link trackProject} — the explicit
 * adder, reached by the operator picking the folder themselves — clears an entry.
 *
 * A file with no `dismissed` key at all reads as an empty list here rather than as something
 * inferred, because the inference is not this function's to make: see
 * {@link migrateLegacyDismissals}, which converts a pre-dismissals file exactly once and leaves
 * every later reader looking at one uniform shape.
 *
 * @returns the dismissed site dirs, in the order they were removed.
 * @complexity O(n) in file size.
 */
function readDismissedProjects(projectsPath) {
  const dismissed = readRegistryFile(projectsPath)?.dismissed;
  return Array.isArray(dismissed) ? dismissed.filter((dir) => typeof dir === "string") : [];
}

/**
 * @param dismissed the tombstone list to write. Defaults to whatever is already on disk, so a
 *   caller that only means to change the ROWS cannot silently erase the operator's removals — the
 *   failure mode that would quietly resurrect every dismissed project on the next scan.
 * @complexity O(n) in the row count.
 */
function writeTrackedProjects(projectsPath, rows, dismissed = readDismissedProjects(projectsPath)) {
  fs.mkdirSync(path.dirname(projectsPath), { recursive: true });
  fs.writeFileSync(projectsPath, JSON.stringify({ projects: rows, dismissed }, null, 2));
}

/**
 * Track `siteDir`, if it is not already tracked. Idempotent — re-tracking an existing dir returns
 * the list unchanged rather than duplicating or bumping its row (and therefore never upgrades an
 * `adopted` row to `created` behind the operator's back).
 *
 * @param origin see {@link PROJECT_ORIGIN}. Defaults to `adopted` — the value that forbids erasing
 *   the directory — so a call site that forgets to state provenance fails CLOSED rather than
 *   handing a stranger's folder to `fs.rm`. Only a caller that positively knows this app created
 *   the directory may pass `created`.
 * @returns the new row list.
 * @complexity O(n) in the row count.
 */
function trackProject(projectsPath, siteDir, origin = PROJECT_ORIGIN.adopted) {
  const rows = readTrackedProjects(projectsPath);
  // Clearing the tombstone is safe HERE and only here, and that is an invariant rather than a
  // convenience: this is the EXPLICIT adder, reached when the operator picks the folder in the
  // dialog themselves, and picking a folder they once removed is them asking for it back. Every
  // AUTOMATIC adder must consult `isProjectDirKnown` before calling this, so a dismissed directory
  // never reaches this line by machine.
  const dismissed = readDismissedProjects(projectsPath).filter((dir) => dir !== siteDir);
  if (rows.some((row) => row.siteDir === siteDir)) {
    if (dismissed.length !== readDismissedProjects(projectsPath).length) writeTrackedProjects(projectsPath, rows, dismissed);
    return rows;
  }
  const next = [...rows, { siteDir, createdAt: new Date().toISOString(), origin: normalizeOrigin(origin) }];
  writeTrackedProjects(projectsPath, next, dismissed);
  return next;
}

/**
 * Stop tracking `siteDir`. A no-op, not an error, when it was never tracked — the caller (project
 * delete) wants this to be idempotent too.
 *
 * @returns the new row list.
 * @complexity O(n) in the row count.
 */
function untrackProject(projectsPath, siteDir) {
  const rows = readTrackedProjects(projectsPath).filter((row) => row.siteDir !== siteDir);
  // The removal is RECORDED, not just applied. Dropping the row alone was enough while the list was
  // the only thing that could add a project; with a boot scan and a rescan also adding, a bare
  // deletion would be undone by the very next one. See {@link readDismissedProjects}.
  writeTrackedProjects(projectsPath, rows, [...new Set([...readDismissedProjects(projectsPath), siteDir])]);
  return rows;
}

/**
 * Whether the operator's stored state already has an ANSWER about `siteDir` — it is tracked, or
 * they removed it on purpose. The single predicate every automatic adder consults before adding
 * anything, so "already there" and "deliberately not there" cannot drift apart between the seed,
 * the boot scan, and a rescan.
 *
 * @complexity O(n) in the row + dismissal count.
 */
function isProjectDirKnown(projectsPath, siteDir) {
  if (readTrackedProjects(projectsPath).some((row) => row.siteDir === siteDir)) return true;
  return readDismissedProjects(projectsPath).includes(siteDir);
}

/**
 * Convert a registry file written BEFORE removals were recorded into one that records them, once.
 *
 * This exists to preserve one property across the format change. The old
 * {@link seedDevFallbackProject} guard was `if (fs.existsSync(projectsPath)) return false;` — file
 * existence, deliberately, because `trackProject`/`untrackProject` both write unconditionally, so
 * an operator who tracked and then removed every project still has a file (holding
 * `{projects: []}`) and must never be re-seeded against their will. Replacing that guard with a
 * per-directory question would, on its own, LOSE exactly that: an empty legacy file says nothing
 * about `devFallbackDir`, so the seed would fire again and hand back the card they deleted.
 *
 * So the fact is recovered before it is needed. `seedDevFallbackProject` is the ONLY mechanism that
 * could have added a directory without being asked before this field existed, and `devFallbackDir`
 * is the only directory it could ever add. A legacy file that does not track it is therefore a file
 * whose operator removed it — the precise fact the existence check encoded — and it is written down
 * as a dismissal, where every later reader can see it.
 *
 * Deliberately narrow. Every OTHER untracked directory is left alone: nothing automatic had ever
 * offered those, so the first boot scan is their first offer, not a resurrection. The bounded cost
 * of that choice, stated rather than hidden: on a legacy install, a site the operator adopted by
 * hand and later removed can reappear once, and removing it again records a dismissal that sticks.
 *
 * A no-op when there is no file at all (a fresh install has removed nothing) and when the file
 * already carries a `dismissed` key (already migrated — running again would manufacture a tombstone
 * for a directory the operator has simply never seen).
 *
 * @returns the dismissals this call added — empty when nothing needed migrating.
 * @complexity O(n) in file size.
 */
function migrateLegacyDismissals(projectsPath, devFallbackDir) {
  const parsed = readRegistryFile(projectsPath);
  if (parsed === undefined) return [];
  if (Array.isArray(parsed.dismissed)) return [];
  const rows = readTrackedProjects(projectsPath);
  const added = rows.some((row) => row.siteDir === devFallbackDir) ? [] : [devFallbackDir];
  writeTrackedProjects(projectsPath, rows, added);
  return added;
}

/**
 * Seed `devFallbackDir` as a tracked project unless the operator's stored state already answers for
 * it — see {@link isProjectDirKnown}, and {@link migrateLegacyDismissals} for how a file written
 * before dismissals existed still answers.
 *
 * The guard USED to be file existence, which also blocked every legitimate case: once anything at
 * all was tracked, the dev fallback could never appear, even on an install that had never seen it.
 * Asking about the directory instead of the file fixes that without giving up the property the old
 * guard bought — a removed project stays removed, because the removal is now a recorded fact rather
 * than an inference from the file's existence.
 *
 * `classifySiteDir` is injected rather than required directly (`site-dir-store.cjs`) so this
 * deliberately dependency-light module (see this file's header) stays decoupled from it, and so
 * callers can test the seeding decision without a real directory on disk.
 *
 * @returns whether a row was seeded.
 * @complexity O(1) beyond `classifySiteDir`'s and `trackProject`'s own cost.
 */
function seedDevFallbackProject(projectsPath, devFallbackDir, classifySiteDir) {
  if (isProjectDirKnown(projectsPath, devFallbackDir)) return false;
  if (classifySiteDir(devFallbackDir) !== "site") return false;
  // ALWAYS `adopted`, and stated rather than left to the default: this row points at a folder that
  // already held a site before this app ever ran — `<repo>/sites/tovu-com` in a checkout, someone's
  // real content. Deleting its card must never delete it.
  trackProject(projectsPath, devFallbackDir, PROJECT_ORIGIN.adopted);
  return true;
}

/**
 * Every directory that is really a Tovu site, out of `scanRoots`' immediate children plus
 * `knownDirs` themselves.
 *
 * This is the answer to "a site created by `tovu init` outside the shell never appears": the
 * Projects screen used to render `desktop-projects.json` and nothing else, with no scan, no
 * rescan and no fallback, so a site that existed on disk but had never been picked in this app's
 * folder dialog was invisible forever.
 *
 * Deliberately ONE level deep under each root. A recursive walk would descend into every site's own
 * `uploads/` and `node_modules/`, which is unbounded work at boot for directories that cannot be
 * sites; the flat layout is the convention `devFallbackDir` (`<repo>/sites/tovu-com`) already
 * follows. `knownDirs` covers the sites that do not live under any root — `site-dir-store.cjs`'s
 * recently-opened list, which own-server mode has been writing all along.
 *
 * Note this is NOT a port of a Tovu-Runner mechanism: Runner keeps its projects in a SQLite
 * registry and never scans `instancesRoot` at all — its `reconcile()` repairs the STATUS of rows it
 * already has and discovers nothing. There was no scheme to copy, so this is the shell's own, built
 * on the two directory conventions the shell already has.
 *
 * @param deps.scanRoots directories whose immediate children are candidates. Missing roots are
 *   skipped, not an error — `<repo>/sites` does not exist in a packaged app.
 * @param deps.knownDirs candidate directories themselves, already-known paths rather than parents.
 * @param deps.classifySiteDir `site-dir-store.cjs`'s classifier, injected — see
 *   {@link seedDevFallbackProject} on why this module takes it rather than requiring it.
 * @returns absolute site dirs, deduped and sorted.
 * @complexity O(n) in the roots' combined child count.
 */
function discoverSiteDirs({ scanRoots, knownDirs, classifySiteDir }) {
  const candidates = [];
  for (const root of scanRoots) {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) candidates.push(path.join(root, entry));
  }
  candidates.push(...knownDirs);
  return [...new Set(candidates)]
    .filter((dir) => {
      // `statSync` and not a dirent check: `classifySiteDir` calls `readdirSync` on anything whose
      // two marker files are both absent, which throws ENOTDIR on a plain file and would take the
      // whole boot down. Following symlinks is the intent — a symlinked site dir is a site.
      const stat = fs.statSync(dir, { throwIfNoEntry: false });
      return stat !== undefined && stat.isDirectory() && classifySiteDir(dir) === "site";
    })
    .sort();
}

/**
 * Track every discovered directory the operator has no stored answer about.
 *
 * The merge rule, and the whole reason this is not just a loop over `trackProject`: a directory in
 * the dismissal list is SKIPPED and stays dismissed. Discovery is automatic, and an automatic adder
 * that resurrected deliberately-removed projects would be the same bug the seed guard exists to
 * prevent, wearing a different hat — worse here, because a rescan can be triggered repeatedly. The
 * operator's way back is the folder dialog, which reaches {@link trackProject} directly and clears
 * the tombstone, because that one IS them asking.
 *
 * Every discovery is recorded `adopted`, never `created`: this app did not make any of these
 * directories, so `project-delete-guard.cjs` must never let a delete erase one.
 *
 * @returns the dirs newly tracked by this call, in `siteDirs` order — empty when nothing was new.
 * @complexity O(n * m) in the discovered count and the registry size.
 */
function adoptDiscoveredProjects(projectsPath, siteDirs) {
  const adopted = [];
  for (const siteDir of siteDirs) {
    if (isProjectDirKnown(projectsPath, siteDir)) continue;
    trackProject(projectsPath, siteDir, PROJECT_ORIGIN.adopted);
    adopted.push(siteDir);
  }
  return adopted;
}

module.exports = {
  PROJECTS_FILE_NAME,
  PROJECT_ORIGIN,
  normalizeOrigin,
  projectsFilePath,
  readTrackedProjects,
  writeTrackedProjects,
  trackProject,
  untrackProject,
  seedDevFallbackProject,
  readDismissedProjects,
  isProjectDirKnown,
  migrateLegacyDismissals,
  discoverSiteDirs,
  adoptDiscoveredProjects,
};
