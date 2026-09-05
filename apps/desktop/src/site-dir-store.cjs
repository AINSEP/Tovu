/**
 * @file Where the desktop app's site dir — and therefore its `content.db` — lives, and how a user
 * chooses it.
 *
 * This is the question packaging cannot start without. `tovu serve <dir>` already puts `content.db`,
 * `uploads/` and `themes/` inside the site dir, so the shape is right; nothing decided *which* dir a
 * shipped app should use. A hidden dir under `app.getPath('userData')` is invisible and awkward to
 * back up, so the answer here is the one Tovu-Runner arrived at: **a folder the user picks, plus a
 * most-recently-used list so they are asked exactly once.**
 *
 * Ported from Runner's `working-directory-store.ts` + its `dialog.showOpenDialog` picker, with one
 * deliberate deviation: Runner keeps its MRU in a `runner_recent_working_directories` table inside
 * the fleet registry's SQLite database. That database exists because Runner supervises N projects.
 * A single-site shell has no such database, and adding `@jini-ai/sqlite` + `better-sqlite3` to
 * `apps/desktop` to persist ten strings would buy a native dependency, an `electron-rebuild`
 * postinstall step and a second DB for nothing. The MRU is a JSON file in `userData` instead — same
 * solution, storage sized to the problem.
 *
 * No `electron` import, so all of it is testable under plain `node --test`; `main.cjs` supplies the
 * `userData` path and the native folder dialog.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn: nodeSpawn } = require("node:child_process");

const { resolveCliEntry, buildCliEnv, parseCliErrorLine } = require("./tovu-server.cjs");

/** Matches Runner's own quick-pick list length — an affordance, not a full history. */
const MAX_RECENT_SITE_DIRS = 10;

const STATE_FILE_NAME = "desktop-state.json";

/** Every Tovu site dir has one; `bootSiteDir` refuses a dir without it. */
const SITE_MARKER_FILE = "config.json";

/** Raised when the user dismisses the folder picker — a cancellation, not a failure to diagnose. */
class SiteDirSelectionCancelled extends Error {}

/** @returns the MRU file's path inside Electron's per-user `userData` directory. */
function stateFilePath(userDataDir) {
  return path.join(userDataDir, STATE_FILE_NAME);
}

/**
 * Read the persisted state, treating any unreadable or malformed file as "no state yet".
 *
 * Deliberately forgiving: this file holds a convenience list, and refusing to launch because a
 * cache got truncated would trade a real failure for a cosmetic one.
 *
 * @complexity O(n) in file size.
 */
function readDesktopState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const recent = Array.isArray(parsed?.recentSiteDirs) ? parsed.recentSiteDirs : [];
    return { recentSiteDirs: recent.filter((entry) => typeof entry === "string") };
  } catch {
    return { recentSiteDirs: [] };
  }
}

/** @complexity O(n) in the MRU length. */
function writeDesktopState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Move `dir` to the front of the MRU list, de-duplicated and capped.
 *
 * @returns the new list, most-recent first.
 * @complexity O(n) in the MRU length.
 */
function rememberSiteDir(statePath, dir) {
  const previous = readDesktopState(statePath).recentSiteDirs;
  const recentSiteDirs = [dir, ...previous.filter((entry) => entry !== dir)].slice(0, MAX_RECENT_SITE_DIRS);
  writeDesktopState(statePath, { recentSiteDirs });
  return recentSiteDirs;
}

/**
 * The remembered dirs that are still real Tovu sites on disk.
 *
 * Filtered on read rather than pruned on write, because a folder can be moved, renamed or deleted
 * while the app is not running — the list is a cache of the world, and the world is what decides.
 *
 * @complexity O(n) stat calls, bounded by {@link MAX_RECENT_SITE_DIRS}.
 */
function existingRecentSiteDirs(statePath) {
  return readDesktopState(statePath).recentSiteDirs.filter((dir) => classifySiteDir(dir) === "site");
}

/**
 * Decide what a chosen folder is, in `bootSiteDir`'s terms.
 *
 * @returns `"site"` (has a `config.json`, serve it), `"empty"` (absent or empty, `tovu init` can
 *   create a site here), or `"occupied"` (someone's real folder full of unrelated files — refuse,
 *   since `initSite` would throw `INIT_DIR_NOT_EMPTY` and serving would throw `SITE_DIR_INVALID`).
 * @complexity O(n) in the directory's entry count, and only for a non-site dir.
 */
