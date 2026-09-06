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

const { buildCliSpawnPlan, buildCliEnv, parseCliErrorLine } = require("./tovu-server.cjs");

/** Matches Runner's own quick-pick list length — an affordance, not a full history. */
const MAX_RECENT_SITE_DIRS = 10;

const STATE_FILE_NAME = "desktop-state.json";

/**
 * Every Tovu site dir has both. `read-site-dir.ts:81-86` refuses a dir missing either one
 * unconditionally — `errors.ts`'s `SITE_DIR_INVALID` doc lists the two as alternatives ("config.json
 * or .site-meta.json"), but that names which file a given failure blames, not that either alone is
 * enough. `classifySiteDir` below used to check only `SITE_MARKER_FILE`, which was looser than the
 * server: a dir with `config.json` but no `.site-meta.json` classified as `"site"`, sailed past the
 * picker, and only died once `tovu serve` actually spawned — late, not silent, but later than it
 * needed to be. Fixed 2026-09-05.
 */
const SITE_MARKER_FILE = "config.json";
const SITE_META_FILE = ".site-meta.json";

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
 * Which of the two required marker files are absent from `dir`. Only meaningful when `dir` exists
 * — callers check that first — and empty when both are present.
 *
 * @returns a subset of `[SITE_MARKER_FILE, SITE_META_FILE]`, in that fixed order.
 * @complexity O(1) — two `fs.existsSync` calls.
 */
function missingSiteMarkers(dir) {
  const missing = [];
  if (!fs.existsSync(path.join(dir, SITE_MARKER_FILE))) missing.push(SITE_MARKER_FILE);
  if (!fs.existsSync(path.join(dir, SITE_META_FILE))) missing.push(SITE_META_FILE);
  return missing;
}

/**
 * Decide what a chosen folder is, in `bootSiteDir`'s terms.
 *
 * @returns `"site"` (has both `config.json` and `.site-meta.json` — `read-site-dir.ts:81-86`'s exact
 *   contract, serve it), `"incomplete"` (has exactly one of the two — a half-initialized or
 *   half-corrupted site, distinct from both a fresh folder and a real site), `"empty"` (absent or
 *   empty, `tovu init` can create a site here), or `"occupied"` (someone's real folder full of
 *   unrelated files — refuse, since `initSite` would throw `INIT_DIR_NOT_EMPTY` and serving would
 *   throw `SITE_DIR_INVALID`).
 * @complexity O(n) in the directory's entry count, and only for a non-site, non-incomplete dir.
 */
function classifySiteDir(dir) {
  if (!fs.existsSync(dir)) return "empty";
  const missing = missingSiteMarkers(dir);
  if (missing.length === 0) return "site";
  if (missing.length === 1) return "incomplete";
  return fs.readdirSync(dir).length === 0 ? "empty" : "occupied";
}

/**
 * Create a new site in `dir` by running Tovu's own `tovu init`.
 *
 * Uses the CLI rather than importing `initSite` for the same reason the rest of this shell shells
 * out: it keeps `apps/desktop` a consumer of a published contract instead of a second importer of
 * `apps/website`'s internals, so nothing under `apps/website/` has to change or stay stable for it.
 *
 * `buildCliEnv` is given `input.dir` as its site dir — NOT optional here, unlike that function's own
 * signature. `tovu init`'s import chain reaches the same module-load-time `createApp()` `tovu
 * serve` does (see `buildCliEnv`'s own doc: `program.ts` statically imports `init.js` and `serve.js`
 * both, unconditionally), so an empty `TOVU_SITE_DIR` here crashes `init` exactly the way it used to
 * crash `serve` before that fix existed — confirmed live, 2026-09-05, from a cwd with no
 * `sites/tovu-com` (own-server mode's actual cwd): "Open Site…"/"Open Recent" onto an empty folder
 * calls this function, and used to die with an uncaught `TypeError` before `runInitCommand` ran.
 *
 * @param input.cliMode `"source"` or `"compiled"` — see `tovu-server.cjs`'s `buildCliSpawnPlan`;
 *   defaults to `"compiled"` when omitted (unchanged prior behavior for any existing caller).
 * @throws {Error} carrying Tovu's own `tovu: <CODE>: <message>` line when init fails.
 * @complexity O(1) beyond `initSite`'s own cost.
 */
