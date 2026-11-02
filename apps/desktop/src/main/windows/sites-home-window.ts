/**
 * @file The sites home window (boot mode 0 — see `main.ts`'s header), extracted from `main.ts`'s
 * `openSitesHomeWindow` so its decisions are verified without Electron: refusing to open when the
 * renderer is not built, where the window reopens, what it remembers on close, which guests may
 * attach and what they get, and that every boundary is in place before the renderer loads.
 * `main.ts` passes a `BrowserWindow` factory, `screen`, `shell`, `dialog`, `app.quit` and the
 * bounds store in.
 */
import { pathToFileURL } from "node:url";

import { admitGuestSource, applyGuestWebPreferences, type GuestWebPreferences } from "../../webview-guest-policy.ts";
import { installSitesHomeNavigationPolicy, type NavigableContents } from "../../window-navigation-policy.ts";
import { resolveWindowBounds, windowBoundsFilePath, type DisplayLike, type WindowBounds } from "../../window-bounds-store.ts";
import type { SpellCheckWebContents } from "../../spellcheck-menu.ts";

/** The sites home window's own `webContents`, as the setup below uses it. */
type SitesHomeWebContents = NavigableContents & SpellCheckWebContents & {
  on(event: "will-attach-webview", listener: (event: { preventDefault(): void }, webPreferences: GuestWebPreferences, params: { src?: unknown }) => void): unknown;
  on(event: "did-attach-webview", listener: (event: unknown, contents: SpellCheckWebContents) => void): unknown;
};

/** The slice of a `BrowserWindow` the sites home setup touches. */
interface SitesHomeWindow {
  webContents: SitesHomeWebContents;
  on(event: "page-title-updated", listener: (event: { preventDefault(): void }) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  isDestroyed(): boolean;
  isFullScreen(): boolean;
  getBounds(): WindowBounds;
  loadFile(filePath: string): Promise<unknown>;
}

/** The `BrowserWindow` options the sites home window is built with. */
interface SitesHomeWindowOptions extends Partial<WindowBounds> {
  minWidth: number;
  minHeight: number;
  title: string;
  show: boolean;
  webPreferences: { contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean; preload: string; webviewTag: boolean };
}

/** Everything the sites home window needs from `main.ts`: paths, native effects and the stores. */
interface SitesHomePorts<W extends SitesHomeWindow> {
  /** The built renderer, `dist/renderer/index.html`. */
  rendererPath: string;
  /** The sites home window's own native-ESM preload. */
  sitesPreloadPath: string;
  /** The speech preload every supervised guest is given. */
  guestPreloadPath: string;
  userDataDir: string;
  fileExists: (filePath: string) => boolean;
  createBrowserWindow: (options: SitesHomeWindowOptions) => W;
  getAllDisplays: () => readonly DisplayLike[];
  readWindowBounds: (args: { boundsPath: string }) => WindowBounds | null;
  writeWindowBounds: (args: { boundsPath: string; bounds: WindowBounds }) => void;
  isSupervisedGuestUrl: (url: string) => boolean;
  openExternal: (url: string) => void;
  relayFindResults: (args: { window: W }) => unknown;
  registerSpellCheck: (args: { webContents: SpellCheckWebContents }) => unknown;
  showErrorBox: (title: string, message: string) => void;
  logError: (message: string) => void;
  setExitCode: (code: number) => void;
  quit: () => void;
}

/** The sites home window's optional inputs. */
interface SitesHomeOptions<W> {
  selftest?: boolean;
  trackWindow?: (window: W) => void;
}

/**
 * The missing-renderer path: say why where it can be seen, mark the run failed, and quit rather than
 * open a blank window on a source-only checkout. No dialog in a self-test — nobody is there to
 * dismiss it.
 * @complexity O(1).
 */
function reportMissingRenderer<W extends SitesHomeWindow>(
  { ports }: { ports: SitesHomePorts<W> },
  { selftest = false }: { selftest?: boolean } = {},
): void {
  const message = `The sites home UI is not built. Run \`npm run build\` in apps/desktop, or unset TOVU_DESKTOP_UI to launch a site instead.\n\nExpected: ${ports.rendererPath}`;
  ports.logError(`tovu desktop: ${message}`);
  ports.setExitCode(1);
  if (!selftest) ports.showErrorBox("Tovu could not start", message);
  ports.quit();
}

/**
 * The constructor options: the remembered bounds when a current display still shows them, the
 * owner's floors, and the two webPreferences that differ from the admin window's.
 * @complexity O(n) in displays.
 */
function sitesHomeWindowOptions<W extends SitesHomeWindow>(
  { ports, boundsPath }: { ports: SitesHomePorts<W>; boundsPath: string },
  { selftest = false }: { selftest?: boolean } = {},
): SitesHomeWindowOptions {
  // Reopen where the operator left it, on whichever display still has it — `resolveWindowBounds`
  // is what refuses a remembered spot that no display covers anymore (an unplugged monitor), so
  // this never seeds the constructor with an off-screen `x`/`y`. See `window-bounds-store.ts`.
  const resolvedBounds = resolveWindowBounds({
    stored: ports.readWindowBounds({ boundsPath }),
    displays: ports.getAllDisplays(),
    fallback: { width: 1360, height: 900 },
  });
  return {
    ...resolvedBounds,
    /**
     * Floors, not a preference — a window with no minimum can be dragged to a width nothing has
     * an answer for.
     *
     * 480 is the owner's choice as of 2026-09-12, made after they verified the previous 960 in the
     * real window. Layout between 480 and 960 has not been measured.
     */
    minWidth: 480,
    minHeight: 600,
    title: "Tovu",
    show: !selftest,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: ports.sitesPreloadPath,
      webviewTag: true,
    },
  };
}

