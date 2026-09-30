/**
 * @file The "Move Tovu to your Applications folder?" prompt a packaged macOS copy shows once when it
 * is launched from anywhere else (a disk image, Downloads). Every rule lives here as a pure function
 * or an injected-deps flow; `main.ts` only supplies Electron's calls.
 *
 * Why it matters: a copy run from its disk image cannot update itself (Squirrel cannot replace a
 * read-only bundle) and keeps the image busy so it cannot be ejected — see `isTransientAppPath` in
 * `sites-mcp-registration.ts` for the paths that stops this app from persisting.
 *
 * **Several copies at once.** The app has no single-instance lock (the owner runs several). The
 * prompt is not offered while another copy is open (`instance-presence.ts` records): moving a bundle
 * out of, say, Downloads would pull it from under a sibling running from the same place, and two
 * copies prompting at once would race to the same `/Applications/Tovu.app`. It comes back on a later
 * launch that is alone. Presence records are written by the auto-updater, which every packaged macOS
 * launch runs unless `TOVU_DESKTOP_DISABLE_UPDATER=1`.
 *
 * **Strings.** `main.ts` has no i18n layer — every native dialog there is an English literal — so
 * the prompt's strings are English too, gathered in {@link MOVE_PROMPT} so a later locale layer has
 * one place to replace.
 *
 * No `electron` import, so it runs under plain `node --test`.
 */
import fs from "node:fs";
import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "./durable-json-file.ts";

/** Every string the prompt and its outcomes show. */
const MOVE_PROMPT = {
  message: "Move Tovu to your Applications folder?",
  detail: "Tovu works best from Applications — it can update itself and your disk image can be ejected.",
  moveButton: "Move to Applications",
  notNowButton: "Not Now",
  moveFailed: "Tovu could not be moved to Applications. It will keep running from here.",
  olderCopyRunning: "An older Tovu is open from Applications. Quit it, then open this copy again to replace it.",
  openingNewer: "A newer Tovu is already in Applications. Opening that one instead.",
} as const;

/** {@link movePromptSkipReason}'s input: everything about this launch that decides whether to ask. */
interface MovePromptEnvironment {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  /** Electron's `process.mas`: a Mac App Store build, which the Store installs and must not move. */
  isMas: boolean;
  /** `TOVU_DESKTOP_SELFTEST=1`: headless, nobody to answer. */
  selftest: boolean;
  /** Launched to open a named site (`TOVU_DESKTOP_SITE_DIR(S)`): a script, not a person. */
  unattended: boolean;
  /** `app.isInApplicationsFolder()` — `/Applications` or `~/Applications`. */
  inApplications: boolean;
  /** Live copies of this app other than this one. */
  otherInstancesOpen: number;
  currentVersion: string;
  /** The version "Not Now" was last chosen on, or `null`. */
  declinedVersion: string | null;
}

/**
 * @returns why this launch must NOT offer the move, or `null` when it should.
 *
 * "Not Now" silences it for that version only: an update is a natural moment to ask again, and a
 * copy still outside Applications after an update is exactly the copy that could not update itself.
 * @complexity O(1).
 */
function movePromptSkipReason(env: MovePromptEnvironment): string | null {
  const reasons: [boolean, string][] = [
    [!env.isPackaged, "not packaged (dev launch)"],
    [env.platform !== "darwin", "not macOS"],
    [env.isMas, "Mac App Store build"],
    [env.selftest, "self-test launch"],
    [env.unattended, "unattended site launch"],
    [env.inApplications, "already in Applications"],
    [env.otherInstancesOpen > 0, "another copy of Tovu is open"],
    [env.declinedVersion === env.currentVersion, "declined for this version"],
  ];
  return reasons.find(([applies]) => applies)?.[1] ?? null;
}

/** `<userData>/move-to-applications.json`. @complexity O(1). */
function moveDeclineFilePath(userDataDir: string): string {
  return path.join(userDataDir, "move-to-applications.json");
}

/** @returns the version "Not Now" was chosen on; `null` if never, or the file is unusable.
 *  @complexity O(n) in file size. */
function readDeclinedVersion(filePath: string): string | null {
  const read = readJsonFile(filePath);
  if (read.state !== "ok") return null;
  const version = (read.value as { declinedVersion?: unknown } | null)?.declinedVersion;
  return typeof version === "string" ? version : null;
}

/** Records "Not Now" for `version`, replacing any earlier one. @complexity O(1). */
function recordDeclinedVersion(filePath: string, version: string): void {
  writeJsonFileAtomic(filePath, { declinedVersion: version });
}

/** @returns the `.app` bundle holding `execPath` (`…/X.app/Contents/MacOS/X`), or `null`.
 *  @complexity O(n) in the path length. */
function bundlePathFromExecPath(execPath: string): string | null {
  return /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)?.[1] ?? null;
}

/** Where `app.moveToApplicationsFolder()` puts the bundle: `/Applications/<its name>`. @complexity O(1). */
function applicationsTargetPath(bundlePath: string): string {
  return path.join("/Applications", path.basename(bundlePath));
}

/** @returns a bundle's `CFBundleShortVersionString` from its XML `Info.plist` (what electron-builder
 *  writes), or `null` when it cannot be read. @complexity O(n) in the plist's size. */
