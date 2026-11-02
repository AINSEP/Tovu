/**
 * @file Product telemetry boot and the first-run sharing dialog, with Electron's `app`, windows,
 * `dialog`, `Menu` and process metadata as fakes. The boot, process-guard, IPC and memory modules
 * are replaced through their optional ports, so nothing here touches the test process's own
 * `process` listeners.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { MessageBoxOptions } from "electron";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import type { DesktopProductTelemetry } from "../../product-telemetry.ts";
import type { ProductTelemetryPreference } from "../../product-telemetry-preference.ts";
import {
  armFirstProductConsent,
  createDesktopProductState,
  desktopLaunchMode,
  focusVisibility,
  initializeDesktopProductTelemetry,
} from "./product-telemetry-boot.ts";
import type { ProductTelemetryBootArgs, ProductTelemetryBootOptions } from "./product-telemetry-boot.ts";
import { SHARING_SAVE_ERROR } from "./settings-menu.ts";

const settle = () => new Promise(resolve => setImmediate(resolve));

function fakeApp({ isPackaged = false } = {}) {
  return Object.assign(new EventEmitter(), { isPackaged, getVersion: () => "1.2.3" });
}

/** A product whose tracker records `error` contexts; the shared no-op tracker is frozen. */
function fakeProduct({ launch }: { launch?: DesktopProductTelemetry["launch"] } = {}) {
  const consents: unknown[] = [];
  const errors: unknown[] = [];
  const product: DesktopProductTelemetry = {
    tracker: { ...createNoopTracker({}), error: (_input, options) => { errors.push(options?.context?.attributes); } }, launch,
    consentChanged: (preference) => { consents.push(preference); },
    async dispose() {},
  };
  return { product, consents, errors };
}

const LAUNCH = { configPath: "/cfg.json", preferencePath: "/ud/desktop-preferences.json", release: "tovu-desktop@1.2.3" };

function bootHarness({ launch, argv = ["electron", "."], isPackaged = false, env = {} as NodeJS.ProcessEnv }: {
  launch?: DesktopProductTelemetry["launch"]; argv?: string[]; isPackaged?: boolean; env?: NodeJS.ProcessEnv;
} = {}) {
  const calls: string[] = [];
  const bootInputs: Parameters<NonNullable<ProductTelemetryBootOptions["boot"]>>[0][] = [];
  const memoryInputs: Parameters<NonNullable<ProductTelemetryBootOptions["startMemory"]>>[0][] = [];
  const ipcPredicates: ((url: string) => boolean)[] = [];
  const scheduled: { ms: number; visibility: unknown }[] = [];
  const exportInputs: unknown[] = [];
  const app = fakeApp({ isPackaged });
  const { product, errors } = fakeProduct({ launch });
  const state = createDesktopProductState();
  const args: ProductTelemetryBootArgs = {
    app,
    processInfo: { pid: 4242, argv, env, resourcesPath: "/App/Resources", memoryUsage: () => ({ heapUsed: 99 }), uptime: () => 12 },
    crashReporter: { start() {}, setUploadToServer() {} },
    ipcMain: { on() {}, removeListener() {} },
    webContents: { getAllWebContents: () => [{ getOSProcessId: () => 11 }, { getOSProcessId: () => 12 }, { getOSProcessId: () => 11 }] },
    windows: { getFocusedWindow: () => null },
    preferencePath: "/ud/desktop-preferences.json",
    isShellPage: url => url.startsWith("file:///shell") || url.startsWith("http://127.0.0.1:5173"),
    monitor: { get: async () => { throw new Error("not sampled in these tests"); } },
    state,
    armConsent: () => calls.push("armConsent"),
  };
  const options: ProductTelemetryBootOptions = {
    boot: async (input) => { calls.push("boot"); bootInputs.push(input); return product; },
    observabilityExport: (input) => { exportInputs.push(input); return true; },
    installRejectionGuard: () => calls.push("rejectionGuard"),
    installErrorReporting: ({ tracker, processRole }) => {
      assert.equal(tracker, product.tracker);
      calls.push(`errorReporting:${processRole}`);
      return () => calls.push("dispose:errorReporting");
    },
    registerIpc: ({ isShellPage, tracker }) => {
      assert.equal(tracker, product.tracker);
      ipcPredicates.push(isShellPage);
      calls.push("ipc");
      return () => calls.push("dispose:ipc");
    },
    startMemory: (input, { schedule }) => {
      memoryInputs.push(input);
      schedule(() => {}, 300_000);
      calls.push("memory");
      return { tick: async () => {}, dispose: () => calls.push("dispose:memory") };
    },
    schedule: (_tick, ms, visibility) => { scheduled.push({ ms, visibility }); return () => {}; },
  };
  return { args, options, calls, bootInputs, memoryInputs, ipcPredicates, scheduled, exportInputs, app, product, state, errors };
}

