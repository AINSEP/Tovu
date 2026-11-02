/**
 * @file Behaviour of the desktop launch order (`boot-sequence.ts`): which step runs before which,
 * which boot mode gets the hand-off, the sites-home registration order, and the single-window Dock
 * reopen. Replaces the source-text order checks that read `src/main/index.ts`'s `whenReady` block
 * (`main-shutdown-wiring`'s signal-arming order, `main-project-wiring`'s migration-before-mode-split
 * and discovery-before-window checks, `main-owner-store-wiring`'s settle-after-IPC check,
 * `site-history-menu`'s menu-before-window checks and `main-updater-wiring`'s non-blocking start).
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { QuitPhase } from "@jini-ai/desktop-host/shutdown";
import type { BootMode } from "./boot-steps.ts";
import {
  appWideMenuTemplate, bootInMode, openSingleWindow, runDesktopBoot, runSitesHomeBoot,
  type DesktopBootPorts, type SingleWindowPorts, type SitesHomeBootPorts,
} from "./boot-sequence.ts";

/** A promise the test settles by hand, to observe what a step's caller does while it is pending. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function desktopPorts(mode: BootMode, overrides: Partial<DesktopBootPorts> = {}) {
  const calls: string[] = [];
  const step = (name: string) => () => { calls.push(name); };
  const asyncStep = (name: string) => async () => { calls.push(name); };
  const ports: DesktopBootPorts = {
    armQuitSignals: step("armQuitSignals"),
    initializeProductTelemetry: asyncStep("initializeProductTelemetry"),
    registerAppWideIpc: step("registerAppWideIpc"),
    applyDockIcon: step("applyDockIcon"),
    installAppWideMenu: step("installAppWideMenu"),
    startUpdaterInBackground: step("startUpdaterInBackground"),
    reconcileOrphansOnBoot: asyncStep("reconcileOrphansOnBoot"),
    migrateNestedSitesHome: asyncStep("migrateNestedSitesHome"),
    chooseBootMode: () => { calls.push("chooseBootMode"); return mode; },
    bootSitesHomeMode: step("bootSitesHomeMode"),
    bootAttachMode: ({ url }) => { calls.push(`bootAttachMode:${url}`); },
    bootOwnServerMode: asyncStep("bootOwnServerMode"),
    ...overrides,
  };
  return { ports, calls };
}

const SHARED_STEPS = [
  "armQuitSignals", "initializeProductTelemetry", "registerAppWideIpc", "applyDockIcon", "installAppWideMenu",
  "startUpdaterInBackground", "reconcileOrphansOnBoot", "migrateNestedSitesHome", "chooseBootMode",
];

test("every mode runs the shared steps in launch order, then exactly its own boot", async () => {
  const cases: [BootMode, string][] = [
    [{ kind: "sites-home" }, "bootSitesHomeMode"],
    [{ kind: "attach", url: "http://127.0.0.1:4100" }, "bootAttachMode:http://127.0.0.1:4100"],
    [{ kind: "own-server" }, "bootOwnServerMode"],
  ];
  for (const [mode, boot] of cases) {
    const { ports, calls } = desktopPorts(mode);
    await runDesktopBoot({ ports });
    assert.deepEqual(calls, [...SHARED_STEPS, boot], mode.kind);
  }
});

test("termination signals are armed before any step that can spawn a tovu serve", async () => {
  // The orphaned tovu serve after `kill -TERM <dev-desktop>`: Chromium's own SIGTERM/SIGINT/SIGHUP
  // handler is one-shot (it resets SIG_DFL), and every launcher delivers the signal more than once —
  // the group kill plus electron/cli.js's forward. The second copy killed Electron before
  // before-quit's drain had stopped its detached children.
  const { ports, calls } = desktopPorts({ kind: "own-server" });
  await runDesktopBoot({ ports });
  assert.equal(calls[0], "armQuitSignals");
  assert.ok(calls.indexOf("armQuitSignals") < calls.indexOf("reconcileOrphansOnBoot"));
});

test("the nested-home migration runs after the orphan reap and before the boot mode is even chosen", async () => {
  // The flat-home reversal of 59a036e49: no mode may open a database before the move.
  const reap = deferred();
  const { ports, calls } = desktopPorts({ kind: "sites-home" }, {
    reconcileOrphansOnBoot: () => { calls.push("reconcileOrphansOnBoot"); return reap.promise; },
  });
  const boot = runDesktopBoot({ ports });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls.includes("migrateNestedSitesHome"), false, "the migration waits for the reap");
  reap.resolve();
  await boot;
  assert.ok(calls.indexOf("migrateNestedSitesHome") < calls.indexOf("chooseBootMode"));
});

test("the updater is started without awaiting it: the boot goes on while it loads", async () => {
  let started = 0;
  const { ports, calls } = desktopPorts({ kind: "own-server" }, { startUpdaterInBackground: () => { started += 1; } });
  await runDesktopBoot({ ports });
  assert.equal(started, 1);
  assert.equal(calls.at(-1), "bootOwnServerMode");
});

test("a failing awaited step rejects the boot and runs nothing after it", async () => {
  const { ports, calls } = desktopPorts({ kind: "sites-home" }, {
    initializeProductTelemetry: async () => { calls.push("initializeProductTelemetry"); throw new Error("telemetry down"); },
  });
  await assert.rejects(runDesktopBoot({ ports }), /telemetry down/);
  assert.deepEqual(calls, ["armQuitSignals", "initializeProductTelemetry"]);
});

test("own-server mode's rejection reaches the boot's caller", async () => {
  const { ports } = desktopPorts({ kind: "own-server" }, { bootOwnServerMode: async () => { throw new Error("no site"); } });
  await assert.rejects(runDesktopBoot({ ports }), /no site/);
});

test("an unknown boot mode is a boot failure, never a silent windowless launch", async () => {
  const { ports, calls } = desktopPorts({ kind: "sites-home" });
  const unknown = { kind: "kiosk" } as unknown as BootMode;
  await assert.rejects(bootInMode({ mode: unknown, ports }), /unknown boot mode \{"kind":"kiosk"\}/);
  assert.deepEqual(calls, []);
});

test("the app-wide menu keeps the sites-home menus and appends Settings, read after them", () => {
  for (const platform of ["darwin", "linux", "win32"] as const) {
    const order: string[] = [];
    const template = appWideMenuTemplate({ platform, settings: () => { order.push("settings"); return { label: "Settings" }; } });
    const roles = template.map((entry) => ("role" in entry ? entry.role : entry.label));
    const home = ["fileMenu", "editMenu", "View", "History", "Find", "windowMenu", "help", "Settings"];
    assert.deepEqual(roles, platform === "darwin" ? ["appMenu", ...home] : home, platform);
    assert.deepEqual(order, ["settings"]);
  }
});

function windowPorts(overrides: Partial<SingleWindowPorts> = {}) {
  const calls: string[] = [];
  let activate: (() => void) | null = null;
  const state = { windows: 0, phase: "idle" as QuitPhase };
  const ports: SingleWindowPorts = {
    selftest: false,
    installSelftestTracker: ({ expectedCount }) => { calls.push(`tracker:${expectedCount}`); },
    openWindow: () => { calls.push("open"); },
    onActivate: (listener) => { calls.push("onActivate"); activate = listener; },
    windowCount: () => state.windows,
    quitPhase: () => state.phase,
    ...overrides,
  };
  return { ports, calls, state, activate: () => { assert.ok(activate, "no activate listener"); activate(); } };
}

test("a single-window mode opens its window once and listens for the Dock", () => {
  const w = windowPorts();
  openSingleWindow({ ports: w.ports });
  assert.deepEqual(w.calls, ["open", "onActivate"]);
});

test("under self-test the tracker expecting one window is installed before the window opens", () => {
  const w = windowPorts({ selftest: true });
  openSingleWindow({ ports: w.ports });
  assert.deepEqual(w.calls, ["tracker:1", "open", "onActivate"]);
});

test("a Dock click reopens only with no window left and no quit draining, reading both at click time", () => {
  const w = windowPorts();
  openSingleWindow({ ports: w.ports });
  w.calls.length = 0;
  w.state.windows = 1;
  w.activate();
  assert.deepEqual(w.calls, [], "a window is still open");
  w.state.windows = 0;
  w.state.phase = "draining";
  w.activate();
  assert.deepEqual(w.calls, [], "a quit is draining");
  w.state.phase = "idle";
  w.activate();
  assert.deepEqual(w.calls, ["open"]);
});

function sitesHomePorts(overrides: Partial<SitesHomeBootPorts<{ id: string }>> = {}) {
  const w = windowPorts();
  const step = (name: string) => () => { w.calls.push(name); };
  const deps = { id: "deps" };
  const handed: { handlers?: unknown; discovery?: unknown } = {};
  const ports: SitesHomeBootPorts<{ id: string }> = {
    ...w.ports,
    settleDevFallbackRows: step("settleDevFallbackRows"),
    buildProjectDeps: () => { w.calls.push("buildProjectDeps"); return deps; },
    registerSiteIpcHandlers: (value) => { w.calls.push("registerSiteIpcHandlers"); handed.handlers = value; },
    startSiteDiscovery: (value) => { w.calls.push("startSiteDiscovery"); handed.discovery = value; },
    registerAppVersionIpc: step("registerAppVersionIpc"),
    registerResourcesIpc: step("registerResourcesIpc"),
    registerOwnerStoreIpc: step("registerOwnerStoreIpc"),
    settleLegacyOwnerStore: step("settleLegacyOwnerStore"),
    registerUpdateCheckIpc: step("registerUpdateCheckIpc"),
    registerRunnerIpcStubs: step("registerRunnerIpcStubs"),
    registerGuestNavigationPolicy: step("registerGuestNavigationPolicy"),
    installMenu: step("installMenu"),
    ...overrides,
  };
  return { ...w, ports, deps, handed };
}

test("sites home registers everything in order, installs the menu, then opens its one window", () => {
  const s = sitesHomePorts();
  runSitesHomeBoot({ ports: s.ports });
  assert.deepEqual(s.calls, [
    "settleDevFallbackRows", "buildProjectDeps", "registerSiteIpcHandlers", "startSiteDiscovery",
    "registerAppVersionIpc", "registerResourcesIpc", "registerOwnerStoreIpc", "settleLegacyOwnerStore",
    "registerUpdateCheckIpc", "registerRunnerIpcStubs", "registerGuestNavigationPolicy", "installMenu",
    "open", "onActivate",
  ]);
});

test("the handlers and the boot discovery scan get the SAME deps object", () => {
  // Two separately-built deps could drift in `projectsPath` or `classifySiteDir` and the only
  // symptom would be a site that never appears — no error anywhere.
  const s = sitesHomePorts();
  runSitesHomeBoot({ ports: s.ports });
  assert.equal(s.handed.handlers, s.deps);
  assert.equal(s.handed.discovery, s.deps);
});

test("the legacy owner-store check runs once, after the shared-key IPC is registered", () => {
  const s = sitesHomePorts();
  runSitesHomeBoot({ ports: s.ports });
  assert.equal(s.calls.filter((call) => call === "settleLegacyOwnerStore").length, 1);
  assert.ok(s.calls.indexOf("registerOwnerStoreIpc") < s.calls.indexOf("settleLegacyOwnerStore"));
});

test("the real site handlers claim their channels before the runner stubs", () => {
  const s = sitesHomePorts();
  runSitesHomeBoot({ ports: s.ports });
  assert.ok(s.calls.indexOf("registerSiteIpcHandlers") < s.calls.indexOf("registerRunnerIpcStubs"));
});

test("sites home under self-test installs the tracker after the menu and before the window", () => {
  const s = sitesHomePorts({ selftest: true });
  runSitesHomeBoot({ ports: s.ports });
  assert.deepEqual(s.calls.slice(-4), ["installMenu", "tracker:1", "open", "onActivate"]);
});
