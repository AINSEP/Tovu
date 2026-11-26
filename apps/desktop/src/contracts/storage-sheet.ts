/**
 * @file P11 ST-18a.T — the desktop Storage sheet's fixed bridge: three NAMED channels and the
 * release flag that keeps the whole feature dark.
 *
 * Shared by main (registrar), preload (bridge) and renderer (entry), so it stays a pure
 * constant/type module with no Node or Electron surface. The bridge forwards only the two fields
 * each call is allowed to carry — never a path, a partition name or a "confirmed" flag — and main
 * treats even those as `unknown` (see `storage/storage-sheet-ipc.ts`).
 */
import type {
  DesktopStorageActionKind, DesktopStorageActionResult, DesktopStoragePreview, DesktopStorageView,
} from "@tovu/contracts/desktop-storage";

/**
 * OFF: with this false main registers no Storage channel, the preload exposes no
 * `tovuStorageSheet` bridge and the sites home shows no Storage entry. Flip only with release sign-off.
 */
export const STORAGE_SHEET_ENABLED = false;

export const STORAGE_SHEET_CHANNELS = {
  list: "tovu:storage-sheet:list",
  preview: "tovu:storage-sheet:preview",
  act: "tovu:storage-sheet:act",
} as const;

/** What the renderer may ask. `list` answers `null` when main refused the caller. */
export interface StorageSheetBridge {
  list(): Promise<DesktopStorageView | null>;
  preview(required: { id: string; action: DesktopStorageActionKind }, _optional?: Record<string, never>): Promise<DesktopStoragePreview>;
  act(required: { confirmationId: string }, _optional?: Record<string, never>): Promise<DesktopStorageActionResult>;
}

/**
 * Builds the fixed bridge over an injected `invoke`. Each method rebuilds its payload from the named
 * fields, so an extra field a page smuggles into the call object never reaches main.
 */
export function createStorageSheetBridge(
  { invoke }: { invoke: (channel: string, payload?: unknown) => Promise<unknown> },
  _optional: Record<string, never> = {},
): StorageSheetBridge {
  return {
    list: () => invoke(STORAGE_SHEET_CHANNELS.list) as Promise<DesktopStorageView | null>,
    preview: ({ id, action }) => invoke(STORAGE_SHEET_CHANNELS.preview, { id, action }) as Promise<DesktopStoragePreview>,
    act: ({ confirmationId }) => invoke(STORAGE_SHEET_CHANNELS.act, { confirmationId }) as Promise<DesktopStorageActionResult>,
  };
}
