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

/** @returns the tracked-projects file's path inside Electron's per-user `userData` directory. */
function projectsFilePath(userDataDir) {
  return path.join(userDataDir, PROJECTS_FILE_NAME);
}

/**
 * Read the tracked project list, treating any unreadable or malformed file as "nothing tracked yet".
 *
 * Deliberately forgiving, the same rule `site-dir-store.cjs`'s `readDesktopState` follows: this file
 * is a convenience list over sites that still exist for real on disk, not the sites themselves, so a
 * truncated or corrupt copy should read as empty rather than crash the Projects screen.
 *
 * @returns rows shaped `{siteDir, createdAt}`, oldest first.
 * @complexity O(n) in file size.
 */
function readTrackedProjects(projectsPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    const rows = Array.isArray(parsed?.projects) ? parsed.projects : [];
    return rows.filter((row) => typeof row?.siteDir === "string" && typeof row?.createdAt === "string");
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
 * the list unchanged rather than duplicating or bumping its row.
 *
 * @returns the new row list.
 * @complexity O(n) in the row count.
 */
function trackProject(projectsPath, siteDir) {
  const rows = readTrackedProjects(projectsPath);
  if (rows.some((row) => row.siteDir === siteDir)) return rows;
  const next = [...rows, { siteDir, createdAt: new Date().toISOString() }];
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

module.exports = {
  PROJECTS_FILE_NAME,
  projectsFilePath,
  readTrackedProjects,
  writeTrackedProjects,
  trackProject,
  untrackProject,
};
