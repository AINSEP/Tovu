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
 * No `electron` import, so all of it is testable under plain `node --test`; `main.ts` supplies the
 * `userData` path and the native folder dialog.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import type { Readable } from "node:stream";

import { buildCliSpawnPlan, buildCliEnv, parseCliErrorLine } from "./tovu-server.ts";
import { readJsonFile, quarantineUnreadableFile, withFileLock, writeJsonFileAtomic } from "./durable-json-file.ts";
import type { QuarantineNotice } from "./durable-json-file.ts";

/** Matches Runner's own quick-pick list length — an affordance, not a full history. */
const MAX_RECENT_SITE_DIRS = 10;

const STATE_FILE_NAME = "desktop-state.json";

/** How a damaged MRU file is announced on stderr — see {@link rememberSiteDir} for why starting the
 *  list over is the right answer for this file and the wrong one for `tracked-sites.ts`'. */
const RECENT_SITES_QUARANTINE_NOTICE: QuarantineNotice = {
  label: "recent-sites list",
  consequence: "the recently opened sites it listed are only in that copy now.",
};

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

/** `classifySiteDir`'s four possible verdicts. See that function's own doc. */
type SiteClassification = "site" | "incomplete" | "empty" | "occupied";

/** `"source"` or `"compiled"` — see `tovu-server.ts`'s `buildCliSpawnPlan`. */
type CliMode = "source" | "compiled";

/**
 * The subset of Node's `ChildProcess` surface {@link initSiteDir} touches — narrower than
 * `tovu-server.ts`'s own `SpawnedChild`, since this caller never kills or polls the child, only
 * reads its output and waits for one `exit`.
 */
interface InitChildLike {
  stdout: Readable;
  stderr: Readable;
  once(event: "exit", listener: (code: number | null) => void): void;
  once(event: "error", listener: (error: Error) => void): void;
}

/** Injectable `child_process.spawn` for {@link initSiteDir} — the test seam. */
type InitSpawnFn = (command: string, args: string[], options: SpawnOptions) => InitChildLike;

/** @returns the MRU file's path inside Electron's per-user `userData` directory. */
function stateFilePath(userDataDir: string): string {
  return path.join(userDataDir, STATE_FILE_NAME);
}

/** The persisted MRU shape — the only thing {@link readDesktopState} ever returns. */
interface DesktopState {
  recentSiteDirs: string[];
}

/** {@link readRecentSiteDirs}' answer: the list, plus whether the file it came from is damaged. */
interface RecentSiteDirsRead extends DesktopState {
  damaged: boolean;
}

/**
 * Read the persisted state, treating any unreadable or malformed file as "no state yet".
 *
 * Deliberately forgiving: this file holds a convenience list, and refusing to launch because a
 * cache got truncated would trade a real failure for a cosmetic one. Unlike
 * `tracked-sites.ts`, nothing here is salvaged out of a damaged file: every dir this list holds is
 * either already a tracked project or one folder-pick away, so recovering the cache would buy back
 * the ordering of a menu, not anything the operator made.
 *
 * @complexity O(n) in file size.
 */
function readDesktopState(statePath: string): DesktopState {
  const { recentSiteDirs } = readRecentSiteDirs(statePath);
  return { recentSiteDirs };
}

/**
 * {@link readDesktopState} plus the one fact a WRITER also needs: whether the file it is about to
 * replace is damaged, and therefore must be moved aside rather than written over.
 *
 * @complexity O(n) in file size.
 */
function readRecentSiteDirs(statePath: string): RecentSiteDirsRead {
  const read = readJsonFile(statePath);
  if (read.state === "missing") return { recentSiteDirs: [], damaged: false };
  const recent = (read.state === "ok" ? read.value : null) as { recentSiteDirs?: unknown } | null;
  if (!Array.isArray(recent?.recentSiteDirs)) return { recentSiteDirs: [], damaged: true };
  return { recentSiteDirs: recent.recentSiteDirs.filter((entry): entry is string => typeof entry === "string"), damaged: false };
}

