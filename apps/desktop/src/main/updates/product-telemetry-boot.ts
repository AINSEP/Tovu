/**
 * Boots the desktop's product telemetry (consent-gated crash reports and usage) and arms the
 * first-run sharing dialog. Electron's `app`, `ipcMain`, `crashReporter`, `dialog`, `Menu` and the
 * process metadata arrive as ports; the existing telemetry modules stay the owners of every rule
 * this only sequences.
 */
import type { MessageBoxOptions } from "electron";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import { installProcessErrorReporting, installUnhandledRejectionGuard } from "../../../../website/src/server/runtime/boot/process-error-guards.ts";
import { resolveTovuObservabilityExport } from "../../../../website/src/server/runtime/composition/observability-export.ts";
import { bootDesktopProductTelemetry, desktopProductLaunch, reportDesktopProcessGone } from "../../product-telemetry.ts";
import type { DesktopProductTelemetry } from "../../product-telemetry.ts";
import {
  createProductConsentReader,
  offerProductTelemetryConsent,
  readProductTelemetryPreference,
  writeProductTelemetryPreference,
} from "../../product-telemetry-preference.ts";
import { registerProductTelemetryIpc } from "../../product-telemetry-ipc.ts";
import { startProductMemoryTelemetry } from "../../product-memory-telemetry.ts";
import { startVisibleInterval } from "../../renderer/visible-interval.ts";
import type { VisibilitySource } from "../../renderer/visible-interval.ts";
import { refreshProductMenu, SHARING_SAVE_ERROR } from "./settings-menu.ts";
import type { ApplicationMenuPort } from "./settings-menu.ts";

/** What `main.ts` held in `desktopProduct` and `productDisposers`; `before-quit` drains both. */
export interface DesktopProductState {
  product: DesktopProductTelemetry;
  disposers: (() => void)[];
}

/** A no-op product until boot: every boot mode reads `state.product.tracker` safely. */
export function createDesktopProductState(_requiredArgs = {}, _optionalArgs = {}): DesktopProductState {
  return {
    product: { tracker: createNoopTracker({}), launch: undefined, consentChanged() {}, async dispose() {} },
    disposers: [],
  };
}

/** Squirrel/electron-updater relaunch the app with one of these flags after installing. */
export function desktopLaunchMode({ argv }: { argv: readonly string[] }, _optionalArgs = {}): "update" | "fresh" {
  return argv.some(arg => arg === "--squirrel-updated" || arg === "--updated") ? "update" : "fresh";
}

/** Electron's `app` events this module listens to; Electron's `app` satisfies it. */
export interface ProductAppPort {
  isPackaged: boolean;
  getVersion(): string;
  on(event: "render-process-gone", listener: (event: unknown, contents: unknown, details: { reason: string }) => void): unknown;
  on(event: "child-process-gone", listener: (event: unknown, details: { type: string; reason: string }) => void): unknown;
  on(event: "browser-window-focus" | "browser-window-blur", listener: () => void): unknown;
  off(event: "browser-window-focus" | "browser-window-blur", listener: () => void): unknown;
}

/**
 * The main process has no `document`: a focused app window counts as visible, so the memory sampler
 * pauses while the app is in the background. @complexity O(1).
 */
export function focusVisibility({ app, windows }: {
  app: Pick<ProductAppPort, "on" | "off">; windows: { getFocusedWindow(): unknown };
}, _optionalArgs = {}): VisibilitySource {
  return {
    get visibilityState() { return windows.getFocusedWindow() ? "visible" : "hidden"; },
    addEventListener: (_type, listener) => { app.on("browser-window-focus", listener); app.on("browser-window-blur", listener); },
    removeEventListener: (_type, listener) => { app.off("browser-window-focus", listener); app.off("browser-window-blur", listener); },
  };
}

/** The process metadata boot reads; Electron's `process` satisfies it. */
export interface ProductProcessPort {
  pid: number;
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  resourcesPath: string;
  memoryUsage(): { heapUsed: number };
  uptime(): number;
}

export interface ProductTelemetryBootArgs {
  app: ProductAppPort;
  processInfo: ProductProcessPort;
  crashReporter: Parameters<typeof bootDesktopProductTelemetry>[0]["crashReporter"];
  ipcMain: Parameters<typeof registerProductTelemetryIpc>[0]["ipcMain"];
  webContents: { getAllWebContents(): { getOSProcessId(): number }[] };
  windows: { getFocusedWindow(): unknown };
  preferencePath: string;
  /** The shell-page predicate speech uses; product IPC narrows it to `file:` pages. */
  isShellPage: (url: string) => boolean;
  monitor: Parameters<typeof startProductMemoryTelemetry>[0]["monitor"];
  state: DesktopProductState;
  /** Arms the first-run dialog; called only when product telemetry booted with a launch config. */
  armConsent: () => void;
}

export interface ProductTelemetryBootOptions {
  boot?: typeof bootDesktopProductTelemetry;
  observabilityExport?: typeof resolveTovuObservabilityExport;
  installRejectionGuard?: () => unknown;
  installErrorReporting?: typeof installProcessErrorReporting;
  registerIpc?: typeof registerProductTelemetryIpc;
  startMemory?: typeof startProductMemoryTelemetry;
  schedule?: typeof startVisibleInterval;
}

