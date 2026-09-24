/**
 * @file Behavioural proof for `auto-update-controller.ts`, driven with a fake `electron-updater` and
 * a real presence directory: one owner checks, a download prompts once, and a quit installs only
 * from the last instance, holding the quit exactly when the install will end the app itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createAutoUpdateController } from "./auto-update-controller.ts";
import type { AutoUpdateControllerDeps } from "./auto-update-controller.ts";
import { writeInstanceRecord } from "./instance-presence.ts";

const SELF = 100;

/** A stand-in for `electron-updater`'s `autoUpdater` that records every call. */
function fakeUpdater() {
  const listeners = new Map<string, (payload: unknown) => void>();
  const calls: string[] = [];
  const updater = {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    autoRunAppAfterInstall: true,
    checkResult: Promise.resolve(null) as Promise<{ downloadPromise?: Promise<unknown> | null } | null>,
    checkForUpdates() {
      calls.push("check");
      return updater.checkResult;
    },
    quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean) {
      calls.push(`quitAndInstall(${isSilent},${isForceRunAfter})`);
    },
    on(event: string, listener: (payload: never) => void) {
      listeners.set(event, listener as (payload: unknown) => void);
    },
    emit(event: string, payload: unknown) {
      listeners.get(event)?.(payload);
    },
  };
  return { updater, calls };
}

function setup(overrides: Partial<AutoUpdateControllerDeps> = {}) {
  const presenceDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-updater-")), "instances");
  const { updater, calls } = fakeUpdater();
  const events: string[] = [];
  let clock = 1_000_000;
  const alive = new Set([SELF]);
  let restartChoice = false;
  const controller = createAutoUpdateController({
    updater,
    platform: "darwin",
    pid: SELF,
    presenceDir,
    now: () => clock,
    isAlive: (pid) => alive.has(pid),
    promptUpdateReady: async (version) => {
      events.push(`prompt ${version}`);
      return restartChoice;
    },
    explainOthersOpen: (count) => events.push(`others ${count}`),
    quit: () => events.push("quit"),
    log: () => {},
    stageTimeoutMs: 60_000,
    ...overrides,
  });
  return {
    controller,
    updater,
    calls,
    events,
    presenceDir,
    advance: (ms: number) => (clock += ms),
    addSibling: (pid: number, startedAt: number) => {
      alive.add(pid);
      writeInstanceRecord(presenceDir, { pid, startedAt, heartbeatAt: clock });
    },
    chooseRestart: () => (restartChoice = true),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("configures the updater: quiet download; install-on-quit only on Windows", () => {
  const mac = setup();
  assert.equal(mac.updater.autoDownload, true);
  assert.equal(mac.updater.autoInstallOnAppQuit, false, "macOS must not feed Squirrel at download time");
  const win = setup({ platform: "win32" });
  assert.equal(win.updater.autoInstallOnAppQuit, true, "Windows registers its quit handler only when this is true at download");
});

test("the sole instance checks on its first tick and not again until the interval", async () => {
  const t = setup();
  t.controller.tick();
  await flush();
  t.controller.tick();
  assert.deepEqual(t.calls, ["check"]);
  t.advance(4 * 60 * 60 * 1000);
  t.controller.tick();
  assert.deepEqual(t.calls, ["check", "check"]);
});

test("an instance that started later than a live sibling never checks", () => {
  const t = setup();
  t.addSibling(50, 0);
  t.controller.tick();
  assert.deepEqual(t.calls, []);
});

test("a failed check is logged, not thrown, and frees the next due check", async () => {
  const logs: string[] = [];
  const t = setup({ log: (message) => logs.push(message) });
  t.updater.checkResult = Promise.reject(new Error("offline"));
  t.controller.tick();
  await flush();
  assert.deepEqual(logs, ["auto-update: check failed: offline"]);
});

test("a download prompts once per version; Later leaves the install to the quit", async () => {
  const t = setup();
  t.updater.emit("update-downloaded", { version: "0.2.0" });
  t.updater.emit("update-downloaded", { version: "0.2.0" });
  await flush();
  assert.deepEqual(t.events, ["prompt 0.2.0"]);
  t.controller.tick();
  assert.deepEqual(t.calls, [], "a downloaded update stops further checks");
});

test("Restart to update as the only instance quits through the normal drain, then relaunches", async () => {
  const t = setup();
  t.chooseRestart();
  t.updater.emit("update-downloaded", { version: "0.2.0" });
  await flush();
  assert.deepEqual(t.events, ["prompt 0.2.0", "quit"]);
  assert.equal(t.controller.beforeFinalQuit(), true, "the quit is held while the install takes over");
  assert.deepEqual(t.calls, ["quitAndInstall(true,true)"]);
  assert.equal(t.updater.autoRunAppAfterInstall, true);
  assert.equal(t.controller.beforeFinalQuit(), false, "the install's own quit goes through");
});

test("Restart to update with another copy open explains and does not quit", async () => {
  const t = setup();
  t.addSibling(200, 5_000_000);
  t.chooseRestart();
  t.updater.emit("update-downloaded", { version: "0.2.0" });
  await flush();
  assert.deepEqual(t.events, ["prompt 0.2.0", "others 1"]);
});

test("macOS: the last instance's quit stages the update with Squirrel, without relaunching", () => {
  const t = setup();
  t.updater.emit("update-downloaded", { version: "0.2.0" });
  assert.equal(t.controller.beforeFinalQuit(), true);
  assert.deepEqual(t.calls, ["quitAndInstall(false,false)"]);
  assert.equal(t.updater.autoRunAppAfterInstall, false);
});

test("macOS: a failed Squirrel hand-off still quits the app", () => {
  const t = setup();
  t.updater.emit("update-downloaded", { version: "0.2.0" });
  t.controller.beforeFinalQuit();
  t.updater.emit("error", new Error("squirrel said no"));
  assert.deepEqual(t.events.filter((event) => event === "quit"), ["quit"]);
});

test("a quit while another copy is open installs nothing, on either platform", () => {
  for (const platform of ["darwin", "win32"] as const) {
    const t = setup({ platform });
    t.addSibling(200, 5_000_000);
    t.updater.emit("update-downloaded", { version: "0.2.0" });
    assert.equal(t.controller.beforeFinalQuit(), false);
    assert.deepEqual(t.calls, []);
    assert.equal(t.updater.autoInstallOnAppQuit, false, `${platform} must not install on this quit`);
  }
});

test("Windows: the last instance's quit lets electron-updater install silently on quit", () => {
  const t = setup({ platform: "win32" });
  t.updater.emit("update-downloaded", { version: "0.2.0" });
  assert.equal(t.controller.beforeFinalQuit(), false);
  assert.equal(t.updater.autoInstallOnAppQuit, true);
  assert.deepEqual(t.calls, []);
});

test("Windows: a quit with no update switches install-on-quit off", () => {
  const t = setup({ platform: "win32" });
  assert.equal(t.controller.beforeFinalQuit(), false);
  assert.equal(t.updater.autoInstallOnAppQuit, false);
});

test("start records this instance at once; willQuit removes it", () => {
  const t = setup();
  t.controller.start();
  assert.deepEqual(fs.readdirSync(t.presenceDir), [`${SELF}.json`]);
  assert.deepEqual(t.calls, [], "the first check waits for the launch delay");
  t.controller.willQuit();
  assert.deepEqual(fs.readdirSync(t.presenceDir), []);
});