/**
 * Replace the persisted state, atomically — a crash partway through leaves the previous file whole
 * rather than a torn one that the next launch would read as an empty list and then persist as that
 * (`durable-json-file.ts`, and `tracked-sites.ts`'s header for the full shape of that bug).
 *
 * A whole-value replace, so it takes no lock of its own; a caller that first READS this file holds
 * the lock across both halves — see {@link rememberSiteDir}, the only one there is.
 * @complexity O(n) in the MRU length.
 */
function writeDesktopState(statePath: string, state: DesktopState): void {
  writeJsonFileAtomic(statePath, state);
}

/**
 * Move `dir` to the front of the MRU list, de-duplicated and capped.
 *
 * Runs inside the cross-process lock for this file, because several instances can be opening sites
 * at once (the owner runs them on purpose) and two unlocked read-modify-writes lose whichever list
 * was read before the other was written. One list shared by every window is the point of it: "Open
 * Recent" should show what the operator opened, in whichever window they opened it.
 *
 * A damaged file is moved aside first, and the list starts over from this one dir — the policy that
 * fits a cache, and deliberately NOT `tracked-sites.ts`'s, which recovers what it can because its
 * file is the operator's own work. If it cannot be moved aside, nothing is written over it and the
 * dir is simply not remembered: this runs after a site has already been created or opened, and
 * failing that whole operation over an unwritable cache would be the cosmetic failure taking down
 * the real one.
 *
 * @returns the new list, most-recent first — what was persisted, or what would have been.
 * @complexity O(n) in the MRU length, plus the lock wait.
 */
function rememberSiteDir(statePath: string, dir: string): string[] {
  return withFileLock(statePath, () => {
    const previous = readRecentSiteDirs(statePath);
    const recentSiteDirs = [dir, ...previous.recentSiteDirs.filter((entry) => entry !== dir)].slice(0, MAX_RECENT_SITE_DIRS);
    if (previous.damaged && !quarantineUnreadableFile(statePath, RECENT_SITES_QUARANTINE_NOTICE)) return recentSiteDirs;
    writeDesktopState(statePath, { recentSiteDirs });
    return recentSiteDirs;
  });
}

/**
 * The remembered dirs that are still real Tovu sites on disk.
 *
 * Filtered on read rather than pruned on write, because a folder can be moved, renamed or deleted
 * while the app is not running — the list is a cache of the world, and the world is what decides.
 *
 * @complexity O(n) stat calls, bounded by {@link MAX_RECENT_SITE_DIRS}.
 */
function existingRecentSiteDirs(statePath: string): string[] {
  return readDesktopState(statePath).recentSiteDirs.filter((dir) => classifySiteDirSafely(dir) === "site");
}

/**
 * Which of the two required marker files are absent from `dir`. Only meaningful when `dir` exists
 * — callers check that first — and empty when both are present.
 *
 * @returns a subset of `[SITE_MARKER_FILE, SITE_META_FILE]`, in that fixed order.
 * @complexity O(1) — two `fs.existsSync` calls.
 */
