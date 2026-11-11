/**
 * @file Main's half of the web admin's hand-off to the desktop Import tab (owner, 2026-11-10); the
 * whole route is in `contracts/import-handoff.ts`'s header. The admin page asks; main checks the
 * sender the way the speech channels do (`isShellPage`), brings the sites home window forward, and
 * tells its renderer to open Import with the address.
 */
import type { IpcMainInvokeEvent } from "electron";
import { IMPORT_HANDOFF_CHANNELS, importHandoffRequest, type ImportHandoffRequest, type ImportHandoffResult } from "./contracts/import-handoff.ts";

/** The slice of a sites home `BrowserWindow` the hand-off touches. */
export interface ImportHandoffWindow {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  webContents: { send(channel: string, payload: ImportHandoffRequest): void };
}

/** Plain words for the one refusal; the guest shows it after "Couldn't open Tovu's Import tab:". */
const SENDER_REFUSED = "This page isn't part of Tovu, so it can't open the Import tab.";

/**
 * Register once, app-wide, before any window can call it.
 * @param required.isTrustedSender the speech channels' check: a page this shell serves.
 * @param required.sitesHomeWindows the open sites home windows, read at call time.
 * @complexity O(w) in open sites home windows per request.
 */
export function registerImportHandoffIpc({ ipcMain, isTrustedSender, sitesHomeWindows }: {
  ipcMain: { handle(channel: string, handler: (event: Pick<IpcMainInvokeEvent, "senderFrame">, raw: unknown) => ImportHandoffResult): void };
  isTrustedSender: (senderUrl: string) => boolean;
  sitesHomeWindows: () => readonly ImportHandoffWindow[];
}, _optional: Record<string, never> = {}): void {
  ipcMain.handle(IMPORT_HANDOFF_CHANNELS.request, (event, raw) => {
    const url = event?.senderFrame?.url;
    if (typeof url !== "string" || !isTrustedSender(url)) throw new Error(SENDER_REFUSED);
    const window = sitesHomeWindows()[0];
    if (!window) return { opened: false };
    // An admin in its own window (or a minimized app) would otherwise change a screen nobody sees.
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    window.webContents.send(IMPORT_HANDOFF_CHANNELS.open, importHandoffRequest({ raw }));
    return { opened: true };
  });
}