function initSiteDir(input) {
  const spawnFn = input.spawnFn ?? nodeSpawn;
  const cliArgs = ["init", input.dir];
  if (input.name) cliArgs.push("--name", input.name);
  const plan = buildCliSpawnPlan({ repoRoot: input.repoRoot, cliMode: input.cliMode, cliArgs });

  const child = spawnFn(plan.command, plan.args, {
    env: buildCliEnv(input.baseEnv, input.dir),
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
 * @throws {Error} when the folder holds unrelated files (`"occupied"`) — refusing is the safe half
 *   of that classification, since the alternative is writing a database into someone's Documents
 *   folder — or when it is a half-initialized site (`"incomplete"`): naming it here rather than
 *   letting it through is the same reasoning that fixed `classifySiteDir`'s own gap (see that
 *   constant's doc) — a folder this function silently accepted as-is would only fail once the
 *   spawned `tovu serve` child died, not here where the reason is still in hand.
 * @complexity O(1) beyond `classifySiteDir` and, for an empty folder, `tovu init`.
 */
async function adoptSiteDir(input) {
  const kind = classifySiteDir(input.dir);
  if (kind === "occupied") {
    throw new Error(`${input.dir} is not a Tovu site and is not empty. Choose an empty folder to create a new site, or a folder that already contains a site (one with a ${SITE_MARKER_FILE} and a ${SITE_META_FILE}).`);
  }
  if (kind === "incomplete") {
    const missing = missingSiteMarkers(input.dir).join(" and ");
    throw new Error(`${input.dir} is missing ${missing} — it looks like a half-initialized site, not a complete one. Choose a different folder.`);
  }
  if (kind === "empty") {
    await initSiteDir({ repoRoot: input.repoRoot, dir: input.dir, name: input.name, baseEnv: input.baseEnv, spawnFn: input.spawnFn, cliMode: input.cliMode });
  }
  rememberSiteDir(input.statePath, input.dir);
  return input.dir;
}

/**
 * Classify `devFallbackDir` (step 3 of {@link resolveSiteDir}'s precedence) — split out so that
 * function's own branching stays under the complexity gate. A `null` `devFallbackDir` (the packaged
 * case, which never sets one) is the common early-out.
 *
 * @returns `{ useDir, rejected }` — never `null` itself (so callers never need optional chaining,
 *   which the complexity gate counts as its own branch), with exactly one of the two fields set:
 *   `useDir` when the fallback is itself a real site, ready to use directly; `rejected` — the exact
 *   `{ dir, kind, missing? }` shape `resolveSiteDir`'s own doc describes — naming why it was turned
 *   down, including the "nothing to try" case (`devFallbackDir` absent), which reports `rejected:
 *   null` rather than a fabricated reason.
 * @complexity O(1) beyond `classifySiteDir`'s own cost.
 */
function resolveDevFallback(devFallbackDir) {
  if (!devFallbackDir) return { useDir: null, rejected: null };
  const kind = classifySiteDir(devFallbackDir);
  if (kind === "site") return { useDir: devFallbackDir, rejected: null };
  const rejected = { dir: devFallbackDir, kind };
  if (kind === "incomplete" || kind === "occupied") {
    rejected.missing = missingSiteMarkers(devFallbackDir);
  }
  return { useDir: null, rejected };
}

/**
 * Decide which site dir this launch serves.
 *
 * Precedence, most explicit first:
 * 1. `TOVU_DESKTOP_SITE_DIR` — an operator override always wins, and is taken as given.
 * 2. The most recent remembered folder that is still a site — so the user is asked exactly once.
 * 3. `devFallbackDir` (`<repo>/sites/tovu-com` in a checkout), when it is a site. Correct for a
 *    developer, absent in a packaged app, which is why it cannot be the only answer. See
 *    {@link resolveDevFallback}.
 * 4. Ask, via `pickDir`. An empty folder becomes a new site; a folder of unrelated files is refused.
 *
 * @param input.pickDir async `(rejectedDefault) => string | null`; `null` means the user
 *   cancelled. `rejectedDefault` is `null` when there was nothing to try (no `devFallbackDir`, or a
 *   packaged app that never sets one), else `{ dir, kind, missing? }` naming the candidate step 3
 *   just turned down, `classifySiteDir`'s verdict on it (`"empty"`, `"incomplete"`, or `"occupied"`),
 *   and — for `"incomplete"`/`"occupied"` — exactly which marker file(s) it lacks, so the picker can
 *   say *why* it's asking instead of just asking.
 * @param input.cliMode `"source"` or `"compiled"` — threaded through to `initSiteDir` via
 *   `adoptSiteDir` when the picked folder is empty; see `tovu-server.cjs`'s `buildCliSpawnPlan`.
 * @throws {SiteDirSelectionCancelled} when the user dismisses the picker.
 * @complexity O(n) stat calls over the MRU, bounded by {@link MAX_RECENT_SITE_DIRS}.
 */
async function resolveSiteDir(input) {
  const envDir = input.envDir?.trim();
  if (envDir) return envDir;

  const [mostRecent] = existingRecentSiteDirs(input.statePath);
  if (mostRecent !== undefined) return mostRecent;

  const fallback = resolveDevFallback(input.devFallbackDir);
  if (fallback.useDir) return fallback.useDir;

  const picked = await input.pickDir(fallback.rejected);
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
    cliMode: input.cliMode,
  });
}

module.exports = {
  MAX_RECENT_SITE_DIRS,
  SITE_MARKER_FILE,
  SITE_META_FILE,
  STATE_FILE_NAME,
  SiteDirSelectionCancelled,
  stateFilePath,
  readDesktopState,
  writeDesktopState,
  rememberSiteDir,
  existingRecentSiteDirs,
  classifySiteDir,
  resolveDevFallback,
  initSiteDir,
  adoptSiteDir,
  resolveSiteDir,
};
