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
  try {
    const parsed = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    const rows = Array.isArray(parsed?.projects) ? parsed.projects : [];
    return rows
      .filter((row) => typeof row?.siteDir === "string" && typeof row?.createdAt === "string")
      .map((row) => ({ ...row, origin: normalizeOrigin(row.origin) }));
  } catch {
    return [];
  }
}

/** @complexity O(n) in the row count. */
function writeTrackedProjects(projectsPath, rows) {
  fs.mkdirSync(path.dirname(projectsPath), { recursive: true });
  fs.writeFileSync(projectsPath, JSON.stringify({ projects: rows }, null, 2));
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
  if (rows.some((row) => row.siteDir === siteDir)) return rows;
  const next = [...rows, { siteDir, createdAt: new Date().toISOString(), origin: normalizeOrigin(origin) }];
  writeTrackedProjects(projectsPath, next);
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
  writeTrackedProjects(projectsPath, rows);
  return rows;
}

/**
 * Seed `devFallbackDir` as the operator's first tracked project, but only on a TRULY fresh install
 * — the projects file has never been written at all. Deliberately checked by file EXISTENCE, not by
 * an empty tracked list: `trackProject`/`untrackProject` both call `writeTrackedProjects`
 * unconditionally, so an operator who has tracked and later removed every project still has a
 * projects file on disk (holding `{projects: []}`), and must never be re-seeded against their will.
 * A brand-new `userData` has no file at all — that is the one state this seeds into.
 *
 * `classifySiteDir` is injected rather than required directly (`site-dir-store.cjs`) so this
 * deliberately dependency-light module (see this file's header) stays decoupled from it, and so
 * callers can test the seeding decision without a real directory on disk.
 *
 * @returns whether a row was seeded.
 * @complexity O(1) beyond `classifySiteDir`'s and `trackProject`'s own cost.
 */
function seedDevFallbackProject(projectsPath, devFallbackDir, classifySiteDir) {
  if (fs.existsSync(projectsPath)) return false;
  if (classifySiteDir(devFallbackDir) !== "site") return false;
  // ALWAYS `adopted`, and stated rather than left to the default: this row points at a folder that
  // already held a site before this app ever ran — `<repo>/sites/tovu-com` in a checkout, someone's
  // real content. Deleting its card must never delete it.
  trackProject(projectsPath, devFallbackDir, PROJECT_ORIGIN.adopted);
  return true;
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
};
