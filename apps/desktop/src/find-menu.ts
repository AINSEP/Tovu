/**
 * @file The sites-home window's Find menu item: Cmd+F opens the find bar the renderer owns
 * (`renderer/use-find-in-page.hooks.ts`).
 *
 * Same reason `site-history-menu.ts` exists for Back/Forward: a menu accelerator is the one key
 * binding that still fires while focus is inside a project tab's `<webview>` guest, which a key
 * listener in the sites-home page never sees (`renderer/App.hooks.ts`'s `useExpandedMode` documents
 * the identical gap for Escape). Everything AFTER the bar opens — typing, Enter, Shift+Enter,
 * Escape — is an ordinary DOM keydown on the bar's own input, which lives in THIS document, so only
 * the one "open the bar" step needs main's help at all.
 *
 * The channel literal is inlined rather than imported from `contracts/find-in-page.ts`, for the
 * reason `runner-ipc-stubs.ts` gives. `find-menu.test.ts` fails if it drifts from the contract.
 *
 * No `electron` import, so it can be tested under plain `node --test`.
 */

/** Mirrors `contracts/find-in-page.ts`'s `FIND_TOGGLE_CHANNEL`. */
const FIND_TOGGLE_CHANNEL = "runner:find:toggle";

/** A menu click's focused window, as far as this module reads one. Electron types it as a
 *  `BaseWindow`, which has no `webContents`, so that is optional — mirrors `site-history-menu.ts`'s
 *  `HistoryCommandWindow`. */
interface FindCommandWindow {
  isDestroyed(): boolean;
  webContents?: { send(channel: string): void };
}

/** The one Find menu item. `click` has the leading parameters of Electron's `MenuItem` click. */
interface FindMenuItem {
  label: string;
  accelerator: string;
  click: (item: unknown, window: FindCommandWindow | undefined) => void;
}

/** The Find menu: exactly one item. */
interface FindMenu {
  label: string;
  submenu: [FindMenuItem];
}

/**
 * Tells `window`'s renderer to open (or refocus) its find bar.
 *
 * @param window the menu click's focused window. Electron types it as a `BaseWindow`, which has
 *   no `webContents`, so that is checked rather than assumed.
 * @returns whether anything was sent.
 * @complexity O(1).
 */
function sendFindToggle(window: FindCommandWindow | undefined): boolean {
  if (!window || window.isDestroyed() || !window.webContents) return false;
  window.webContents.send(FIND_TOGGLE_CHANNEL);
  return true;
}

/**
 * The Find menu: one item, Cmd+F, named the way Chrome and most browsers name their own.
 *
 * @complexity O(1).
 */
function findMenu(): FindMenu {
  return {
    label: "Find",
    submenu: [
      {
        label: "Find in Page…",
        accelerator: "CmdOrCtrl+F",
        click: (_item: unknown, window: FindCommandWindow | undefined) => void sendFindToggle(window),
      },
    ],
  };
}

export { FIND_TOGGLE_CHANNEL, sendFindToggle, findMenu };
export type { FindCommandWindow, FindMenu, FindMenuItem };
