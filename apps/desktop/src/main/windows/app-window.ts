/**
 * @file Host binding for the standalone admin window (own-server and attach modes): binds the
 * default title and the app-window navigation boundary onto Jini `desktop-host/electron/windows`,
 * which owns the window options and the setup ORDER. `main.ts` passes a `BrowserWindow` factory and
 * `shell.openExternal` in.
 */
import { installAppWindowNavigationPolicy, type ElectronNavigableContents } from "@jini-ai/desktop-host/electron/navigation-policy";
import {
  appWindowOptions as buildAppWindowOptions,
  createAppWindow as createGuardedAppWindow,
  type AppWindow,
  type AppWindowOptions,
} from "@jini-ai/desktop-host/electron/windows";

/** Attach mode's title, and any window opened without a site name. Every site's admin page sets the
 *  same `document.title`, which the Jini window pins away, so this is what the Window menu shows. */
const DEFAULT_TITLE = "Tovu";

/**
 * The options for one standalone admin window.
 *
 * @param preloadPath the compiled speech preload every admin window gets.
 * @param title the window title; `"Tovu"` when omitted.
 * @param partition the site's own cookie partition (see `desktop-auth.ts`'s header, property 2).
 * @param selftest a self-test keeps every window hidden.
 * @returns the constructor options.
 * @complexity O(1).
 */
function appWindowOptions(
  { preloadPath }: { preloadPath: string },
  { title, partition, selftest = false }: { title?: string; partition?: string; selftest?: boolean } = {},
): AppWindowOptions {
  return buildAppWindowOptions({ preloadPath, title: title ?? DEFAULT_TITLE }, { partition, selftest });
}

/**
 * Create, guard and load one standalone admin window.
 *
 * @param url the admin URL to load; its parsed origin is the only one the window may stay on.
 * @param openExternal hands a foreign URL to the operator's own browser.
 * @param trackWindow the self-test tracker's `add`, when this launch has one.
 * @returns the window, already loading `url`.
 * @complexity O(1).
 */
function createAppWindow<W extends AppWindow<ElectronNavigableContents>>(
  { url, createBrowserWindow, preloadPath, openExternal }: {
    url: string; createBrowserWindow: (options: AppWindowOptions) => W; preloadPath: string; openExternal: (required: { url: string }) => void;
  },
  { title, partition, selftest = false, trackWindow }: {
    title?: string; partition?: string; selftest?: boolean; trackWindow?: (window: W) => void;
  } = {},
): W {
  return createGuardedAppWindow({ url, title: title ?? DEFAULT_TITLE, preloadPath, ports: {
    createBrowserWindow,
    installNavigationPolicy: ({ contents, appOrigin }) => installAppWindowNavigationPolicy({ contents, appOrigin, openExternal }),
  } }, { partition, selftest, trackWindow });
}

export { appWindowOptions, createAppWindow };
