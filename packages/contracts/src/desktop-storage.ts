/**
 * @file P11 ST-18a.T / ST-18b.T — the desktop Storage sheet's bridge contract.
 *
 * Display data only: labels, nonnegative counts, nullable byte estimates and opaque IDs that the
 * main process issued for ONE sender frame. No paths, partition IDs, credentials, raw CLI output
 * or raw exception strings cross the bridge — main keeps the ID → target mapping, so a renderer
 * can never name what gets removed. A stale, expired or other-sender ID answers `relist`.
 */

// The channel names and the dark release flag live in apps/desktop/src/contracts/storage-sheet.ts
// (shared by main, preload and renderer); this file stays type-only so the bridge carries no runtime coupling.

/** A byte estimate the main process could not measure is `null`, never a guessed zero. */
export type ByteEstimate = number | null;

export interface DesktopStorageSite {
  readonly id: string;
  readonly label: string;
  readonly totalBytes: ByteEstimate;
  /** Bytes the report classes as automatically reclaimable; `null` when the report was unknown. */
  readonly automaticBytes: ByteEstimate;
  readonly files: number;
}

/** An ambiguous sign-in (an unclaimed partition). `id` is null when no removal may be offered. */
export interface DesktopStorageSignIn {
  readonly id: string | null;
  readonly label: string;
  readonly cacheBytes: ByteEstimate;
}

export type DesktopStorageFolderKind = "dismissed-site" | "backups" | "held-copies";

/** Another owner folder. Only `dismissed-site` folders can carry an `id` (OS Trash). */
export interface DesktopStorageFolder {
  readonly id: string | null;
  readonly label: string;
  readonly kind: DesktopStorageFolderKind;
  readonly bytes: ByteEstimate;
}

/** The tidy actions the bundled CLI positively reported; empty means no button is shown. */
export type DesktopStorageTidyAction = "clean" | "compact";

export interface DesktopStorageView {
  readonly generatedAt: string;
  readonly sites: readonly DesktopStorageSite[];
  /** `unknown` when claims, ledger or root could not be read: no sign-in action at all. */
  readonly signIns: { readonly state: "ok"; readonly items: readonly DesktopStorageSignIn[] } | { readonly state: "unknown" };
  readonly otherFolders: readonly DesktopStorageFolder[];
  readonly tidy: { readonly actions: readonly DesktopStorageTidyAction[] };
}

export type DesktopStorageActionKind = "remove-sign-in" | "trash-folder" | "clean" | "compact";

export type DesktopStoragePreview =
  | { readonly state: "ready"; readonly confirmationId: string; readonly action: DesktopStorageActionKind; readonly label: string }
  | { readonly state: "relist" };

export type DesktopStorageActionResult =
  | { readonly state: "done" }
  | { readonly state: "declined" }
  | { readonly state: "kept"; readonly reason: "in-use" | "changed" | "unknown" }
  | { readonly state: "relist" };