/** Product IPC and process-gone reports; registered for every boot, launch config or not. */
function wireProcessReports({ app, ipcMain, isShellPage, state }: ProductTelemetryBootArgs, {
  installRejectionGuard = installUnhandledRejectionGuard,
  installErrorReporting = installProcessErrorReporting,
  registerIpc = registerProductTelemetryIpc,
}: ProductTelemetryBootOptions): void {
  // The reporter's rejection listener alone would silence Electron's own rejection warning; the
  // guard keeps every rejection in the main log for the process's whole life (never disposed).
  installRejectionGuard();
  state.disposers.push(installErrorReporting({ tracker: state.product.tracker, processRole: "desktop-main" }));
  // Speech's shared predicate also admits supervised admin origins; product IPC is shell-only.
  state.disposers.push(registerIpc({ ipcMain,
    isShellPage: url => isShellPage(url) && url.startsWith("file:"), tracker: state.product.tracker }));
  app.on("render-process-gone", (_event, _contents, details) => reportDesktopProcessGone({ tracker: state.product.tracker, type: "renderer", reason: details.reason }));
  app.on("child-process-gone", (_event, details) => reportDesktopProcessGone({ tracker: state.product.tracker, type: details.type, reason: details.reason }));
}

/** Memory observations, sampled only while an app window is focused. */
function startMemorySampling(args: ProductTelemetryBootArgs, readConsent: ReturnType<typeof createProductConsentReader>, {
  startMemory = startProductMemoryTelemetry,
  schedule = startVisibleInterval,
}: ProductTelemetryBootOptions): void {
  const { app, processInfo, webContents, windows, monitor, state } = args;
  const visibility = focusVisibility({ app, windows });
  const memory = startMemory({ monitor, tracker: state.product.tracker, readConsent,
    desktopPid: processInfo.pid, rendererPids: () => new Set(webContents.getAllWebContents().map(contents => contents.getOSProcessId())),
    heapUsedBytes: () => processInfo.memoryUsage().heapUsed, uptime: () => processInfo.uptime(),
  }, { schedule: (tick, ms) => schedule(tick, ms, visibility) });
  state.disposers.push(memory.dispose);
}

/**
 * Bind the approved product ports before a window or child can send a signal.
 * Writes the booted product and every disposer into `state` as it goes, so a later step's throw
 * still leaves the earlier ones for `before-quit` to dispose.
 * @complexity O(1) beyond the injected boot.
 */
export async function initializeDesktopProductTelemetry(args: ProductTelemetryBootArgs, options: ProductTelemetryBootOptions = {}): Promise<void> {
  const { app, processInfo, crashReporter, preferencePath, state, armConsent } = args;
  const { boot = bootDesktopProductTelemetry, observabilityExport = resolveTovuObservabilityExport } = options;
  const readConsent = createProductConsentReader({ preferencePath });
  const launch = desktopProductLaunch({ isPackaged: app.isPackaged, resourcesPath: processInfo.resourcesPath,
    preferencePath, version: app.getVersion(), env: processInfo.env });
  state.product = await boot({ launch, readConsent, crashReporter,
    observabilityExportEnabled: observabilityExport({ env: processInfo.env, packagedDesktop: app.isPackaged }),
    launchMode: desktopLaunchMode({ argv: processInfo.argv }) });
  wireProcessReports(args, options);
  if (!state.product.launch) return;
  startMemorySampling(args, readConsent, options);
  armConsent();
}

/** A window the consent dialog can follow; Electron's `BrowserWindow` satisfies it. */
export interface ConsentWindow {
  isVisible(): boolean;
  once(event: "show", listener: () => void): unknown;
  webContents: { once(event: "did-finish-load", listener: () => void): unknown };
}

export interface ConsentAppPort<W extends ConsentWindow> {
  on(event: "browser-window-created", listener: (event: unknown, window: W) => void): unknown;
  off(event: "browser-window-created", listener: (event: unknown, window: W) => void): unknown;
}

export interface ConsentDialogPort<W> {
  showMessageBox(window: W, options: MessageBoxOptions): Promise<{ response: number }>;
  showErrorBox(title: string, content: string): void;
}

/**
 * Native consent follows the first visible window, including own-server/attach modes.
 * Asked at most once per launch; closing the dialog records nothing and asks again next launch.
 * @complexity O(1) per window event.
 */
export function armFirstProductConsent<W extends ConsentWindow>({ app, dialog, menu, preferencePath, state }: {
  app: ConsentAppPort<W>; dialog: ConsentDialogPort<W>; menu: ApplicationMenuPort;
  preferencePath: string; state: Pick<DesktopProductState, "product">;
}, {
  readSharing = readProductTelemetryPreference,
  writeSharing = writeProductTelemetryPreference,
}: {
  readSharing?: typeof readProductTelemetryPreference;
  writeSharing?: typeof writeProductTelemetryPreference;
} = {}): void {
  let offered = false;
  const onWindow = (_event: unknown, window: W) => {
    const offer = () => {
      if (offered || !window.isVisible()) return;
      offered = true;
      app.off("browser-window-created", onWindow);
      void offerProductTelemetryConsent({ active: Boolean(state.product.launch),
        preference: readSharing({ preferencePath }),
        show: options => dialog.showMessageBox(window, options),
        save: patch => {
          const saved = writeSharing({ preferencePath, patch });
          state.product.consentChanged(saved);
          refreshProductMenu({ menu, preferencePath }, { readSharing });
        },
      }).catch(() => dialog.showErrorBox("Tovu", SHARING_SAVE_ERROR));
    };
    window.once("show", offer);
    window.webContents.once("did-finish-load", offer);
  };
  app.on("browser-window-created", onWindow);
}
