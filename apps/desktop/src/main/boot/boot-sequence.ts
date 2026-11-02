/**
 * @file The ORDER `src/main/index.ts`'s `whenReady` launch runs in, and which boot mode it hands off
 * to. Every step is a port: Electron, IPC registration, the updater and the site windows stay in
 * `index.ts`. What lives here is only the sequence — which step must run before which, and why — so
 * it runs against fakes instead of being pinned by reading `index.ts` as text.
 */
import type { QuitPhase } from "@jini-ai/desktop-host/shutdown";
import { sitesHomeMenuTemplate, type SitesHomeMenuEntry } from "../../site-history-menu.ts";
import type { BootMode } from "./boot-steps.ts";
import { shouldReopenOnActivate } from "./own-server-boot.ts";

/** The three boot modes' entry points — `boot-steps.ts`'s `chooseBootMode` picks one. */
export interface BootModePorts {
  bootSitesHomeMode: () => void;
  bootAttachMode: (input: { url: string }) => void;
  bootOwnServerMode: () => Promise<void>;
}

/** Every launch step `runDesktopBoot` sequences, bound to Electron by `index.ts`. */
export interface DesktopBootPorts extends BootModePorts {
  armQuitSignals: () => void;
  initializeProductTelemetry: () => Promise<void>;
  registerAppWideIpc: () => void;
  applyDockIcon: () => void;
  installAppWideMenu: () => void;
  startUpdaterInBackground: () => void;
  reconcileOrphansOnBoot: () => Promise<void>;
  migrateNestedSitesHome: () => Promise<void>;
  /** `boot-steps.ts`'s `chooseBootMode`, bound to `process.env`. */
  chooseBootMode: () => BootMode;
}

/**
 * The desktop launch, from `app.whenReady()` to the chosen boot mode. A rejection from any step is
 * the caller's `reportBootFailure`.
 * @complexity O(1).
 */
export async function runDesktopBoot({ ports }: { ports: DesktopBootPorts }, _optional = {}): Promise<void> {
  // First, before anything below can spawn a `tovu serve`: a termination signal must reach
  // `before-quit`'s drain exactly once rather than kill Electron on its second copy. Here and not at
  // module load, where Chromium's own one-shot handler replaces it. See `quit-signals.ts`, and
  // `QUIT_DEADLINE_MS` for what the deadline does and does not cover.
  ports.armQuitSignals();
  await ports.initializeProductTelemetry();

  // Before the updater and any site server: a successful move quits this process at once.
  // Owner 2026-10-06: DMG window already shows drag-to-Applications; prompt redundant.
  // Restore the call, helper and imports from git history, then re-enable wiring tests.

  ports.registerAppWideIpc();
  ports.applyDockIcon();
  // App-wide Settings is available in attach mode too; own-server mode replaces this below.
  ports.installAppWideMenu();
  // Not awaited: the updater's first check waits on its own timer, and a failure to load it must
  // never block or fail the boot.
  ports.startUpdaterInBackground();

  // ABOVE the mode split, deliberately: the sites home UI writes crash-safety rows (every project tab's
  // first open goes through `openSiteServer`) but used to read none back, so a hard kill leaked
  // every open site's `tovu serve` forever. See `reconcileOrphansOnBoot`'s own doc for why running
  // it for all three modes is correct and why it cannot reap a live sibling instance's children.
  await ports.reconcileOrphansOnBoot();

  // Before any boot mode opens a database: reuse the stopped/verified CLI move owner.
  await ports.migrateNestedSitesHome();

  await bootInMode({ mode: ports.chooseBootMode(), ports });
}

/**
 * Hand off to the chosen mode. Exhaustive: a new {@link BootMode} kind fails to compile here, and an
 * unknown one at run time is a boot failure rather than a silent no-window launch.
 * @complexity O(1).
 */
export async function bootInMode({ mode, ports }: { mode: BootMode; ports: BootModePorts }, _optional = {}): Promise<void> {
  switch (mode.kind) {
    case "sites-home":
      ports.bootSitesHomeMode();
      return;
    case "attach":
      ports.bootAttachMode({ url: mode.url });
      return;
    case "own-server":
      await ports.bootOwnServerMode();
      return;
    default: {
      const unknownMode: never = mode;
      throw new Error(`tovu desktop: unknown boot mode ${JSON.stringify(unknownMode)}`);
    }
  }
}

