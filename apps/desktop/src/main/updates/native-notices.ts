/**
 * Native message boxes the updater and the desktop shell show: a plain notice, the "Update ready"
 * prompt and the "close the other copies" explanation. Electron's `dialog` and `BrowserWindow`
 * arrive as ports, so every rule here runs under plain node with fakes.
 */
import type { MessageBoxOptions } from "electron";

/** The slice of Electron's `dialog` these boxes use; Electron's own `dialog` satisfies it. */
export interface NativeDialogPort<W> {
  showMessageBox(window: W, options: MessageBoxOptions): Promise<{ response: number }>;
  showMessageBox(options: MessageBoxOptions): Promise<{ response: number }>;
}

/** The slice of Electron's `BrowserWindow` statics these boxes use. */
export interface WindowListPort<W> {
  getFocusedWindow(): W | null;
  getAllWindows(): W[];
}

/** One native message box's text: the update check's notices and the legacy shared-key notice. */
export interface DesktopNotice {
  type: "info" | "error";
  message: string;
  detail: string;
}

/** "Update ready": Restart is button 0, Escape/close lands on Later. */
export function updateReadyDialog({ version }: { version: string }, _optionalArgs = {}): MessageBoxOptions {
  return {
    type: "info",
    buttons: ["Restart to update", "Later"],
    defaultId: 0,
    cancelId: 1,
    message: "Update ready",
    detail: `Tovu ${version} is downloaded. Restart now, or it installs when you quit Tovu.`,
  };
}

/** Restart to update was chosen while other copies of the app are open. */
export function othersOpenDialog({ count }: { count: number }, _optionalArgs = {}): MessageBoxOptions {
  return {
    type: "info",
    message: "Close the other copies of Tovu first",
    detail: `${count} other copy${count === 1 ? " is" : "s are"} open. The update installs when the last one quits.`,
  };
}

/**
 * A box as a sheet on the focused window, else the first window, else app-modal when none is open.
 * @returns The native box's answer. @complexity O(n) open windows.
 */
export function showOnFocusedWindow<W>({ dialog, windows, options }: {
  dialog: NativeDialogPort<W>; windows: WindowListPort<W>; options: MessageBoxOptions;
}, _optionalArgs = {}): Promise<{ response: number }> {
  const parent = windows.getFocusedWindow() ?? windows.getAllWindows()[0];
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

/** One native message box: the update check's notices and the legacy shared-key import notice. */
export function showDesktopNotice<W>({ dialog, windows, notice }: {
  dialog: NativeDialogPort<W>; windows: WindowListPort<W>; notice: DesktopNotice;
}, _optionalArgs = {}): void {
  const { type, message, detail } = notice;
  void showOnFocusedWindow({ dialog, windows, options: { type, message, detail, buttons: ["OK"] } });
}

/** The "Update ready" prompt, as a sheet on the focused window. Resolves `true` for Restart. */
export async function promptUpdateReady<W>({ dialog, windows, automaticUpdates, version }: {
  dialog: NativeDialogPort<W>; windows: WindowListPort<W>; automaticUpdates: () => boolean; version: string;
}, _optionalArgs = {}): Promise<boolean> {
  // The download event may already have queued its prompt when the checkbox is turned off.
  if (!automaticUpdates()) return false;
  const { response } = await showOnFocusedWindow({ dialog, windows, options: updateReadyDialog({ version }) });
  return response === 0;
}

/** Restart to update was chosen while other copies of the app are open. Never parented. */
export function explainOthersOpen<W>({ dialog, count }: { dialog: NativeDialogPort<W>; count: number }, _optionalArgs = {}): void {
  void dialog.showMessageBox(othersOpenDialog({ count }));
}