function classifySiteDir(dir) {
  if (!fs.existsSync(dir)) return "empty";
  if (fs.existsSync(path.join(dir, SITE_MARKER_FILE))) return "site";
  return fs.readdirSync(dir).length === 0 ? "empty" : "occupied";
}

/**
 * Create a new site in `dir` by running Tovu's own `tovu init`.
 *
 * Uses the CLI rather than importing `initSite` for the same reason the rest of this shell shells
 * out: it keeps `apps/desktop` a consumer of a published contract instead of a second importer of
 * `apps/website`'s internals, so nothing under `apps/website/` has to change or stay stable for it.
 *
 * @throws {Error} carrying Tovu's own `tovu: <CODE>: <message>` line when init fails.
 * @complexity O(1) beyond `initSite`'s own cost.
 */
function initSiteDir(input) {
  const spawnFn = input.spawnFn ?? nodeSpawn;
  const args = [resolveCliEntry(input.repoRoot), "init", input.dir];
  if (input.name) args.push("--name", input.name);

  const child = spawnFn(process.execPath, args, {
    env: buildCliEnv(input.baseEnv),
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) return resolve(input.dir);
      const cliError = parseCliErrorLine(output);
      const detail = cliError === null ? output.trim() : `${cliError.code}: ${cliError.message}`;
      reject(new Error(`tovu init failed for ${input.dir}: ${detail}`));
    });
  });
}

/**
 * Turn a folder the user just picked into a servable site dir, creating one if the folder is empty.
 *
 * @throws {Error} when the folder holds unrelated files — refusing is the safe half of the
 *   `"occupied"` classification, since the alternative is writing a database into someone's
 *   Documents folder.
 * @complexity O(1) beyond `classifySiteDir` and, for an empty folder, `tovu init`.
 */
async function adoptSiteDir(input) {
  const kind = classifySiteDir(input.dir);
  if (kind === "occupied") {
    throw new Error(`${input.dir} is not a Tovu site and is not empty. Choose an empty folder to create a new site, or a folder that already contains a site (one with a ${SITE_MARKER_FILE}).`);
  }
  if (kind === "empty") {
    await initSiteDir({ repoRoot: input.repoRoot, dir: input.dir, name: input.name, baseEnv: input.baseEnv, spawnFn: input.spawnFn });
  }
  rememberSiteDir(input.statePath, input.dir);
  return input.dir;
}

/**
 * Decide which site dir this launch serves.
 *
 * Precedence, most explicit first:
 * 1. `TOVU_DESKTOP_SITE_DIR` — an operator override always wins, and is taken as given.
 * 2. The most recent remembered folder that is still a site — so the user is asked exactly once.
 * 3. `devFallbackDir` (`<repo>/sites/tovu-com` in a checkout), when it is a site. Correct for a
 *    developer, absent in a packaged app, which is why it cannot be the only answer.
 * 4. Ask, via `pickDir`. An empty folder becomes a new site; a folder of unrelated files is refused.
 *
 * @param input.pickDir async `() => string | null`; `null` means the user cancelled.
 * @throws {SiteDirSelectionCancelled} when the user dismisses the picker.
 * @complexity O(n) stat calls over the MRU, bounded by {@link MAX_RECENT_SITE_DIRS}.
 */
async function resolveSiteDir(input) {
  const envDir = input.envDir?.trim();
  if (envDir) return envDir;

  const [mostRecent] = existingRecentSiteDirs(input.statePath);
  if (mostRecent !== undefined) return mostRecent;

  if (input.devFallbackDir && classifySiteDir(input.devFallbackDir) === "site") {
    return input.devFallbackDir;
  }

  const picked = await input.pickDir();
  if (picked === null || picked === undefined) {
    throw new SiteDirSelectionCancelled("No site folder was chosen.");
  }
  return await adoptSiteDir({
    dir: picked,
    repoRoot: input.repoRoot,
    statePath: input.statePath,
    name: input.name,
    baseEnv: input.baseEnv,
    spawnFn: input.spawnFn,
  });
}

module.exports = {
  MAX_RECENT_SITE_DIRS,
  SITE_MARKER_FILE,
  STATE_FILE_NAME,
  SiteDirSelectionCancelled,
  stateFilePath,
  readDesktopState,
  writeDesktopState,
  rememberSiteDir,
  existingRecentSiteDirs,
  classifySiteDir,
  initSiteDir,
  adoptSiteDir,
  resolveSiteDir,
};
