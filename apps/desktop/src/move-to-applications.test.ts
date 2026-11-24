/**
 * @file Host-binding proof for `move-to-applications.ts`: Tovu's copy, app name, decline file under
 * `userData` and the real durable JSON / `fs` bindings, run through the Jini policy. The policy's
 * own rules are proven against fake ports in Jini
 * `packages/devops/src/packaging/electron/__tests__/move-to-applications.test.ts`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  movePromptSkipReason,
  readBundleVersion,
  readDeclinedVersion,
  recordDeclinedVersion,
  runMoveToApplicationsPrompt,
} from "@jini-ai/devops/packaging/electron/move-to-applications";
import type { MovePromptDeps, MovePromptEnvironment } from "@jini-ai/devops/packaging/electron/move-to-applications";
import { orFallbackSync } from "@jini-ai/core/errors/idioms";

import { MOVE_PROMPT, MOVE_PROMPT_APP_NAME, moveDeclineFilePath, moveDeclineStore, readBundleTextFile } from "./move-to-applications.ts";

const OFFER: MovePromptEnvironment = {
  appName: MOVE_PROMPT_APP_NAME,
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

// --- Skip reasons, with Tovu's name -----------------------------------------------------------------

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

// --- Not Now, remembered per version -------------------------------------------------------------

test("Not Now is remembered per version in userData, and read back", () => {
  const userDataDir = tempDir();
  const file = moveDeclineFilePath({ userDataDir });
  assert.equal(file, path.join(userDataDir, "move-to-applications.json"));
  assert.equal(readDeclinedVersion({ filePath: file, store: moveDeclineStore }), null);
  recordDeclinedVersion({ filePath: file, version: "0.1.8", store: moveDeclineStore });
  assert.equal(readDeclinedVersion({ filePath: file, store: moveDeclineStore }), "0.1.8");
  recordDeclinedVersion({ filePath: file, version: "0.1.9", store: moveDeclineStore });
  assert.equal(readDeclinedVersion({ filePath: file, store: moveDeclineStore }), "0.1.9");
});

test("a corrupt or wrong-shaped decline file reads as never declined", () => {
  const file = moveDeclineFilePath({ userDataDir: tempDir() });
  fs.writeFileSync(file, "{not json");
  assert.equal(readDeclinedVersion({ filePath: file, store: moveDeclineStore }), null);
  fs.writeFileSync(file, JSON.stringify({ declinedVersion: 7 }));
  assert.equal(readDeclinedVersion({ filePath: file, store: moveDeclineStore }), null);
});

// --- Bundle version, read through the real fs binding --------------------------------------------

test("readBundleVersion reads CFBundleShortVersionString from an XML Info.plist, null when it cannot", () => {
  const bundle = path.join(tempDir(), "Tovu.app");
  assert.equal(readBundleVersion({ bundlePath: bundle, readTextFile: readBundleTextFile, orFallbackSync }), null);
  fs.mkdirSync(path.join(bundle, "Contents"), { recursive: true });
  fs.writeFileSync(
    path.join(bundle, "Contents", "Info.plist"),
    '<?xml version="1.0"?><plist><dict>\n<key>CFBundleName</key>\n<string>Tovu</string>\n<key>CFBundleShortVersionString</key>\n\t<string>0.1.7</string>\n</dict></plist>',
  );
  assert.equal(readBundleVersion({ bundlePath: bundle, readTextFile: readBundleTextFile, orFallbackSync }), "0.1.7");
  // A readable plist that simply has no version key (a hand-built or foreign bundle) is unknown too.
  fs.writeFileSync(path.join(bundle, "Contents", "Info.plist"), '<?xml version="1.0"?><plist><dict>\n<key>CFBundleName</key>\n<string>Tovu</string>\n</dict></plist>');
  assert.equal(readBundleVersion({ bundlePath: bundle, readTextFile: readBundleTextFile, orFallbackSync }), null);
});

// --- The whole flow, showing Tovu's copy ----------------------------------------------------------

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
    messages: MOVE_PROMPT,
    ask: async () => "move",
    move: () => {
      seen.calls.push("move");
      return true;
    },
    readExistingVersion: () => null,
    openExisting: ({ appPath }) => {
      seen.calls.push(`open ${appPath}`);
    },
    quit: () => {
      seen.calls.push("quit");
    },
    recordDeclined: () => {
      seen.calls.push("declined");
    },
    showError: ({ message }) => {
      seen.errors.push(message);
    },
    showInfo: ({ message }) => {
      seen.infos.push(message);
    },
    ...overrides,
  };
  return { deps, seen };
}

test("Move onto a newer, not-running copy opens that copy and quits this one", async () => {
  const { deps, seen } = fakeDeps({
    readExistingVersion: () => "0.1.9",
    move: ({ conflictHandler }) => conflictHandler("exists"),
  });
  assert.equal(await runMoveToApplicationsPrompt(deps), "opened-existing");
  assert.deepEqual(seen.calls, ["open /Applications/Tovu.app", "quit"]);
  assert.equal(seen.infos.length, 1);
});

test("Move onto an older copy that is running explains why and keeps this copy running", async () => {
  const { deps, seen } = fakeDeps({
    readExistingVersion: () => "0.1.7",
    move: ({ conflictHandler }) => conflictHandler("existsAndRunning"),
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