/**
 * Electron's default menu, rebuilt, plus History: Back (Cmd+[) and Forward (Cmd+]) for the visible
 * project tab, then Settings. A menu accelerator still fires with focus inside a tab's guest. See
 * `site-history-menu.ts`. `settings` is a thunk so it is read after the home menus, as the inline
 * template always did.
 * @complexity O(1).
 */
export function appWideMenuTemplate<Settings>({ platform, settings }: { platform: NodeJS.Platform; settings: () => Settings }, _optional = {}): (SitesHomeMenuEntry | Settings)[] {
  return [...sitesHomeMenuTemplate({ platform }), settings()];
}

/** Opening a single-window mode's window, and reopening it from the Dock. */
export interface SingleWindowPorts {
  selftest: boolean;
  installSelftestTracker: (input: { expectedCount: number }) => void;
  openWindow: () => void;
  onActivate: (listener: () => void) => void;
  windowCount: () => number;
  quitPhase: () => QuitPhase;
}

/**
 * Sites home and attach mode are always exactly one window: the self-test tracker is created before
 * it opens (it registers every window at creation time — see `selftest-tracker.ts`), and a Dock
 * click with no window left and no quit draining opens it again.
 * @complexity O(1).
 */
export function openSingleWindow({ ports }: { ports: SingleWindowPorts }, _optional = {}): void {
  if (ports.selftest) ports.installSelftestTracker({ expectedCount: 1 });
  ports.openWindow();
  ports.onActivate(() => {
    if (shouldReopenOnActivate({ windowCount: ports.windowCount(), quitPhase: ports.quitPhase() })) ports.openWindow();
  });
}

/** The sites-home steps, in `runSitesHomeBoot`'s order. `Deps` is `project-ipc.ts`'s deps bag. */
export interface SitesHomeBootPorts<Deps> extends SingleWindowPorts {
  settleDevFallbackRows: () => void;
  buildProjectDeps: () => Deps;
  registerSiteIpcHandlers: (deps: Deps) => void;
  startSiteDiscovery: (deps: Deps) => void;
  registerAppVersionIpc: () => void;
  registerResourcesIpc: () => void;
  registerOwnerStoreIpc: () => void;
  settleLegacyOwnerStore: () => void;
  registerUpdateCheckIpc: () => void;
  registerRunnerIpcStubs: () => void;
  registerGuestNavigationPolicy: () => void;
  installMenu: () => void;
}

/**
 * Sites home mode. It spawns no `tovu serve` of its own at boot — only when a project tab is first
 * opened, through `openSiteServer`'s own `serializer`-guarded spawn-or-reuse (the sites-home
 * counterpart of the `openSiteWindow` own-server mode uses).
 * @complexity O(1).
 */
export function runSitesHomeBoot<Deps>({ ports }: { ports: SitesHomeBootPorts<Deps> }, _optional = {}): void {
  // Migrate legacy dismissals, then seed and retire the dev-fallback card — see `settleDevFallbackRows`.
  ports.settleDevFallbackRows();
  // Built once and shared: `rescanSites` needs the same `deps` the handlers get, and a second
  // literal would be free to drift from this one in exactly the fields (`projectsPath`,
  // `classifySiteDir`, the scan inputs) where drift is invisible until a site fails to appear.
  const projectDeps = ports.buildProjectDeps();
  // Registered BEFORE the stubs: `ipcMain.handle` throws on a duplicate registration, so these
  // real handlers must claim their channels first — see `project-ipc.ts`'s own header.
  ports.registerSiteIpcHandlers(projectDeps);
  // The boot discovery pass, and the answer to "a site created by `tovu init` outside the shell
  // never appears": until this existed the Projects screen rendered `desktop-projects.json` and
  // nothing else. The read-only worker starts here without delaying the window; the normal
  // list poll picks up its discoveries. A stalled/removable volume cannot hold boot hostage.
  ports.startSiteDiscovery(projectDeps);
  ports.registerAppVersionIpc();
  ports.registerResourcesIpc();
  ports.registerOwnerStoreIpc();
  // After the shared-key IPC is registered, so the import its notice offers has a handler.
  ports.settleLegacyOwnerStore();
  ports.registerUpdateCheckIpc();
  ports.registerRunnerIpcStubs();
  // Global, not per-window: see `registerGuestNavigationPolicy`'s own doc for why one
  // registration covers every project tab's `<webview>` guest.
  ports.registerGuestNavigationPolicy();
  // Before the window opens — see `appWideMenuTemplate`.
  ports.installMenu();
  openSingleWindow({ ports });
}
