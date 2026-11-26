/**
 * @file P11 ST-18a.T — how `main/index.ts` mounts the desktop Storage sheet, kept out of that file so
 * the dark default, the sender rule and the removal binding are each testable on their own.
 *
 *  - `mountStorageSheet`: with the release flag off nothing is built and nothing registers, so no
 *    Storage channel exists for any page to call.
 *  - `isSitesHomeMainFrame`: the exact sites-home page URL in a real window — not a textual prefix
 *    (`?x`, `#…`) and never a `<webview>` guest. The registrar adds the main-frame check on top.
 *  - `bindStorageSignInRemoval`: the ONE way a sign-in is removed — Jini's `removeAmbiguousPartition`
 *    on the same interlock, ledger and fs the boot pass uses, with a confirmation main builds itself
 *    after its own dialog. A renderer never supplies the partition or the "confirmed" flag.
 */
import type { removeAmbiguousPartition as RemoveAmbiguousPartition, ManualRemovalRequired } from "@jini-ai/desktop-host/electron/partitions";
import type { RemovePartitionResult, StorageSheetRequired } from "../../storage/storage-sheet-ipc.ts";

/**
 * Registers the Storage sheet only when `enabled`; `buildDeps` is not even called otherwise.
 * @complexity O(1).
 */
export function mountStorageSheet(
  { enabled, buildDeps, register }: { enabled: boolean; buildDeps: () => StorageSheetRequired; register: (deps: StorageSheetRequired) => void },
  _optional: Record<string, never> = {},
): { mounted: boolean } {
  if (!enabled) return { mounted: false };
  register(buildDeps());
  return { mounted: true };
}

/** The sender shape this check reads; Electron's `WebContents` satisfies it. */
export interface SitesHomeSender { getURL(): string; getType(): string; isDestroyed(): boolean }

/** True only for a live sites-home WINDOW at exactly `shellUrl`. @complexity O(url length). */
export function isSitesHomeMainFrame({ sender, shellUrl }: { sender: SitesHomeSender; shellUrl: string }, _optional: Record<string, never> = {}): boolean {
  return !sender.isDestroyed() && sender.getType() === "window" && sender.getURL() === shellUrl;
}

/** The ports `removeAmbiguousPartition` needs besides the partition and the confirmation. */
export type StorageSignInRemovalPorts = Pick<ManualRemovalRequired, "interlock" | "ledger" | "fs" | "root" | "newToken"> & {
  readonly removeAmbiguousPartition: typeof RemoveAmbiguousPartition;
};

/**
 * Binds the registrar's `removePartition` to the real Jini interlock. The registrar calls it only
 * after its confirm dialog said yes; the confirmation here is rebuilt from main's own target.
 * @complexity O(1) plus the interlock's own rechecks.
 */
export function bindStorageSignInRemoval(
  { removeAmbiguousPartition, ...ports }: StorageSignInRemovalPorts,
  _optional: Record<string, never> = {},
): StorageSheetRequired["removePartition"] {
  return async ({ partition }) => (await removeAmbiguousPartition({
    partition, ...ports, confirmation: { partition, confirmed: true, evidence: "owner-dialog" },
  })) as RemovePartitionResult;
}

/**
 * The main-process confirm dialog's words. Sign-in removal says plainly that website files stay,
 * so the owner can tell it apart from deleting a site. Returns Electron `showMessageBox` options.
 */
export function storageConfirmDialog(
  { action, label }: { action: "remove-sign-in" | "trash-folder" | "clean" | "compact"; label: string },
  _optional: Record<string, never> = {},
): { type: "warning"; buttons: string[]; defaultId: 0; cancelId: 0; message: string; detail: string } {
  const words: readonly [button: string, message: string, detail: string] = ({
    "remove-sign-in": ["Remove sign-in", `Remove the saved sign-in for ${label}?`, "You will need to sign in again. Website files are not touched."],
    "trash-folder": ["Move to Trash", `Move ${label} to the Trash?`, "You can restore it from the Trash."],
    clean: ["Clean", `Clean up ${label}?`, "Only files the report marked as safe to remove are affected."],
    compact: ["Compact", `Compact ${label}?`, "The site must stay stopped while this runs."],
  } as const)[action];
  return { type: "warning", buttons: ["Cancel", words[0]], defaultId: 0, cancelId: 0, message: words[1], detail: words[2] };
}
