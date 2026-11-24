/**
 * Tovu's words for the native message boxes the updater and the desktop shell show: a plain notice,
 * the "Update ready" prompt and the "close the other copies" explanation. Parenting, button order
 * and answers are Jini's (`@jini-ai/desktop-host/electron/updates`, `native-notices.ts`); Electron's
 * `dialog` and `BrowserWindow` arrive as ports, so every rule here runs under plain node with fakes.
 */
import {
  explainOthersOpen as explainOthersOpenWith,
  othersOpenOptions,
  promptUpdateReady as promptUpdateReadyWith,
  showNativeNotice,
  updateReadyPromptOptions,
} from "@jini-ai/desktop-host/electron/updates";
import type {
  NativeDialogPort, NativeMessageBoxOptions, OthersOpenCopy, UpdateNotice, UpdateReadyPromptCopy, WindowListPort,
} from "@jini-ai/desktop-host/electron/updates";

const updateReadyCopy: UpdateReadyPromptCopy = {
  restartLabel: "Restart to update",
  laterLabel: "Later",
  message: "Update ready",
  detail: ({ version }) => `Tovu ${version} is downloaded. Restart now, or it installs when you quit Tovu.`,
};

const othersOpenCopy: OthersOpenCopy = {
  message: "Close the other copies of Tovu first",
  detail: ({ count }) => `${count} other ${count === 1 ? "copy is" : "copies are"} open. The update installs when the last one quits.`,
};

/** "Update ready": Restart is button 0, Escape/close lands on Later. */
export function updateReadyDialog({ version }: { version: string }, _optionalArgs = {}): NativeMessageBoxOptions {
  return updateReadyPromptOptions({ copy: updateReadyCopy, version });
}

/** Restart to update was chosen while other copies of the app are open. */
export function othersOpenDialog({ count }: { count: number }, _optionalArgs = {}): NativeMessageBoxOptions {
  return othersOpenOptions({ copy: othersOpenCopy, count });
}

/** One native message box: the update check's notices and the legacy shared-key import notice. */
export function showDesktopNotice<W>({ dialog, windows, notice }: {
  dialog: NativeDialogPort<W>; windows: WindowListPort<W>; notice: UpdateNotice;
}, _optionalArgs = {}): void {
  showNativeNotice({ dialog, windows, notice, okLabel: "OK" });
}

/** The "Update ready" prompt, as a sheet on the focused window. Resolves `true` for Restart. */
export function promptUpdateReady<W>({ dialog, windows, automaticUpdates, version }: {
  dialog: NativeDialogPort<W>; windows: WindowListPort<W>; automaticUpdates: () => boolean; version: string;
}, _optionalArgs = {}): Promise<boolean> {
  return promptUpdateReadyWith({ dialog, windows, automaticUpdates, version, copy: updateReadyCopy });
}

/** Restart to update was chosen while other copies of the app are open. Never parented. */
export function explainOthersOpen<W>({ dialog, count }: { dialog: NativeDialogPort<W>; count: number }, _optionalArgs = {}): void {
  explainOthersOpenWith({ dialog, count, copy: othersOpenCopy });
}
