/**
 * @file The standalone admin window (own-server and attach modes), extracted from `main.ts`'s
 * `createWindow` so its option choices and its setup ORDER — self-test tracking, title pinning and
 * the navigation boundary all before the first load — are verified without Electron. `main.ts`
 * passes a `BrowserWindow` factory and `shell.openExternal` in.
 */
import { installAppWindowNavigationPolicy, type NavigableContents } from "../../window-navigation-policy.ts";

/** The `BrowserWindow` options {@link createAppWindow} builds. */
interface AppWindowOptions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  title: string;
  show: boolean;
  webPreferences: {
    contextIsolation: boolean;
    nodeIntegration: boolean;
    sandbox: boolean;
    preload: string;
    partition?: string;
  };
}

/** The slice of a `BrowserWindow` {@link createAppWindow} touches. */
interface AppWindow {
  webContents: NavigableContents;
  on(event: "page-title-updated", listener: (event: { preventDefault(): void }) => void): unknown;
  loadURL(url: string): Promise<unknown>;
}

/**
 * The options for one standalone admin window.
 *
 * @param preloadPath the compiled speech preload every admin window gets.
 * @param title the window title; `"Tovu"` when omitted.
 * @param partition the site's own cookie partition; omitted entirely (not set to `undefined`) when absent.
 * @param selftest a self-test keeps every window hidden.
 * @returns the constructor options.
 * @complexity O(1).
 */
function appWindowOptions(
  { preloadPath }: { preloadPath: string },
  { title, partition, selftest = false }: { title?: string; partition?: string; selftest?: boolean } = {},
): AppWindowOptions {
  return {
    width: 1360,
    height: 900,
    // Leave room for the admin navigation and editor; sites-home has its own narrower floor.
    minWidth: 1024,
    minHeight: 700,
    title: title ?? "Tovu",
    show: !selftest,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
      // One cookie jar per site. Cookies ignore PORT, so without this every own-server site shares
      // `127.0.0.1`'s jar: site A's `tovu_session` would be sent to site B's server, and B's login
      // would overwrite A's. Undefined in attach mode, which is single-site by definition and keeps
      // the default session it always used. See `desktop-auth.ts`'s header, property 2.
      ...(partition ? { partition } : {}),
    },
  };
}

/**
 * Create, guard and load one standalone admin window.
 *
 * @param url the admin URL to load; its parsed origin is the only one the window may stay on.
 * @param createBrowserWindow `(options) => new BrowserWindow(options)`.
 * @param preloadPath see {@link appWindowOptions}.
 * @param openExternal hands a foreign URL to the operator's own browser.
 * @param trackWindow the self-test tracker's `add`, when this launch has one.
 * @returns the window, already loading `url`.
 * @complexity O(1).
 */
function createAppWindow<W extends AppWindow>(
  { url, createBrowserWindow, preloadPath, openExternal }: {
    url: string; createBrowserWindow: (options: AppWindowOptions) => W; preloadPath: string; openExternal: (url: string) => void;
  },
  { title, partition, selftest = false, trackWindow }: {
    title?: string; partition?: string; selftest?: boolean; trackWindow?: (window: W) => void;
  } = {},
): W {
  const window = createBrowserWindow(appWindowOptions({ preloadPath }, { title, partition, selftest }));

  // Registered BEFORE `loadURL` below, and before this function returns to its caller — see
  // `selftestTracker`'s own doc for why that ordering is load-bearing for a multi-site launch.
  trackWindow?.(window);

  // Electron adopts the loaded page's own `document.title` by default, overwriting whatever `title`
  // this constructor was given the instant the admin SPA finishes loading — every site's admin page
  // sets the SAME title ("Tovu Admin"), confirmed live: a real 2-site launch reported both windows'
  // titles as "Tovu Admin", indistinguishable from each other. That defeats the whole premise of the
  // native Window menu doubling as a site switcher (see `main.ts`'s own header) — distinct entries
  // need distinct titles. `preventDefault()` here keeps each window pinned to the title it was given
  // at creation (the site's own name, or "Tovu" for attach mode) instead.
  window.on("page-title-updated", (event) => event.preventDefault());

  // Anything that navigates away from the app's own origin belongs in the OS browser — a
  // "view site ↗" link must not replace the admin shell inside the app window, and nothing but this
  // origin may run with the speech preload. See `window-navigation-policy.ts`.
  installAppWindowNavigationPolicy(window.webContents, { appOrigin: new URL(url).origin, openExternal });

  void window.loadURL(url);
  return window;
}

export { appWindowOptions, createAppWindow };
export type { AppWindow, AppWindowOptions };
