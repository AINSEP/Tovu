/**
 * @file Tovu's binding of Jini's updater lifecycle: the release skip gate, the `auto-update …` log
 * wording, and the DT-desktop-1 controller bound to the host's controller inputs. The lifecycle rules
 * (OFF/ON, the final quit, the manual check's loader) are tested in Jini's
 * `packages/desktop-host/src/electron/updates/__tests__/desktop-updater.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDesktopUpdater, desktopUpdaterSkipReason } from "./desktop-updater.ts";
import type { DesktopUpdaterPorts, NativeUpdater } from "./desktop-updater.ts";
import type { AutoUpdateController } from "@jini-ai/desktop-host/shell/auto-update-controller";

function fakeNative(): NativeUpdater {
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    autoRunAppAfterInstall: true,
    checkForUpdates: async () => null,
    quitAndInstall() {},
    on() { return undefined; },
  };
}

/** A controller that records calls; `held` is what beforeFinalQuit answers. */
function fakeController(calls: string[], { held = false }: { held?: boolean } = {}): AutoUpdateController {
  return {
    start: () => { calls.push("start"); },
    tick() {},
    requestRestart: () => { calls.push("requestRestart"); },
    beforeFinalQuit: () => { calls.push("beforeFinalQuit"); return held; },
    willQuit: () => { calls.push("willQuit"); },
  };
}

interface Harness {
  calls: string[];
  logs: string[];
  errors: string[];
  native: NativeUpdater;
  automatic: { value: boolean };
  created: { promptUpdateReady: (required: { version: string }) => Promise<boolean>; updater: unknown; platform: string }[];
  updater: ReturnType<typeof createDesktopUpdater>;
}

function harness({
  automatic = true, skip = null, idle = true, prompt = true, held = false, load, saveFails = false,
}: {
  automatic?: boolean; skip?: string | null; idle?: boolean; prompt?: boolean; held?: boolean;
  load?: () => Promise<NativeUpdater>; saveFails?: boolean;
} = {}): Harness {
  const calls: string[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const native = fakeNative();
  const automaticRef = { value: automatic };
  const created: Harness["created"] = [];
  const ports: DesktopUpdaterPorts = {
    automaticUpdates: () => automaticRef.value,
    saveAutomaticUpdates: ({ enabled }) => {
      if (saveFails) throw new Error("disk full");
      calls.push(`save:${enabled}`);
      automaticRef.value = enabled;
    },
    skipReason: () => skip,
    loadNativeUpdater: load ?? (async () => { calls.push("load"); return native; }),
    quitIdle: () => idle,
    controllerDeps: () => ({ platform: "darwin", pid: 7, presenceDir: "/ud/presence", now: () => 0,
      explainOthersOpen() {}, quit() {}, log() {} }),
    promptUpdateReady: async ({ version }) => { calls.push(`prompt:${version}`); return prompt; },
    log: ({ message }) => logs.push(message),
    logError: ({ message }) => errors.push(message),
  };
  const updater = createDesktopUpdater({ ports }, {
    createController: deps => {
      created.push(deps);
      calls.push("create");
      return fakeController(calls, { held });
    },
  });
  return { calls, logs, errors, native, automatic: automaticRef, created, updater };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("the skip gate maps Electron's launch facts onto Tovu's release policy", () => {
  const base = { isPackaged: true, windowsStore: false, platform: "darwin" as const, env: {}, selftest: false };
  assert.equal(desktopUpdaterSkipReason(base), null);
  assert.equal(desktopUpdaterSkipReason({ ...base, isPackaged: false }), "not packaged (dev launch)");
  assert.equal(desktopUpdaterSkipReason({ ...base, windowsStore: true }), "Microsoft Store build (the Store updates it)");
  assert.equal(desktopUpdaterSkipReason({ ...base, platform: "linux" }), "no published build for linux");
  assert.equal(desktopUpdaterSkipReason({ ...base, env: { TOVU_DESKTOP_DISABLE_UPDATER: "1" } }), "TOVU_DESKTOP_DISABLE_UPDATER=1");
  assert.equal(desktopUpdaterSkipReason({ ...base, selftest: true }), "self-test launch");
});

test("only an exact '1' disables the updater, and an absent windowsStore is not the Store", () => {
  const base = { isPackaged: true, platform: "win32" as const, selftest: false };
  for (const value of ["true", "0", "", " 1"]) {
    assert.equal(desktopUpdaterSkipReason({ ...base, windowsStore: undefined, env: { TOVU_DESKTOP_DISABLE_UPDATER: value } }), null, value);
  }
});

test("an eligible launch loads the native updater, binds a controller to it and starts it", async () => {
  const h = harness();
  await h.updater.start();
  assert.deepEqual(h.calls, ["load", "create", "start"]);
  assert.equal(h.created[0]!.updater, h.native);
  assert.equal(h.created[0]!.platform, "darwin");
  assert.equal(h.updater.state.native, h.native);
  assert.equal(h.updater.state.starting, false);
});

test("a skipped launch logs the policy reason and never loads electron-updater", async () => {
  const h = harness({ skip: "self-test launch" });
  await h.updater.start();
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.logs, ["auto-update off: self-test launch"]);
  assert.equal(h.updater.state.starting, false);
});

test("a background start logs a rejection instead of failing the boot", async () => {
  const h = harness({ load: async () => { throw new Error("updater unavailable"); } });
  h.updater.startInBackground();
  await settle();
  assert.deepEqual(h.errors, ["auto-update not started: updater unavailable"]);
});

test("a non-Error rejection is still logged as text", async () => {
  const h = harness({ load: () => Promise.reject("gone") });
  h.updater.startInBackground();
  await settle();
  assert.deepEqual(h.errors, ["auto-update not started: gone"]);
});

test("by default the real auto-update controller binds to the native updater's events", async (t) => {
  // Fake timers: the real controller's first check and presence heartbeat must not run here.
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const presenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-updater-"));
  t.after(() => fs.rmSync(presenceDir, { recursive: true, force: true }));
  const events: string[] = [];
  const native = { ...fakeNative(), on(event: string) { events.push(event); return undefined; } };
  const updater = createDesktopUpdater({ ports: {
    automaticUpdates: () => true, saveAutomaticUpdates() {}, skipReason: () => null,
    loadNativeUpdater: async () => native, quitIdle: () => true,
    controllerDeps: () => ({ platform: "darwin", pid: process.pid, presenceDir, now: () => 0,
      explainOthersOpen() {}, quit() {}, log() {} }),
    promptUpdateReady: async () => true, log() {}, logError() {},
  } });
  await updater.start();
  assert.notEqual(updater.state.controller, null);
  assert.ok(events.includes("update-downloaded"), "the controller listens for a finished download");
  updater.willQuit();
});

test("controller inputs are read when a controller is created, not when the updater is", async () => {
  const dirs = ["/first/presence"];
  const seen: string[] = [];
  const updater = createDesktopUpdater({ ports: {
    automaticUpdates: () => true, saveAutomaticUpdates() {}, skipReason: () => null,
    loadNativeUpdater: async () => fakeNative(), quitIdle: () => true,
    controllerDeps: () => ({ platform: "darwin", pid: 1, presenceDir: dirs[0]!, now: () => 0,
      explainOthersOpen() {}, quit() {}, log() {} }),
    promptUpdateReady: async () => true, log() {}, logError() {},
  } }, { createController: deps => { seen.push(deps.presenceDir); return fakeController([]); } });
  dirs[0] = "/moved/presence";
  await updater.start();
  assert.deepEqual(seen, ["/moved/presence"]);
});
