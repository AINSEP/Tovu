/**
 * @file Behavioural proof for `move-to-applications.ts`: when the "Move to Applications" prompt is
 * offered at all, how "Not Now" is remembered, what a name clash in /Applications does, and the whole
 * prompt flow with Electron's calls injected.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
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
} from "./move-to-applications.ts";
import type { MovePromptDeps, MovePromptEnvironment } from "./move-to-applications.ts";

const OFFER: MovePromptEnvironment = {
  platform: "darwin",
  isPackaged: true,
  isMas: false,
  selftest: false,
  unattended: false,
  inApplications: false,
  otherInstancesOpen: 0,
  currentVersion: "0.1.8",
  declinedVersion: null,
};

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-move-to-apps-"));
}

// --- When the prompt is offered ------------------------------------------------------------------

test("a packaged macOS copy outside Applications, alone, never declined, is offered the move", () => {
  assert.equal(movePromptSkipReason(OFFER), null);
});

test("every reason not to offer the move is its own named skip", () => {
  assert.equal(movePromptSkipReason({ ...OFFER, isPackaged: false }), "not packaged (dev launch)");
  assert.equal(movePromptSkipReason({ ...OFFER, platform: "win32" }), "not macOS");
  assert.equal(movePromptSkipReason({ ...OFFER, platform: "linux" }), "not macOS");
  assert.equal(movePromptSkipReason({ ...OFFER, isMas: true }), "Mac App Store build");
  assert.equal(movePromptSkipReason({ ...OFFER, selftest: true }), "self-test launch");
  assert.equal(movePromptSkipReason({ ...OFFER, unattended: true }), "unattended site launch");
  assert.equal(movePromptSkipReason({ ...OFFER, inApplications: true }), "already in Applications");
  assert.equal(movePromptSkipReason({ ...OFFER, otherInstancesOpen: 1 }), "another copy of Tovu is open");
  assert.equal(movePromptSkipReason({ ...OFFER, declinedVersion: "0.1.8" }), "declined for this version");
});

test("Not Now for an older version does not silence the prompt after an update", () => {
  assert.equal(movePromptSkipReason({ ...OFFER, declinedVersion: "0.1.7" }), null);
});

// --- Not Now, remembered per version -------------------------------------------------------------

test("Not Now is remembered per version in userData, and read back", () => {
  const userDataDir = tempDir();
  const file = moveDeclineFilePath(userDataDir);
  assert.equal(file, path.join(userDataDir, "move-to-applications.json"));
  assert.equal(readDeclinedVersion(file), null);
  recordDeclinedVersion(file, "0.1.8");
  assert.equal(readDeclinedVersion(file), "0.1.8");
  recordDeclinedVersion(file, "0.1.9");
  assert.equal(readDeclinedVersion(file), "0.1.9");
});

test("a corrupt or wrong-shaped decline file reads as never declined", () => {
  const file = moveDeclineFilePath(tempDir());
  fs.writeFileSync(file, "{not json");
  assert.equal(readDeclinedVersion(file), null);
  fs.writeFileSync(file, JSON.stringify({ declinedVersion: 7 }));
  assert.equal(readDeclinedVersion(file), null);
});

// --- Paths and versions --------------------------------------------------------------------------

test("bundlePathFromExecPath finds the .app from its executable, null outside a bundle", () => {
  assert.equal(bundlePathFromExecPath("/Volumes/Tovu 0.1.8/Tovu.app/Contents/MacOS/Tovu"), "/Volumes/Tovu 0.1.8/Tovu.app");
  assert.equal(bundlePathFromExecPath("/usr/local/bin/electron"), null);
});

test("applicationsTargetPath is /Applications/<bundle name>, where Electron moves it", () => {
  assert.equal(applicationsTargetPath("/Users/me/Downloads/Tovu.app"), "/Applications/Tovu.app");
});

test("compareVersions orders numeric dotted versions and returns null for anything else", () => {
  assert.equal(compareVersions("0.1.8", "0.1.7"), 1);
  assert.equal(compareVersions("0.1.7", "0.1.8"), -1);
  assert.equal(compareVersions("0.1.10", "0.1.9"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("0.2.0-beta.1", "0.1.9"), 1);
  assert.equal(compareVersions("garbage", "0.1.9"), null);
  assert.equal(compareVersions(null, "0.1.9"), null);
});

test("readBundleVersion reads CFBundleShortVersionString from an XML Info.plist, null when it cannot", () => {
  const bundle = path.join(tempDir(), "Tovu.app");
  assert.equal(readBundleVersion(bundle), null);
  fs.mkdirSync(path.join(bundle, "Contents"), { recursive: true });
  fs.writeFileSync(
    path.join(bundle, "Contents", "Info.plist"),
    '<?xml version="1.0"?><plist><dict>\n<key>CFBundleName</key>\n<string>Tovu</string>\n<key>CFBundleShortVersionString</key>\n\t<string>0.1.7</string>\n</dict></plist>',
  );
  assert.equal(readBundleVersion(bundle), "0.1.7");
});

// --- A Tovu already in /Applications -------------------------------------------------------------

test("an older, same, or unreadable copy in Applications that is not running is replaced (Electron moves it to the Trash)", () => {
  assert.equal(decideMoveConflict({ conflictType: "exists", existingVersion: "0.1.7", currentVersion: "0.1.8" }), "replace");
  assert.equal(decideMoveConflict({ conflictType: "exists", existingVersion: "0.1.8", currentVersion: "0.1.8" }), "replace");
  assert.equal(decideMoveConflict({ conflictType: "exists", existingVersion: null, currentVersion: "0.1.8" }), "replace");
});

test("a newer copy in Applications is kept and opened instead, running or not", () => {
  assert.equal(decideMoveConflict({ conflictType: "exists", existingVersion: "0.1.9", currentVersion: "0.1.8" }), "open-existing");
  assert.equal(decideMoveConflict({ conflictType: "existsAndRunning", existingVersion: "0.1.9", currentVersion: "0.1.8" }), "open-existing");
  assert.equal(decideMoveConflict({ conflictType: "existsAndRunning", existingVersion: "0.1.8", currentVersion: "0.1.8" }), "open-existing");
});

test("an older or unreadable copy that is RUNNING is never replaced under it: this copy keeps running", () => {
  assert.equal(decideMoveConflict({ conflictType: "existsAndRunning", existingVersion: "0.1.7", currentVersion: "0.1.8" }), "blocked-by-running-copy");
  assert.equal(decideMoveConflict({ conflictType: "existsAndRunning", existingVersion: null, currentVersion: "0.1.8" }), "blocked-by-running-copy");
});

// --- The whole flow ------------------------------------------------------------------------------

interface Recorded {
  calls: string[];
  errors: string[];
  infos: string[];
}

function fakeDeps(overrides: Partial<MovePromptDeps> = {}): { deps: MovePromptDeps; seen: Recorded } {
  const seen: Recorded = { calls: [], errors: [], infos: [] };
  const deps: MovePromptDeps = {
    currentVersion: "0.1.8",
    targetPath: "/Applications/Tovu.app",
    ask: async () => "move",
    move: () => {
      seen.calls.push("move");
      return true;
    },
    readExistingVersion: () => null,
    openExisting: (appPath) => {
      seen.calls.push(`open ${appPath}`);
    },
    quit: () => {
      seen.calls.push("quit");
    },
    recordDeclined: () => {
      seen.calls.push("declined");
    },
    showError: (message) => {
      seen.errors.push(message);
    },
    showInfo: (message) => {
      seen.infos.push(message);
    },
    ...overrides,
  };
  return { deps, seen };
}

test("Not Now records the decline and moves nothing", async () => {
  const { deps, seen } = fakeDeps({ ask: async () => "not-now" });
  assert.equal(await runMoveToApplicationsPrompt(deps), "declined");
  assert.deepEqual(seen.calls, ["declined"]);
});

test("Move with no clash moves (Electron relaunches from Applications itself)", async () => {
  const { deps, seen } = fakeDeps();
  assert.equal(await runMoveToApplicationsPrompt(deps), "moved");
  assert.deepEqual(seen.calls, ["move"]);
  assert.deepEqual(seen.errors, []);
});

test("Move hands Electron a conflict handler that answers from decideMoveConflict", async () => {
  const answers: boolean[] = [];
  const { deps } = fakeDeps({
    readExistingVersion: () => "0.1.7",
    move: (onConflict) => {
      answers.push(onConflict("exists"));
      return true;
    },
  });
  await runMoveToApplicationsPrompt(deps);
  assert.deepEqual(answers, [true]);
});

test("Move onto a newer, not-running copy opens that copy and quits this one", async () => {
  const { deps, seen } = fakeDeps({
    readExistingVersion: () => "0.1.9",
    move: (onConflict) => onConflict("exists"),
  });
  assert.equal(await runMoveToApplicationsPrompt(deps), "opened-existing");
  assert.deepEqual(seen.calls, ["open /Applications/Tovu.app", "quit"]);
  assert.equal(seen.infos.length, 1);
});

test("Move onto a newer, running copy lets Electron focus it and quit this one (its own default)", async () => {
  const answers: boolean[] = [];
  const { deps, seen } = fakeDeps({
    readExistingVersion: () => "0.1.9",
    move: (onConflict) => {
      answers.push(onConflict("existsAndRunning"));
      return true;
    },
  });
  await runMoveToApplicationsPrompt(deps);
  assert.deepEqual(answers, [true]);
  assert.deepEqual(seen.calls, []);
});

test("Move onto an older copy that is running explains why and keeps this copy running", async () => {
  const { deps, seen } = fakeDeps({
    readExistingVersion: () => "0.1.7",
    move: (onConflict) => onConflict("existsAndRunning"),
  });
  assert.equal(await runMoveToApplicationsPrompt(deps), "blocked-by-running-copy");
  assert.deepEqual(seen.calls, []);
  assert.deepEqual(seen.errors, [MOVE_PROMPT.olderCopyRunning]);
});

test("a move that throws shows the plain reason and keeps running", async () => {
  const { deps, seen } = fakeDeps({
    move: () => {
      throw new Error("Permission denied");
    },
  });
  assert.equal(await runMoveToApplicationsPrompt(deps), "failed");
  assert.deepEqual(seen.calls, []);
  assert.deepEqual(seen.errors, [`${MOVE_PROMPT.moveFailed} Permission denied`]);
});

test("a move that returns false with no clash decision shows a plain message and keeps running", async () => {
  const { deps, seen } = fakeDeps({ move: () => false });
  assert.equal(await runMoveToApplicationsPrompt(deps), "failed");
  assert.deepEqual(seen.errors, [MOVE_PROMPT.moveFailed]);
});