function readBundleVersion(bundlePath: string): string | null {
  try {
    const plist = fs.readFileSync(path.join(bundlePath, "Contents", "Info.plist"), "utf8");
    return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** The dotted numeric part of a version (`0.2.0-beta.1` → `[0, 2, 0]`), or `null`. @complexity O(n). */
function numericParts(version: string | null): number[] | null {
  const core = /^(\d+(?:\.\d+)*)/.exec(version ?? "")?.[1];
  return core === undefined ? null : core.split(".").map(Number);
}

/**
 * Compares two dotted numeric versions, missing parts reading as 0. Pre-release tags are ignored.
 * @returns 1, 0 or -1; `null` when either is not a version.
 * @complexity O(n) in the number of parts.
 */
function compareVersions(a: string | null, b: string | null): number | null {
  const left = numericParts(a);
  const right = numericParts(b);
  if (left === null || right === null) return null;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** Electron's `conflictHandler` argument. */
type MoveConflictType = "exists" | "existsAndRunning";

/**
 * What to do when `/Applications` already holds a Tovu:
 *
 * - `"replace"` — an older, same, or unreadable copy that is not running. Electron moves it to the
 *   Trash (recoverable) and puts this one in its place.
 * - `"open-existing"` — the copy there is newer, or is running and at least as new: keep it and use
 *   it. Never downgrade the installed app.
 * - `"blocked-by-running-copy"` — an older (or unreadable) copy is running there. Replacing a running
 *   app pulls its bundle from under it, and Electron's own default would instead switch to that OLD
 *   copy and quit this newer one; neither is right, so this copy keeps running and says why.
 * @complexity O(1).
 */
function decideMoveConflict(input: { conflictType: MoveConflictType; existingVersion: string | null; currentVersion: string }): "replace" | "open-existing" | "blocked-by-running-copy" {
  const order = compareVersions(input.existingVersion, input.currentVersion);
  if (order === 1) return "open-existing";
  if (input.conflictType === "exists") return "replace";
  return order === 0 ? "open-existing" : "blocked-by-running-copy";
}

/** {@link runMoveToApplicationsPrompt}'s Electron seams. */
interface MovePromptDeps {
  currentVersion: string;
  /** {@link applicationsTargetPath} of this bundle. */
  targetPath: string;
  /** Shows the prompt. */
  ask: () => Promise<"move" | "not-now">;
  /** `app.moveToApplicationsFolder({ conflictHandler })`. On success Electron relaunches from the new
   *  location and quits this process itself. */
  move: (conflictHandler: (conflictType: MoveConflictType) => boolean) => boolean;
  readExistingVersion: (appPath: string) => string | null;
  openExisting: (appPath: string) => void;
  quit: () => void;
  recordDeclined: () => void;
  showError: (message: string) => void;
  /** Must block until dismissed: {@link afterRefusedMove} quits right after it. */
  showInfo: (message: string) => void;
}

type MovePromptOutcome = "declined" | "moved" | "opened-existing" | "blocked-by-running-copy" | "failed";

/**
 * The prompt, start to finish. A failed move never throws — it is reported and this copy keeps
 * running; only `recordDeclined` failing (an unwritable `userData`) propagates.
 * @complexity O(1) plus the injected calls.
 */
async function runMoveToApplicationsPrompt(deps: MovePromptDeps): Promise<MovePromptOutcome> {
  if ((await deps.ask()) === "not-now") {
    deps.recordDeclined();
    return "declined";
  }
  let decision: ReturnType<typeof decideMoveConflict> | null = null;
  const conflictHandler = (conflictType: MoveConflictType): boolean => {
    decision = decideMoveConflict({ conflictType, existingVersion: deps.readExistingVersion(deps.targetPath), currentVersion: deps.currentVersion });
    // `true` = Electron's own default: replace a stopped copy, or switch to a running one.
    return decision === "replace" || (decision === "open-existing" && conflictType === "existsAndRunning");
  };
  let moved: boolean;
  try {
    moved = deps.move(conflictHandler);
  } catch (error) {
    deps.showError(`${MOVE_PROMPT.moveFailed} ${(error as Error).message}`);
    return "failed";
  }
  return moved ? "moved" : afterRefusedMove(deps, decision);
}

/** A move that did not happen: open the newer copy, explain the running older one, or report it.
 *  @complexity O(1). */
function afterRefusedMove(deps: MovePromptDeps, decision: ReturnType<typeof decideMoveConflict> | null): MovePromptOutcome {
  if (decision === "open-existing") {
    deps.showInfo(MOVE_PROMPT.openingNewer);
    deps.openExisting(deps.targetPath);
    deps.quit();
    return "opened-existing";
  }
  if (decision === "blocked-by-running-copy") {
    deps.showError(MOVE_PROMPT.olderCopyRunning);
    return "blocked-by-running-copy";
  }
  deps.showError(MOVE_PROMPT.moveFailed);
  return "failed";
}

export {
  MOVE_PROMPT,
  applicationsTargetPath,
  bundlePathFromExecPath,
  compareVersions,
  decideMoveConflict,
  moveDeclineFilePath,
  movePromptSkipReason,
  readBundleVersion,
  readDeclinedVersion,
  recordDeclinedVersion,
  runMoveToApplicationsPrompt,
};
export type { MoveConflictType, MovePromptDeps, MovePromptEnvironment, MovePromptOutcome };
