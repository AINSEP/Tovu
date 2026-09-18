/**
 * @file The sites-home window's Zoom controls, spliced into `site-history-menu.ts`'s View menu:
 * Actual Size (Cmd+0), Zoom In (Cmd+Plus), Zoom Out (Cmd+-).
 *
 * Custom items, not Electron's built-in `role: 'zoomIn'/'zoomOut'/'resetZoom'` — those operate on
 * `focusedWindow.webContents`, which is the sites home window's own TOP-level page. While a project
 * tab is the visible surface, that is the wrong target: the same routing problem `find-menu.ts`
 * solved for Cmd+F. `use-zoom.hooks.ts` decides which surface each command actually reaches.
 *
 * A hidden `CmdOrCtrl+=` duplicate rides along with Zoom In, mirroring Electron's own default menu:
 * `Plus` requires Shift on most keyboards, and `=` is the unshifted key beneath it.
 *
 * The channel literal is inlined rather than imported from `contracts/zoom.ts`, for the reason
 * `runner-ipc-stubs.ts` gives. `zoom-menu.test.ts` fails if it drifts from the contract.
 *
 * No `electron` import, so it can be tested under plain `node --test`.
 */

/** Mirrors `contracts/zoom.ts`'s `ZOOM_COMMAND_CHANNEL`. */
const ZOOM_COMMAND_CHANNEL = "runner:zoom:command";

/** Mirrors `contracts/zoom.ts`'s `ZoomDirection`. */
type ZoomCommandDirection = "in" | "out" | "reset";

/** A menu click's focused window, as far as this module reads one. Electron types it as a
 *  `BaseWindow`, which has no `webContents`, so that is optional — mirrors `find-menu.ts`'s
 *  `FindCommandWindow`. */
interface ZoomCommandWindow {
  isDestroyed(): boolean;
  webContents?: { send(channel: string, direction: ZoomCommandDirection): void };
}

/** One Zoom menu item. `click` has the leading parameters of Electron's `MenuItem` click. */
interface ZoomMenuItem {
  label: string;
  accelerator: string;
  visible?: boolean;
  click: (item: unknown, window: ZoomCommandWindow | undefined) => void;
}

/**
 * Tells `window`'s renderer to move its zoom one step in `direction`.
 *
 * @param window the menu click's focused window. Electron types it as a `BaseWindow`, which has
 *   no `webContents`, so that is checked rather than assumed.
 * @returns whether anything was sent.
 * @complexity O(1).
 */
function sendZoomCommand(window: ZoomCommandWindow | undefined, direction: ZoomCommandDirection): boolean {
  if (!window || window.isDestroyed() || !window.webContents) return false;
  window.webContents.send(ZOOM_COMMAND_CHANNEL, direction);
  return true;
}

/**
 * The Zoom items — Actual Size, Zoom In (plus its hidden `=` alias), Zoom Out — in the order
 * `sitesHomeMenuTemplate` places them inside View, between Toggle Developer Tools and Toggle Full
 * Screen.
 *
 * @complexity O(1).
 */
function zoomMenuItems(): ZoomMenuItem[] {
  return [
    { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: (_item, window) => void sendZoomCommand(window, "reset") },
    { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: (_item, window) => void sendZoomCommand(window, "in") },
    { label: "Zoom In", accelerator: "CmdOrCtrl+=", visible: false, click: (_item, window) => void sendZoomCommand(window, "in") },
    { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: (_item, window) => void sendZoomCommand(window, "out") },
  ];
}

export { ZOOM_COMMAND_CHANNEL, sendZoomCommand, zoomMenuItems };
export type { ZoomCommandDirection, ZoomCommandWindow, ZoomMenuItem };
