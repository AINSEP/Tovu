/**
 * @file The sites-home window's application menu: Electron's default menus, plus History with
 * Back (Cmd+[) and Forward (Cmd+]) for the project tab on screen.
 *
 * **Why a menu at all.** Sites-home mode used to set none, so Electron's default menu showed. A
 * menu accelerator is the one key binding that still fires while focus is inside a project tab's
 * `<webview>` guest, which a key listener in the sites-home page never sees. Setting a menu
 * replaces the default, so this template rebuilds it role for role and adds History. The one
 * difference: an unpackaged run's Help menu lost Electron's own links (electronjs.org, docs,
 * issues). A packaged app never showed those.
 *
 * **Main only asks.** A click sends `back` or `forward` to the focused window's renderer and knows
 * nothing about tabs. Every project tab stays mounted, and only the visible one subscribes (see
 * `subscribeSiteHistory` in `renderer/use-site-workspace.hooks.ts`), so a command with no site tab
 * showing reaches nobody.
 *
 * The channel literal is inlined rather than imported from `contracts/project.ts`, for the reason
 * `runner-ipc-stubs.ts` gives. `site-history-menu.test.ts` fails if it drifts from the contract.
 *
 * No `electron` import, so it can be tested under plain `node --test`.
 */

/** Mirrors `contracts/project.ts`'s `SITE_HISTORY_CHANNEL`. */
const SITE_HISTORY_CHANNEL = "runner:sites:history";

/**
 * Sends one history command to a window's renderer.
 *
 * @param {{isDestroyed: () => boolean, webContents?: {send: (channel: string, payload: string) => void}} | undefined} window
 *   the menu click's focused window. Electron types it as a `BaseWindow`, which has no
 *   `webContents`, so that is checked rather than assumed.
 * @param {"back" | "forward"} command
 * @returns {boolean} whether anything was sent.
 * @complexity O(1).
 */
function sendSiteHistoryCommand(window, command) {
  if (!window || window.isDestroyed() || !window.webContents) return false;
  window.webContents.send(SITE_HISTORY_CHANNEL, command);
  return true;
}

/**
 * The History menu. Named for Chrome's, which has the same two shortcuts.
 *
 * @complexity O(1).
 */
function siteHistoryMenu() {
  return {
    label: "History",
    submenu: [
      { label: "Back", accelerator: "CmdOrCtrl+[", click: (_item, window) => void sendSiteHistoryCommand(window, "back") },
      { label: "Forward", accelerator: "CmdOrCtrl+]", click: (_item, window) => void sendSiteHistoryCommand(window, "forward") },
    ],
  };
}

/**
 * Electron's default application menu with History added before Window. The Help menu is empty,
 * as a packaged app's default is.
 *
 * @param {string} platform `process.platform`; only macOS gets the app menu.
 * @complexity O(1).
 */
function sitesHomeMenuTemplate(platform) {
  return [
    ...(platform === "darwin" ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    siteHistoryMenu(),
    { role: "windowMenu" },
    { role: "help", submenu: [] },
  ];
}

export { SITE_HISTORY_CHANNEL, sendSiteHistoryCommand, siteHistoryMenu, sitesHomeMenuTemplate };
