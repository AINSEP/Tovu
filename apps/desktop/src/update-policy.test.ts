/**
 * @file Behavioural proof for `update-policy.ts`: when the updater runs at all, who owns it among
 * several instances, when it checks, and what a quit does with a downloaded update.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  PRESENCE_STALE_MS,
  UPDATE_CHECK_INTERVAL_MS,
  decideFinalQuit,
  decideRestartClick,
  electUpdaterOwner,
  shouldCheckNow,
  updaterSkipReason,
} from "./update-policy.ts";
import type { FinalQuitInput, UpdaterEnvironment } from "./update-policy.ts";

const PACKAGED_MAC: UpdaterEnvironment = { isPackaged: true, windowsStore: false, platform: "darwin", disabledByEnv: false, selftest: false };

test("a packaged macOS or Windows build runs the updater", () => {
  assert.equal(updaterSkipReason(PACKAGED_MAC), null);
  assert.equal(updaterSkipReason({ ...PACKAGED_MAC, platform: "win32" }), null);
});

test("a dev launch never runs the updater", () => {
  assert.equal(updaterSkipReason({ ...PACKAGED_MAC, isPackaged: false }), "not packaged (dev launch)");
});

test("a Microsoft Store (MSIX) build never runs the updater, because the Store updates it", () => {
  assert.equal(updaterSkipReason({ ...PACKAGED_MAC, platform: "win32", windowsStore: true }), "Microsoft Store build (the Store updates it)");
});

test("Linux, the env opt-out and a self-test each skip the updater", () => {
  assert.equal(updaterSkipReason({ ...PACKAGED_MAC, platform: "linux" }), "no published build for linux");
  assert.equal(updaterSkipReason({ ...PACKAGED_MAC, disabledByEnv: true }), "TOVU_DESKTOP_DISABLE_UPDATER=1");
  assert.equal(updaterSkipReason({ ...PACKAGED_MAC, selftest: true }), "self-test launch");
});

test("the longest-running instance with a fresh heartbeat owns the updater", () => {
  const now = 1_000_000;
  const instances = [
    { pid: 30, startedAt: 500, heartbeatAt: now },
    { pid: 20, startedAt: 100, heartbeatAt: now },
    { pid: 10, startedAt: 900, heartbeatAt: now },
  ];
  assert.equal(electUpdaterOwner(instances, now), 20);
});

test("equal start times fall back to the lowest pid, so every instance elects the same owner", () => {
  const now = 1_000_000;
  assert.equal(
    electUpdaterOwner([{ pid: 7, startedAt: 1, heartbeatAt: now }, { pid: 3, startedAt: 1, heartbeatAt: now }], now),
    3,
  );
});

test("a stale heartbeat cannot hold ownership, and no fresh instance means no owner", () => {
  const now = 10 * PRESENCE_STALE_MS;
  const stale = { pid: 1, startedAt: 0, heartbeatAt: now - PRESENCE_STALE_MS - 1 };
  const fresh = { pid: 2, startedAt: 50, heartbeatAt: now };
  assert.equal(electUpdaterOwner([stale, fresh], now), 2);
  assert.equal(electUpdaterOwner([stale], now), null);
  assert.equal(electUpdaterOwner([], now), null);
});

test("the owner checks at once when it never has, then only after the interval", () => {
  assert.equal(shouldCheckNow({ isOwner: true, lastCheckAt: null, now: 5, busy: false }), true);
  assert.equal(shouldCheckNow({ isOwner: true, lastCheckAt: 0, now: UPDATE_CHECK_INTERVAL_MS - 1, busy: false }), false);
  assert.equal(shouldCheckNow({ isOwner: true, lastCheckAt: 0, now: UPDATE_CHECK_INTERVAL_MS, busy: false }), true);
  assert.equal(shouldCheckNow({ isOwner: true, lastCheckAt: 0, now: 10, busy: false, intervalMs: 10 }), true);
});

test("a non-owner or a busy owner never checks", () => {
  assert.equal(shouldCheckNow({ isOwner: false, lastCheckAt: null, now: 5, busy: false }), false);
  assert.equal(shouldCheckNow({ isOwner: true, lastCheckAt: null, now: 5, busy: true }), false);
});

const READY_SOLE: FinalQuitInput = { platform: "darwin", updateReady: true, otherInstances: 0, restartRequested: false, installStarted: false };

test("the last instance to quit stages on macOS and installs on quit on Windows", () => {
  assert.equal(decideFinalQuit(READY_SOLE), "stage-then-quit");
  assert.equal(decideFinalQuit({ ...READY_SOLE, platform: "win32" }), "install-on-quit");
});

test("any other open instance means the update is NOT installed on this quit", () => {
  assert.equal(decideFinalQuit({ ...READY_SOLE, otherInstances: 1 }), "proceed");
  assert.equal(decideFinalQuit({ ...READY_SOLE, platform: "win32", otherInstances: 2 }), "proceed");
  assert.equal(decideFinalQuit({ ...READY_SOLE, otherInstances: 1, restartRequested: true }), "proceed");
});

test("Restart to update relaunches; no update or an install already started just quits", () => {
  assert.equal(decideFinalQuit({ ...READY_SOLE, restartRequested: true }), "install-and-relaunch");
  assert.equal(decideFinalQuit({ ...READY_SOLE, updateReady: false }), "proceed");
  assert.equal(decideFinalQuit({ ...READY_SOLE, installStarted: true }), "proceed");
});

test("Restart to update explains instead of restarting while other copies are open", () => {
  assert.equal(decideRestartClick(true, 0), "restart");
  assert.equal(decideRestartClick(true, 2), "others-open");
  assert.equal(decideRestartClick(false, 0), "not-ready");
});