function missingSiteMarkers(dir: string): string[] {
  const missing: string[] = [];
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
function classifySiteDir(dir: string): SiteClassification {
  if (!fs.existsSync(dir)) return "empty";
  const missing = missingSiteMarkers(dir);
  if (missing.length === 0) return "site";
  if (missing.length === 1) return "incomplete";
  return fs.readdirSync(dir).length === 0 ? "empty" : "occupied";
}

/**
 * {@link classifySiteDir}'s answer, or `"unreadable"` in place of the throw — the classifier as a
 * BULK-SCAN predicate rather than as an operator-picked-folder verdict.
 *
 * D-01, and the reason both forms exist. `classifySiteDir` was written for one folder the operator
 * chose in a dialog, where throwing is exactly right: the picker catches it and shows them why
 * their folder cannot be used. It was then reused, unchanged, as the filter predicate of two bulk
 * scans ({@link existingRecentSiteDirs} and `tracked-sites.ts`'s `discoverSiteDirs`) — and a
 * predicate that throws turns "one candidate out of forty is unreadable" into "the whole list
 * fails". Both scans run inside `main.ts`'s `app.whenReady()` chain, whose only handler is
 * `reportBootFailure`, and both run BEFORE any window is opened: one plain file where a remembered
 * site dir used to be, or one EACCES directory under `<repo>/sites`, showed the operator a dialog
 * and quit — with no way to fix it from inside the app, since the Rescan button never got a
 * renderer to live in.
 *
 * So this is the deliberate split rather than a change of contract: the picker path keeps the
 * throw, and every list filter asks this instead. Callers that filter to `"site"` reject
 * `"unreadable"` for free; callers that report a rejection (`resolveDevFallback`) name it.
 *
 * @returns {@link classifySiteDir}'s own values, plus `"unreadable"` when the directory cannot be
 *   examined at all — EACCES on an unreadable directory, ENOTDIR where a file has replaced one,
 *   ELOOP on a symlink cycle.
 * @complexity same as {@link classifySiteDir}.
 */
function classifySiteDirSafely(dir: string): SiteClassification | "unreadable" {
  try {
    return classifySiteDir(dir);
  } catch {
    return "unreadable";
  }
}

/** Input to {@link initSiteDir}. */
interface InitSiteDirInput {
  repoRoot: string;
  dir: string;
  name?: string;
  baseEnv?: NodeJS.ProcessEnv;
  spawnFn?: InitSpawnFn;
  cliMode?: CliMode;
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
 * @param input.cliMode `"source"` or `"compiled"` — see `tovu-server.ts`'s `buildCliSpawnPlan`;
 *   defaults to `"compiled"` when omitted (unchanged prior behavior for any existing caller).
 * @throws {Error} carrying Tovu's own `tovu: <CODE>: <message>` line when init fails.
 * @complexity O(1) beyond `initSite`'s own cost.
 */
function initSiteDir(input: InitSiteDirInput): Promise<string> {
  const spawnFn = input.spawnFn ?? nodeSpawn as InitSpawnFn;
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

/** `"init"` or `"fail"` — see {@link resolveOrInitSiteDir}'s own param doc. */
type OnMissingSite = "init" | "fail";

/** Input to {@link resolveOrInitSiteDir}. `repoRoot` is only actually required on the "empty" + "init" path. */
interface ResolveOrInitSiteDirInput {
  dir: string;
  onMissingSite: OnMissingSite;
  repoRoot?: string;
  name?: string;
  baseEnv?: NodeJS.ProcessEnv;
  spawnFn?: InitSpawnFn;
  cliMode?: CliMode;
}

/**
 * THE single chokepoint through which any folder becomes a servable site dir, or is refused with a
 * specific reason. Every entry point that turns an operator-named folder into a site dir — the
 * picker, "+ Create website", an env-var override — must call this rather than re-deciding for
 * itself, so the four kinds {@link classifySiteDir} distinguishes are handled identically everywhere.
 * The ONLY thing allowed to vary between call sites is `onMissingSite`, declared explicitly by each
 * one — never an accident of which branch happened to run. This is what closed the bug where the
 * picker initialized an empty folder correctly but the env-var arms handed the same empty folder
 * straight to `tovu serve`, which does not know how to create a site and dies confusingly.
 *
 * `"occupied"` and `"incomplete"` always refuse, regardless of `onMissingSite` — neither is a
 * *missing* site for the policy to have an opinion about: `"occupied"` is the WRONG folder (someone's
 * real, unrelated files) and `"incomplete"` is a corrupt/half-written one. Auto-repairing either would
 * risk data loss no policy should paper over silently.
 *
 * @param input.onMissingSite `"init"` — an EMPTY folder is a real answer to "start a new site here";
 *   run `tovu init` and return `dir`, same as {@link classifySiteDir}'s own doc on `"empty"`.
 *   `"fail"` — refuse an empty folder with a specific, informative error instead of creating anything
 *   there; for a call site that treats `dir` as a claim the site already exists (`resolveSiteDir`'s
 *   own doc: an operator override is "taken as given") rather than an invitation to create one.
 * @throws {Error} naming the exact reason: occupied, incomplete (naming which marker file(s) are
 *   missing), or — under `"fail"` only — empty.
 * @complexity O(1) beyond `classifySiteDir`'s and, for `"init"` on an empty dir, `initSiteDir`'s own cost.
 */
async function resolveOrInitSiteDir(input: ResolveOrInitSiteDirInput): Promise<string> {
  const kind = classifySiteDir(input.dir);
  if (kind === "occupied") {
    throw new Error(`${input.dir} is not a Tovu site and is not empty. Choose an empty folder to create a new site, or a folder that already contains a site (one with a ${SITE_MARKER_FILE} and a ${SITE_META_FILE}).`);
  }
  if (kind === "incomplete") {
    const missing = missingSiteMarkers(input.dir).join(" and ");
    throw new Error(`${input.dir} is missing ${missing} — it looks like a half-initialized site, not a complete one. Choose a different folder.`);
  }
  if (kind === "empty") {
    if (input.onMissingSite === "fail") {
      throw new Error(
        `${input.dir} has no Tovu site in it yet (no ${SITE_MARKER_FILE}/${SITE_META_FILE}). This folder was named directly rather than picked interactively, so Tovu will not create a site there automatically — point it at an existing site's folder, or use "Open Site…" to create a new one there yourself.`,
      );
    }
    // `repoRoot` is required by `initSiteDir` itself; every real caller on the "init" path supplies
    // one (the picker and "+ Create website" always know the repo root), so this is a non-null
    // assertion on an already-existing contract rather than a new one.
    await initSiteDir({ repoRoot: input.repoRoot!, dir: input.dir, name: input.name, baseEnv: input.baseEnv, spawnFn: input.spawnFn, cliMode: input.cliMode });
  }
  return input.dir;
}

/** Input to {@link adoptSiteDir}. */
interface AdoptSiteDirInput {
  dir: string;
  statePath: string;
  repoRoot?: string;
  name?: string;
  baseEnv?: NodeJS.ProcessEnv;
  spawnFn?: InitSpawnFn;
  cliMode?: CliMode;
}

/**
 * Turn a folder the user just picked into a servable site dir, creating one if the folder is empty.
 * A thin, fixed-policy wrapper over {@link resolveOrInitSiteDir} (`onMissingSite: "init"`) — the
 * picker's and "+ Create website"'s own semantics: an empty folder IS a legitimate answer to "start a
 * new site here" when a person just chose it — plus remembering the result in the MRU, which is a
 * picker-specific concern {@link resolveOrInitSiteDir} itself has no opinion about.
 *
 * @throws {Error} see {@link resolveOrInitSiteDir}.
 * @complexity O(1) beyond {@link resolveOrInitSiteDir}'s own cost.
 */
async function adoptSiteDir(input: AdoptSiteDirInput): Promise<string> {
  await resolveOrInitSiteDir({ ...input, onMissingSite: "init" });
  rememberSiteDir(input.statePath, input.dir);
  return input.dir;
}

/** What {@link resolveDevFallback} rejected, and why — `resolveSiteDir`'s own `pickDir` param doc. */
interface RejectedDevFallback {
  dir: string;
  kind: SiteClassification | "unreadable";
  missing?: string[];
}

/** What {@link resolveDevFallback} returns: exactly one of the two fields is set. */
interface ResolveDevFallbackResult {
  useDir: string | null;
  rejected: RejectedDevFallback | null;
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
function resolveDevFallback(devFallbackDir: string | null | undefined): ResolveDevFallbackResult {
  if (!devFallbackDir) return { useDir: null, rejected: null };
  // Safely: a candidate NOBODY picked must be turned down, never allowed to take the launch with
  // it. `resolveStartupSiteDirs` runs this inside the `whenReady()` chain (D-01).
  const kind = classifySiteDirSafely(devFallbackDir);
  if (kind === "site") return { useDir: devFallbackDir, rejected: null };
  const rejected: RejectedDevFallback = { dir: devFallbackDir, kind };
  if (kind === "incomplete" || kind === "occupied") {
    rejected.missing = missingSiteMarkers(devFallbackDir);
  }
  return { useDir: null, rejected };
}

/** `resolveSiteDir`'s own picker seam — see that function's param doc. */
type PickDirFn = (rejectedDefault: RejectedDevFallback | null) => string | null | undefined | Promise<string | null | undefined>;

/** Input to {@link resolveSiteDir}. */
interface ResolveSiteDirInput {
  envDir?: string;
  onMissingSite?: OnMissingSite;
  statePath: string;
  devFallbackDir?: string | null;
  repoRoot?: string;
  name?: string;
  baseEnv?: NodeJS.ProcessEnv;
  spawnFn?: InitSpawnFn;
  cliMode?: CliMode;
  pickDir?: PickDirFn;
}

/**
 * Decide which site dir this launch serves.
 *
 * Precedence, most explicit first:
 * 1. `TOVU_DESKTOP_SITE_DIR` — an operator override always wins. Routed through
 *    {@link resolveOrInitSiteDir} like every other entry point, under whichever `onMissingSite`
 *    policy `input.onMissingSite` declares for this one — see this function's own param doc for why
 *    that is `"fail"` in production, not `"init"`.
 * 2. The most recent remembered folder that is still a site — so the user is asked exactly once.
 * 3. `devFallbackDir` (`<repo>/sites/tovu-com` in a checkout), when it is a site. Correct for a
 *    developer, absent in a packaged app, which is why it cannot be the only answer. See
 *    {@link resolveDevFallback}.
 * 4. Ask, via `pickDir`. An empty folder becomes a new site; a folder of unrelated files is refused.
 *
 * @param input.onMissingSite Required — the policy step 1 declares for its OWN branch only; steps
 *   2-3 never reach an empty/incomplete/occupied dir at all (each already filters to `"site"` before
 *   returning), and step 4 (the picker) always uses `"init"` via `adoptSiteDir`. Required rather than
 *   defaulted so a call site cannot skip declaring it — the whole point of routing this branch through
 *   {@link resolveOrInitSiteDir} at all.
 * @param input.pickDir async `(rejectedDefault) => string | null`; `null` means the user
 *   cancelled. `rejectedDefault` is `null` when there was nothing to try (no `devFallbackDir`, or a
 *   packaged app that never sets one), else `{ dir, kind, missing? }` naming the candidate step 3
 *   just turned down, `classifySiteDir`'s verdict on it (`"empty"`, `"incomplete"`, or `"occupied"`),
 *   and — for `"incomplete"`/`"occupied"` — exactly which marker file(s) it lacks, so the picker can
 *   say *why* it's asking instead of just asking.
 * @param input.cliMode `"source"` or `"compiled"` — threaded through to `initSiteDir` via
 *   `adoptSiteDir` when the picked folder is empty; see `tovu-server.ts`'s `buildCliSpawnPlan`.
 * @throws {SiteDirSelectionCancelled} when the user dismisses the picker.
 * @throws {Error} see {@link resolveOrInitSiteDir} — when `envDir` is set but is not a usable site
 *   under the declared `onMissingSite` policy.
 * @complexity O(n) stat calls over the MRU, bounded by {@link MAX_RECENT_SITE_DIRS}.
 */
async function resolveSiteDir(input: ResolveSiteDirInput): Promise<string> {
  const envDir = input.envDir?.trim();
  if (envDir) {
    if (input.onMissingSite !== "init" && input.onMissingSite !== "fail") {
      throw new Error('resolveSiteDir: input.onMissingSite must be "init" or "fail" when envDir is set.');
    }
    return await resolveOrInitSiteDir({
      dir: envDir,
      onMissingSite: input.onMissingSite,
      repoRoot: input.repoRoot,
      name: input.name,
      baseEnv: input.baseEnv,
      spawnFn: input.spawnFn,
      cliMode: input.cliMode,
    });
  }

  const [mostRecent] = existingRecentSiteDirs(input.statePath);
  if (mostRecent !== undefined) return mostRecent;

  const fallback = resolveDevFallback(input.devFallbackDir);
  if (fallback.useDir) return fallback.useDir;

  const picked = await input.pickDir!(fallback.rejected);
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

export {
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
  classifySiteDirSafely,
  resolveDevFallback,
  initSiteDir,
  resolveOrInitSiteDir,
  adoptSiteDir,
  resolveSiteDir,
};
export type { RejectedDevFallback };
