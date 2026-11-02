/**
 * @file The updater lifecycle through fake ports: when a controller starts, what turning the
 * checkbox OFF/ON does to the controller and the native updater, how the final quit is decided,
 * and the manual check's loader. Replaces the `new Function`/source-text checks of these functions
 * in `main-updater-wiring.test.ts` and `main-desktop-easy-wins.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDesktopUpdater, createDesktopUpdaterState, desktopUpdaterSkipReason } from "./desktop-updater.ts";
import type { DesktopUpdaterPorts, NativeUpdater } from "./desktop-updater.ts";
import type { AutoUpdateController } from "../../auto-update-controller.ts";

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
  created: { promptUpdateReady: (version: string) => Promise<boolean>; updater: unknown; platform: string }[];
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
    controllerDeps: { platform: "darwin", pid: 7, presenceDir: "/ud/presence", now: () => 0,
      explainOthersOpen() {}, quit() {}, log() {} },
    promptUpdateReady: async ({ version }) => { calls.push(`prompt:${version}`); return prompt; },
    log: message => logs.push(message),
    logError: message => errors.push(message),
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

test("a persisted OFF choice skips lazy updater loading on launch", async () => {
  const h = harness({ automatic: false });
  await h.updater.start();
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.logs, []);
});

test("turning updates OFF while electron-updater is loading creates no controller", async () => {
  let release!: (value: NativeUpdater) => void;
  const h = harness({ load: () => new Promise(resolve => { release = resolve; }) });
  const starting = h.updater.start();
  h.automatic.value = false;
  release(fakeNative());
  await starting;
  assert.deepEqual(h.calls, []);
  assert.equal(h.updater.state.controller, null);
  assert.equal(h.updater.state.starting, false);
});

test("a quit drain that began during the load creates no controller", async () => {
  const h = harness({ idle: false });
  await h.updater.start();
  assert.deepEqual(h.calls, ["load"]);
  assert.equal(h.updater.state.controller, null);
});

test("start is single-flight: a second call while starting, or once started, does nothing", async () => {
  let release!: (value: NativeUpdater) => void;
  const h = harness({ load: () => new Promise(resolve => { release = resolve; }) });
  const first = h.updater.start();
  await h.updater.start();
  release(fakeNative());
  await first;
  await h.updater.start();
  assert.deepEqual(h.calls, ["create", "start"]);
});

test("a failed load clears the starting flag, so a later start can retry", async () => {
  let fail = true;
  const h = harness({ load: async () => { if (fail) throw new Error("offline"); return fakeNative(); } });
  await assert.rejects(h.updater.start(), /offline/);
  assert.equal(h.updater.state.starting, false);
  fail = false;
  await h.updater.start();
  assert.deepEqual(h.calls, ["create", "start"]);
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

test("the controller's download prompt records the ready version for Check for updates…", async () => {
  const h = harness({ prompt: false });
  await h.updater.start();
  assert.equal(h.updater.readyVersion(), null);
  assert.equal(await h.created[0]!.promptUpdateReady("3.1.0"), false);
  assert.equal(h.updater.readyVersion(), "3.1.0");
  assert.ok(h.calls.includes("prompt:3.1.0"));
});

test("a ready version is not offered once the controller is gone", async () => {
  const h = harness();
  await h.updater.start();
  await h.created[0]!.promptUpdateReady("3.1.0");
  h.updater.setAutomaticUpdates({ enabled: false });
  assert.equal(h.updater.readyVersion(), null);
});

test("a restart starts the controller fresh: an old ready version is forgotten", async () => {
  const state = createDesktopUpdaterState();
  state.readyVersion = "0.9.0";
  const calls: string[] = [];
  const updater = createDesktopUpdater({ ports: {
    automaticUpdates: () => true, saveAutomaticUpdates() {}, skipReason: () => null,
    loadNativeUpdater: async () => fakeNative(), quitIdle: () => true,
    controllerDeps: { platform: "win32", pid: 1, presenceDir: "/p", now: () => 0, explainOthersOpen() {}, quit() {}, log() {} },
    promptUpdateReady: async () => true, log() {}, logError() {},
  } }, { state, createController: () => fakeController(calls) });
  await updater.start();
  assert.equal(updater.state, state);
  assert.equal(state.readyVersion, null);
});

test("turning automatic updates OFF persists first, stops the coordinator, and disables native installs/downloads", async () => {
  const h = harness();
  await h.updater.start();
  h.calls.length = 0;
  h.updater.setAutomaticUpdates({ enabled: false });
  assert.deepEqual(h.calls, ["save:false", "willQuit"]);
  assert.equal(h.updater.state.controller, null);
  assert.equal(h.native.autoDownload, false);
  assert.equal(h.native.autoInstallOnAppQuit, false);
});

test("turning updates OFF before any native updater loaded only persists", () => {
  const h = harness();
  h.updater.setAutomaticUpdates({ enabled: false });
  assert.deepEqual(h.calls, ["save:false"]);
  assert.equal(h.updater.state.native, null);
});

test("a failed preference save does not shut down an enabled updater", async () => {
  const h = harness({ saveFails: true });
  await h.updater.start();
  const controller = h.updater.state.controller;
  h.calls.length = 0;
  assert.throws(() => h.updater.setAutomaticUpdates({ enabled: false }), /disk full/);
  assert.deepEqual(h.calls, []);
  assert.equal(h.updater.state.controller, controller);
  assert.equal(h.native.autoDownload, true);
  assert.equal(h.native.autoInstallOnAppQuit, true);
});

test("a failed save of ON starts nothing", () => {
  const h = harness({ automatic: false, saveFails: true });
  assert.throws(() => h.updater.setAutomaticUpdates({ enabled: true }), /disk full/);
  assert.deepEqual(h.calls, []);
});

test("turning automatic updates back ON starts the eligible updater after saving", async () => {
  const h = harness({ automatic: false });
  h.updater.setAutomaticUpdates({ enabled: true });
  await settle();
  assert.deepEqual(h.calls, ["save:true", "load", "create", "start"]);
});

test("the final quit asks the controller and is held exactly when it says so", async () => {
  for (const held of [true, false]) {
    const h = harness({ held });
    await h.updater.start();
    assert.equal(h.updater.finalQuitHeldForUpdate(), held);
    assert.ok(h.calls.includes("beforeFinalQuit"));
  }
});

test("with no controller the final quit is never held", () => {
  assert.equal(harness().updater.finalQuitHeldForUpdate(), false);
});

test("a persisted OFF choice suppresses installation of an already downloaded update on final quit", async () => {
  const h = harness();
  await h.updater.start();
  h.automatic.value = false;
  h.calls.length = 0;
  assert.equal(h.updater.finalQuitHeldForUpdate(), false);
  assert.deepEqual(h.calls, [], "the controller must not be asked to install");
  assert.equal(h.native.autoInstallOnAppQuit, false);
});

test("OFF at final quit with no native updater loaded is simply not held", () => {
  const h = harness({ automatic: false });
  assert.equal(h.updater.finalQuitHeldForUpdate(), false);
  assert.equal(h.updater.state.native, null);
});

test("will-quit removes this instance's presence record only when a controller runs", async () => {
  const h = harness();
  h.updater.willQuit();
  assert.deepEqual(h.calls, []);
  await h.updater.start();
  h.updater.willQuit();
  assert.equal(h.calls.at(-1), "willQuit");
});

test("Check for updates… with updates ON starts the controller before handing back the native updater", async () => {
  const h = harness();
  const updater = await h.updater.loadUpdaterForCheck();
  assert.equal(updater, h.native);
  assert.deepEqual(h.calls, ["load", "create", "start", "load"]);
});

test("Check for updates… with updates OFF only loads the native updater and remembers it", async () => {
  const h = harness({ automatic: false });
  const updater = await h.updater.loadUpdaterForCheck();
  assert.equal(updater, h.native);
  assert.deepEqual(h.calls, ["load"]);
  assert.equal(h.updater.state.native, h.native);
  assert.equal(h.updater.state.controller, null);
});

test("a later check keeps the native updater the controller already listens to", async () => {
  const first = fakeNative();
  const other = fakeNative();
  const natives = [first, other];
  const h = harness({ load: async () => natives.shift()! });
  await h.updater.start();
  h.automatic.value = false;
  assert.equal(await h.updater.loadUpdaterForCheck(), other);
  assert.equal(h.updater.state.native, first);
});

test("the ready prompt restarts through the controller only when Restart is chosen", async () => {
  for (const prompt of [true, false]) {
    const h = harness({ prompt });
    await h.updater.start();
    await h.updater.showReadyPrompt({ version: "4.0.0" });
    assert.equal(h.calls.includes("requestRestart"), prompt);
    assert.ok(h.calls.includes("prompt:4.0.0"));
  }
});

test("a Restart choice with no controller running does nothing further", async () => {
  const h = harness({ prompt: true });
  await h.updater.showReadyPrompt({ version: "4.0.0" });
  assert.deepEqual(h.calls, ["prompt:4.0.0"]);
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
    controllerDeps: { platform: "darwin", pid: process.pid, presenceDir, now: () => 0,
      explainOthersOpen() {}, quit() {}, log() {} },
    promptUpdateReady: async () => true, log() {}, logError() {},
  } });
  await updater.start();
  assert.notEqual(updater.state.controller, null);
  assert.ok(events.includes("update-downloaded"), "the controller listens for a finished download");
  updater.willQuit();
});
