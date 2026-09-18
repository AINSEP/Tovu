/**
 * @file Wires the sites home window's Find bar (`renderer/use-find-in-page.hooks.ts`) to Electron's
 * own `webContents.findInPage`/`stopFindInPage`, for the one surface a `<webview>`'s own copy of
 * those methods cannot reach: the window's OWN top-level page (the Projects screen, shown when no
 * project tab is on screen). A project tab's `<webview>` calls its own `findInPage`/
 * `stopFindInPage` directly from the renderer instead, needing no IPC — see
 * `contracts/find-in-page.ts`'s own header for the full split.
 *
 * `BrowserWindow.fromWebContents(event.sender)` resolves the CALLING window rather than a tracked
 * reference, so {@link registerFindInPageIpc} needs no window-scoped state of its own and can be
 * registered once, globally, the same way `registerSpeechIpc` is.
 */
import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";

import { FIND_IN_PAGE_CHANNELS, FIND_RESULT_CHANNEL, type FindInPageQuery, type FindInPageResult } from "./contracts/find-in-page.ts";

/** The slice of `BrowserWindow` (the class, not an instance) this module needs — real or faked in
 *  tests. `fromWebContents` returns `null` for a `webContents` that is not a top-level window's own
 *  (a destroyed window, or a guest's) — see Electron's own doc for that return type. */
interface FindWindowLookup {
  fromWebContents(webContents: WebContents): { webContents: Pick<WebContents, "findInPage" | "stopFindInPage"> } | null;
}

/**
 * Registers the two find-in-page IPC handlers. Call once, after `app.whenReady()` — see
 * `registerSpeechIpc`'s own doc for the identical convention this follows.
 *
 * Both handlers are fire-and-forget: `findInPage`'s own result arrives later, on the `found-in-page`
 * event {@link relayFindResults} relays, never as this call's return value.
 *
 * @param args.ipcMain Electron's `ipcMain`, or a fake with `handle`.
 * @param args.browserWindow Electron's `BrowserWindow` class, or a fake with `fromWebContents`.
 * @complexity O(1) to register; each handler is O(1) beyond Chromium's own `findInPage` cost.
 */
function registerFindInPageIpc({ ipcMain, browserWindow }: { ipcMain: Pick<IpcMain, "handle">; browserWindow: FindWindowLookup }): void {
  ipcMain.handle(FIND_IN_PAGE_CHANNELS.find, (event: IpcMainInvokeEvent, query: FindInPageQuery) => {
    browserWindow.fromWebContents(event.sender)?.webContents.findInPage(query.text, { forward: query.forward, findNext: query.findNext });
  });
  ipcMain.handle(FIND_IN_PAGE_CHANNELS.stop, (event: IpcMainInvokeEvent) => {
    browserWindow.fromWebContents(event.sender)?.webContents.stopFindInPage("clearSelection");
  });
}

/** The slice of `WebContents` {@link relayFindResults} needs — narrowed to ONE `on` overload
 *  (rather than `Pick<WebContents, "on">`, which drags in every overload) so a plain fake can
 *  satisfy it in tests without implementing the other ~40 event names. */
interface FindResultSource {
  on(event: "found-in-page", listener: (event: unknown, result: FindInPageResult) => void): unknown;
  send(channel: string, payload: FindInPageResult): void;
}

/**
 * Relays one window's own `found-in-page` results to its renderer — the top-level counterpart of a
 * `<webview>`'s own `found-in-page` DOM event, which needs no relay because the renderer already
 * holds that element directly. Call once per window, right after it is created.
 *
 * @complexity O(1) to register; each relay is O(1).
 */
function relayFindResults(window: { webContents: FindResultSource; isDestroyed(): boolean }): void {
  window.webContents.on("found-in-page", (_event, result) => {
    if (window.isDestroyed()) return;
    window.webContents.send(FIND_RESULT_CHANNEL, { activeMatchOrdinal: result.activeMatchOrdinal, matches: result.matches });
  });
}

export { registerFindInPageIpc, relayFindResults };
export type { FindWindowLookup };