test("a relaunch after an install is an update launch; anything else is fresh", () => {
  assert.equal(desktopLaunchMode({ argv: ["Tovu", "--updated"] }), "update");
  assert.equal(desktopLaunchMode({ argv: ["Tovu.exe", "--squirrel-updated"] }), "update");
  for (const argv of [["Tovu"], ["Tovu", "--updated=1"], ["Tovu", "--squirrel-install"], []]) {
    assert.equal(desktopLaunchMode({ argv }), "fresh", argv.join(" "));
  }
});

test("before boot every mode sees an inert product with nothing to dispose", async () => {
  const state = createDesktopProductState();
  assert.equal(state.product.launch, undefined);
  assert.deepEqual(state.disposers, []);
  state.product.consentChanged({ crashes: true, usage: true, installationId: "x" });
  await state.product.dispose();
  assert.notEqual(createDesktopProductState().product, state.product, "each state is its own");
});

test("a focused app window counts as visible; focus and blur both wake the sampler", () => {
  const app = fakeApp();
  let focused: object | null = null;
  const visibility = focusVisibility({ app, windows: { getFocusedWindow: () => focused } });
  assert.equal(visibility.visibilityState, "hidden");
  focused = {};
  assert.equal(visibility.visibilityState, "visible");
  const listener = () => {};
  visibility.addEventListener("visibilitychange", listener);
  assert.deepEqual([app.listeners("browser-window-focus"), app.listeners("browser-window-blur")], [[listener], [listener]]);
  visibility.removeEventListener("visibilitychange", listener);
  assert.deepEqual([app.listenerCount("browser-window-focus"), app.listenerCount("browser-window-blur")], [0, 0]);
});

test("a dev launch with no product config boots inactive: process reports wired, no sampler, no dialog", async () => {
  const h = bootHarness();
  await initializeDesktopProductTelemetry(h.args, h.options);
  assert.deepEqual(h.calls, ["boot", "rejectionGuard", "errorReporting:desktop-main", "ipc"]);
  assert.equal(h.state.product, h.product);
  assert.equal(h.state.disposers.length, 2);
  assert.equal(h.bootInputs[0]!.launch, undefined);
  assert.equal(h.bootInputs[0]!.launchMode, "fresh");
  assert.equal(h.bootInputs[0]!.observabilityExportEnabled, true);
  assert.equal(h.bootInputs[0]!.crashReporter, h.args.crashReporter);
  assert.deepEqual(h.exportInputs, [{ env: {}, packagedDesktop: false }]);
});

test("a packaged launch reads its bundled product config and release, and an updated relaunch says so", async () => {
  const h = bootHarness({ isPackaged: true, argv: ["Tovu", "--updated"] });
  await initializeDesktopProductTelemetry(h.args, h.options);
  assert.deepEqual(h.bootInputs[0]!.launch, { configPath: path.join("/App/Resources", "product-telemetry.json"),
    preferencePath: "/ud/desktop-preferences.json", release: "tovu-desktop@1.2.3" });
  assert.equal(h.bootInputs[0]!.launchMode, "update");
  assert.deepEqual(h.exportInputs, [{ env: {}, packagedDesktop: true }]);
});

test("the boot's consent reader reads the preferences file it was given", async () => {
  const h = bootHarness();
  await initializeDesktopProductTelemetry({ ...h.args, preferencePath: "/definitely/missing/prefs.json" }, h.options);
  assert.deepEqual(h.bootInputs[0]!.readConsent(), { crashes: false, usage: false, installationId: null });
});

