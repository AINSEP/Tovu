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
// Top-level/guest search rationale: Jini/packages/desktop-host/src/electron/usability/find-in-page-ipc.ts.
import type { IpcMain, WebContents } from "electron";
import { registerFindInPageIpc as registerFind, relayFindResults as relayResults } from "@jini-ai/desktop-host/electron/usability";
import { FIND_IN_PAGE_CHANNELS, FIND_RESULT_CHANNEL, type FindInPageResult } from "./contracts/find-in-page.ts";
export interface FindWindowLookup {
  fromWebContents(sender: WebContents): { webContents: Pick<WebContents, "findInPage" | "stopFindInPage"> } | null;
}
/**
 * Register once after app.whenReady(), before opening windows. Both handlers are fire-and-forget:
 * Chromium reports search results through found-in-page, never the invoke return value.
 * @returns A disposer that removes both native IPC handlers when supported by the host.
 * @complexity O(1) beyond Chromium's search cost.
 */
export function registerFindInPageIpc({ ipcMain, browserWindow }: {
  ipcMain: Pick<IpcMain, "handle"> & Partial<Pick<IpcMain, "removeHandler">>;
  browserWindow: FindWindowLookup;
}): () => void {
  return registerFind<WebContents>({
    channels: FIND_IN_PAGE_CHANNELS,
    ipcMain: {
      handle: ({ channel, listener }) => ipcMain.handle(channel, (event, query) => listener({ event, query })),
      removeHandler: ({ channel }) => ipcMain.removeHandler?.(channel),
    },
    browserWindow: { fromWebContents: ({ sender }) => {
      const window = browserWindow.fromWebContents(sender);
      if (!window) return null;
      return { webContents: {
        findInPage: ({ text }, options) => window.webContents.findInPage(text, options),
        stopFindInPage: ({ action }) => window.webContents.stopFindInPage(action),
      } };
    } },
  });
}
interface NativeResultSource {
  on(event: "found-in-page", listener: (event: unknown, result: FindInPageResult) => void): unknown;
  removeListener?(event: "found-in-page", listener: (event: unknown, result: FindInPageResult) => void): unknown;
  send(channel: string, payload: FindInPageResult): void;
}
/**
 * Relay top-level results once per window, immediately after creation; guest webviews already
 * hold their own result-producing DOM element and need no relay. The disposer detaches the same
 * native listener, and destroyed windows receive no sends.
 * @complexity O(1) to register and per relay.
 */
export function relayFindResults({ window }: { window: { webContents: NativeResultSource; isDestroyed(): boolean } }): () => void {
  let nativeListener: ((event: unknown, result: FindInPageResult) => void) | undefined;
  return relayResults({
    resultChannel: FIND_RESULT_CHANNEL,
    window: {
      isDestroyed: () => window.isDestroyed(),
      webContents: {
        on: ({ event, listener }) => {
          nativeListener = (_event, result) => listener({ result });
          window.webContents.on(event, nativeListener);
        },
        removeListener: ({ event }) => { if (nativeListener) window.webContents.removeListener?.(event, nativeListener); },
        send: ({ channel, payload }) => window.webContents.send(channel, payload),
      },
    },
  });
}