/** Remember the window's spot for next launch, unless it is gone or full screen. @complexity O(1). */
function rememberBounds<W extends SitesHomeWindow>(
  { window, ports, boundsPath }: { window: W; ports: SitesHomePorts<W>; boundsPath: string },
  _optional = {},
): void {
  if (window.isDestroyed() || window.isFullScreen()) return;
  ports.writeWindowBounds({ boundsPath, bounds: window.getBounds() });
}

/** The project tabs' `<webview>` guests: who may attach, and what each one gets. @complexity O(1) registration. */
function installGuestAttachPolicy<W extends SitesHomeWindow>({ window, ports }: { window: W; ports: SitesHomePorts<W> }, _optional = {}): void {
  // The guest gets the shell's OWN speech preload, not none (D-10) — see
  // `webview-guest-policy.ts` for why assigning is strictly stronger than the `delete` this
  // replaced, and for the symptom it fixes: the embedded admin telling the operator that voice
  // input needs the desktop app, from inside the desktop app. That grant is only safe on a supervised
  // site's origin, so a guest pointed anywhere else is refused before it attaches.
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    if (!admitGuestSource(event, params, { isAllowedSource: ports.isSupervisedGuestUrl })) return;
    applyGuestWebPreferences(webPreferences, { preloadPath: ports.guestPreloadPath });
  });

  // The right-click spelling-suggestions menu for a project tab's own editing surface (the embedded
  // site admin — `FormEditor`, page content, etc.) — a CMS, where people write real prose. Electron
  // hands back the guest's own `webContents` on attach; `spellcheck` itself needs no toggle here,
  // Electron's own `webPreferences` default (`spellcheck: true`) already covers it.
  window.webContents.on("did-attach-webview", (_event, contents) => {
    ports.registerSpellCheck({ webContents: contents });
  });
}

/**
 * Open the sites home UI, ported from Tovu-Runner (the Projects screen). Boot mode 0 — see `main.ts`'s header.
 *
 * Two webPreferences differ from the admin window (`app-window.ts`). `sandbox: false` is forced by
 * the renderer rather than chosen: the sites preload is a native-ESM preload and Electron 43 loads
 * one only in an unsandboxed renderer. `webviewTag: true` is what lets a project tab embed that
 * site's own `tovu serve` output in a `<webview>` inside THIS window (`App.tsx`'s `SiteWorkspace`) —
 * matching Tovu-Runner's own `main.ts`, which needs the same tag for the same reason.
 *
 * `webviewTag` on its own lets the PAGE choose the guest's `webPreferences` via attributes. Runner
 * writes those attributes today (partition aside — see `SiteWorkspace`'s own doc on why this
 * shell's guest sets one and Runner's does not), and `will-attach-webview` ({@link installGuestAttachPolicy})
 * is the boundary that keeps that trustworthy: the guest never gets Node, never gets this window's
 * own preload, and can never re-enable either from inside the page. `guest-navigation.ts`'s
 * `installWebviewGuestPolicy` (registered once, before this function, from the sites-home boot
 * branch) is the other half — see its own doc.
 *
 * @returns the window, or `null` when the renderer has not been built yet.
 * @complexity O(1).
 */
function openSitesHomeWindow<W extends SitesHomeWindow>(
  { ports }: { ports: SitesHomePorts<W> },
  { selftest = false, trackWindow }: SitesHomeOptions<W> = {},
): W | null {
  if (!ports.fileExists(ports.rendererPath)) {
    reportMissingRenderer({ ports }, { selftest });
    return null;
  }

  const boundsPath = windowBoundsFilePath({ userDataDir: ports.userDataDir });
  const window = ports.createBrowserWindow(sitesHomeWindowOptions({ ports, boundsPath }, { selftest }));

  trackWindow?.(window);
  window.on("page-title-updated", (event) => event.preventDefault());

  // Remembers the spot for NEXT launch. `close` (not `closed`): bounds are still readable right up
  // to that event, and skipped in full screen — that rectangle is the whole display, not a size the
  // operator chose and would want restored.
  window.on("close", () => rememberBounds({ window, ports, boundsPath }));

  // The find bar's top-level target (`find-in-page-ipc.ts`) — the Projects screen itself, when no
  // project tab's own `<webview>` is the visible surface. See `contracts/find-in-page.ts`'s header.
  ports.relayFindResults({ window });

  // The right-click spelling-suggestions menu for the Projects screen's own text fields (site
  // names, search boxes). A project tab's own editing surface is the GUEST, wired separately.
  ports.registerSpellCheck({ webContents: window.webContents });

  installGuestAttachPolicy({ window, ports });

  // Only the renderer's own file may load in this window: it holds the `tovuRunner` bridge with
  // `sandbox: false`, and the page's CSP does not follow a navigation (a dropped link, say) to
  // another page. See `window-navigation-policy.ts`.
  installSitesHomeNavigationPolicy(window.webContents, {
    rendererFileUrl: pathToFileURL(ports.rendererPath).href,
    openExternal: ports.openExternal,
  });

  void window.loadFile(ports.rendererPath);
  return window;
}

export { openSitesHomeWindow, sitesHomeWindowOptions };
export type { SitesHomePorts, SitesHomeOptions, SitesHomeWindow, SitesHomeWindowOptions, SitesHomeWebContents };