test("product IPC accepts only shell pages served from file:", async () => {
  const h = bootHarness();
  await initializeDesktopProductTelemetry(h.args, h.options);
  const allowed = h.ipcPredicates[0]!;
  assert.equal(allowed("file:///shell/index.html"), true);
  assert.equal(allowed("http://127.0.0.1:5173/admin"), false, "a supervised admin origin is a shell page for speech, not for product IPC");
  assert.equal(allowed("file:///elsewhere/index.html"), false);
});

test("crashed renderers and children are reported to the booted product; clean exits are not", async () => {
  const h = bootHarness();
  await initializeDesktopProductTelemetry(h.args, h.options);
  h.app.emit("render-process-gone", {}, {}, { reason: "crashed" });
  h.app.emit("child-process-gone", {}, { type: "GPU", reason: "oom" });
  h.app.emit("child-process-gone", {}, { type: "Utility", reason: "clean-exit" });
  assert.deepEqual(h.errors, [
    { process: "renderer", code: "crashed" },
    { process: "GPU", code: "oom" },
  ]);
});

test("a configured launch also samples memory and then arms the first-run dialog", async () => {
  const h = bootHarness({ launch: LAUNCH });
  await initializeDesktopProductTelemetry(h.args, h.options);
  assert.deepEqual(h.calls, ["boot", "rejectionGuard", "errorReporting:desktop-main", "ipc", "memory", "armConsent"]);
  assert.equal(h.state.disposers.length, 3);
  const memory = h.memoryInputs[0]!;
  assert.equal(memory.desktopPid, 4242);
  assert.equal(memory.tracker, h.product.tracker);
  assert.deepEqual([...memory.rendererPids()], [11, 12]);
  assert.equal(memory.heapUsedBytes(), 99);
  assert.equal(memory.uptime(), 12);
  assert.equal(h.scheduled[0]!.ms, 300_000);
  assert.equal((h.scheduled[0]!.visibility as { visibilityState: string }).visibilityState, "hidden");
});

test("the disposers boot leaves run the teardowns it registered", async () => {
  const h = bootHarness({ launch: LAUNCH });
  await initializeDesktopProductTelemetry(h.args, h.options);
  h.calls.length = 0;
  for (const dispose of h.state.disposers) dispose();
  assert.deepEqual(h.calls, ["dispose:errorReporting", "dispose:ipc", "dispose:memory"]);
});

test("a failed boot leaves the inert product and nothing registered", async () => {
  const h = bootHarness();
  const inert = h.state.product;
  await assert.rejects(initializeDesktopProductTelemetry(h.args, { ...h.options, boot: async () => { throw new Error("bad config"); } }), /bad config/);
  assert.equal(h.state.product, inert);
  assert.deepEqual(h.state.disposers, []);
  assert.equal(h.app.listenerCount("render-process-gone"), 0);
});

test("a later step's throw keeps the earlier disposers for before-quit", async () => {
  const h = bootHarness({ launch: LAUNCH });
  await assert.rejects(initializeDesktopProductTelemetry(h.args, { ...h.options, registerIpc: () => { throw new Error("duplicate channel"); } }), /duplicate channel/);
  assert.equal(h.state.product, h.product);
  assert.equal(h.state.disposers.length, 1);
});

// ---- first-run sharing dialog --------------------------------------------------------------

class FakeWindow extends EventEmitter {
  visible: boolean;
  webContents = new EventEmitter();
  constructor({ visible }: { visible: boolean }) { super(); this.visible = visible; }
  isVisible() { return this.visible; }
}

const UNDECIDED: ProductTelemetryPreference = { crashes: false, usage: false, installationId: null, decidedAt: null };

function consentHarness({ response = 0, decided = false, launch = LAUNCH as DesktopProductTelemetry["launch"],
  failWrite = false, failDialog = false }: {
  response?: number; decided?: boolean; launch?: DesktopProductTelemetry["launch"]; failWrite?: boolean; failDialog?: boolean;
} = {}) {
  const app = fakeApp();
  const { product, consents } = fakeProduct({ launch });
  const state = { product };
  const shown: { window: FakeWindow; options: MessageBoxOptions }[] = [];
  const errorBoxes: [string, string][] = [];
  const writes: unknown[] = [];
  let stored: ProductTelemetryPreference = decided ? { ...UNDECIDED, decidedAt: "earlier" } : UNDECIDED;
  const sharing = [{ label: "Send crash reports to Tovu", checked: false }, { label: "Send usage statistics to Tovu", checked: false }];
  armFirstProductConsent<FakeWindow>({
    app,
    dialog: {
      showMessageBox: async (window, options) => {
        if (failDialog) throw new Error("no dialog");
        shown.push({ window, options });
        return { response };
      },
      showErrorBox: (title, content) => { errorBoxes.push([title, content]); },
    },
    menu: { getApplicationMenu: () => ({ items: [{ submenu: { items: sharing } }] }) },
    preferencePath: "/ud/desktop-preferences.json",
    state,
  }, {
    readSharing: () => stored,
    writeSharing: ({ patch }) => {
      if (failWrite) throw new Error("DESKTOP_PREFERENCES_UNREADABLE");
      writes.push(patch);
      stored = { crashes: patch.crashes ?? false, usage: patch.usage ?? false, installationId: "id", decidedAt: "now" };
      return stored;
    },
  });
  const openWindow = ({ visible }: { visible: boolean }) => {
    const window = new FakeWindow({ visible });
    app.emit("browser-window-created", {}, window);
    return window;
  };
  return { app, state, shown, errorBoxes, writes, consents, sharing, openWindow };
}

test("the dialog waits for a window that is actually visible", async () => {
  const h = consentHarness();
  const window = h.openWindow({ visible: false });
  window.webContents.emit("did-finish-load");
  await settle();
  assert.deepEqual(h.shown, []);
  window.visible = true;
  window.emit("show");
  await settle();
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0]!.window, window);
});

test("the dialog is offered once per launch, then stops following new windows", async () => {
  const h = consentHarness({ response: 3 });
  const first = h.openWindow({ visible: true });
  first.webContents.emit("did-finish-load");
  first.emit("show");
  h.openWindow({ visible: true }).emit("show");
  await settle();
  assert.equal(h.shown.length, 1);
  assert.equal(h.app.listenerCount("browser-window-created"), 0);
});

test("a choice persists, reaches the product, and checks the installed menu in place", async () => {
  const h = consentHarness({ response: 0 });
  h.openWindow({ visible: true }).emit("show");
  await settle();
  assert.deepEqual(h.writes, [{ crashes: true, usage: true }]);
  assert.deepEqual(h.consents, [{ crashes: true, usage: true, installationId: "id", decidedAt: "now" }]);
  assert.deepEqual(h.sharing.map(item => item.checked), [true, true]);
});

test("crash reports only checks only the crash box", async () => {
  const h = consentHarness({ response: 1 });
  h.openWindow({ visible: true }).emit("show");
  await settle();
  assert.deepEqual(h.writes, [{ crashes: true, usage: false }]);
  assert.deepEqual(h.sharing.map(item => item.checked), [true, false]);
});

test("closing the dialog records nothing", async () => {
  const h = consentHarness({ response: 3 });
  h.openWindow({ visible: true }).emit("show");
  await settle();
  assert.deepEqual([h.writes, h.consents], [[], []]);
});

test("an earlier decision means no dialog at all", async () => {
  const h = consentHarness({ decided: true });
  h.openWindow({ visible: true }).emit("show");
  await settle();
  assert.deepEqual(h.shown, []);
  assert.equal(h.app.listenerCount("browser-window-created"), 0);
});

test("an inactive product never asks", async () => {
  const h = consentHarness({ launch: undefined });
  h.openWindow({ visible: true }).emit("show");
  await settle();
  assert.deepEqual(h.shown, []);
});

test("the product is read when the window shows, not when the dialog was armed", async () => {
  const h = consentHarness({ launch: undefined });
  const { product, consents } = fakeProduct({ launch: LAUNCH });
  h.state.product = product;
  h.openWindow({ visible: true }).emit("show");
  await settle();
  assert.equal(h.shown.length, 1);
  assert.equal(consents.length, 1);
});

test("a failed save or a failed dialog shows the sharing error and changes nothing", async () => {
  for (const failure of [{ failWrite: true }, { failDialog: true }]) {
    const h = consentHarness(failure);
    h.openWindow({ visible: true }).emit("show");
    await settle();
    assert.deepEqual(h.errorBoxes, [["Tovu", SHARING_SAVE_ERROR]]);
    assert.deepEqual(h.consents, []);
    assert.deepEqual(h.sharing.map(item => item.checked), [false, false]);
  }
});
