/**
 * @file P11 ST-18a.T — the desktop Storage sheet's main-process side: inventory, confirmed sign-in
 * removal and OS Trash of dismissed site folders, over three NAMED channels.
 *
 * STAGED, NOT MOUNTED: nothing in `main/index.ts` registers this yet, so no renderer can reach it.
 *
 * Authority rules (why this file looks the way it does):
 *  - Renderer payloads are `unknown`; the only thing a renderer may send is a main-issued opaque ID
 *    (list) or confirmation ID (act). Paths, partition names and "confirmed" flags are never read.
 *  - Only the real sites-home MAIN frame may call (`allowedSender` + `senderFrame === mainFrame`):
 *    a guest or subframe is refused.
 *  - Every destructive action shows the main-process confirm dialog first, then spends a single-use
 *    confirmation bound to one ID and one action, then re-resolves its target.
 *  - Sign-in removal goes through the REAL Jini interlock (`removeAmbiguousPartition`), which
 *    re-checks claims after rename: an add/open/acquire that races the confirm keeps the sign-in.
 *    Website files are never touched by it.
 *  - Listing never removes anything and never takes a lease or a writer lock.
 */
import type {
  DesktopStorageActionKind, DesktopStorageActionResult, DesktopStorageFolder, DesktopStoragePreview,
  DesktopStorageSignIn, DesktopStorageSite, DesktopStorageTidyAction, DesktopStorageView,
} from "@tovu/contracts/desktop-storage";
import type { StorageReportRead } from "./storage-report-cli.ts";
import type { StorageItemIds } from "./storage-item-ids.ts";

export const STORAGE_SHEET_CHANNELS = {
  list: "tovu:storage-sheet:list",
  preview: "tovu:storage-sheet:preview",
  act: "tovu:storage-sheet:act",
} as const;

export interface StorageSender { readonly id: number; readonly mainFrame: unknown; isDestroyed(): boolean; getURL(): string }
export interface StorageIpcEvent { readonly sender: StorageSender; readonly senderFrame: unknown }
export interface StorageIpcMain { handle(channel: string, listener: (event: StorageIpcEvent, payload: unknown) => unknown): void }

export type TrackedListRead =
  | { readonly state: "ok"; readonly sites: readonly { dir: string; label: string }[]; readonly dismissed: readonly { dir: string; label: string }[] }
  | { readonly state: "unknown" };
export type InventoryRead = { readonly state: "unknown" } | { readonly state: "ok"; readonly candidates: readonly { name: string; path: string }[] };
export type RemovePartitionResult =
  | { state: "removed" } | { state: "kept"; reason: "protected" | "busy" | "unknown" | "missing" } | { state: "refused"; reason: "unconfirmed" | "not-managed" };
export type TrashFolderResult = { readonly state: "trashed" } | { readonly state: "kept"; readonly reason: "in-use" | "changed" | "unknown" };

/** What an ID points at, held only in main. */
export type StorageTarget =
  | { readonly kind: "site"; readonly dir: string; readonly label: string }
  | { readonly kind: "sign-in"; readonly partition: string; readonly label: string }
  | { readonly kind: "folder"; readonly dir: string; readonly label: string };

export interface StorageSheetRequired {
  readonly ipcMain: StorageIpcMain;
  readonly allowedSender: (required: { sender: StorageSender }) => boolean;
  readonly listStrict: () => Promise<TrackedListRead>;
  readonly runReport: (required: { dir: string }) => Promise<StorageReportRead>;
  readonly measureTree: (required: { path: string }) => Promise<number | null>;
  readonly partitionInventory: () => Promise<InventoryRead>;
  readonly labelForPartition: (required: { partition: string }) => string | undefined;
  readonly removePartition: (required: { partition: string; confirmed: true; evidence: "owner-dialog" }) => Promise<RemovePartitionResult>;
  readonly trashFolder: (required: { dir: string }) => Promise<TrashFolderResult>;
  readonly confirmDialog: (required: { action: DesktopStorageActionKind; label: string }) => Promise<boolean>;
  readonly tidyActions: () => Promise<readonly DesktopStorageTidyAction[]>;
  readonly itemIds: StorageItemIds<StorageTarget>;
  readonly reportError: (required: { where: string; error: unknown }) => void;
  readonly now: () => Date;
}

const UNKNOWN_WEBSITE = "Unknown website";
const ACTION_KIND: Readonly<Record<DesktopStorageActionKind, StorageTarget["kind"]>> = {
  "remove-sign-in": "sign-in", "trash-folder": "folder", clean: "site", compact: "site",
};
/** T6 owns only the removal actions; Clean/Compact are bound by T7 (`storage-sheet-actions.ts`). */
const T6_ACTIONS: ReadonlySet<DesktopStorageActionKind> = new Set(["remove-sign-in", "trash-folder"]);

const isMainFrame = ({ sender, senderFrame }: StorageIpcEvent) => senderFrame !== undefined && senderFrame === sender.mainFrame;
const field = (payload: unknown, key: string): string | undefined => {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length <= 128 ? value : undefined;
};

async function listSites(deps: StorageSheetRequired, senderId: number, sites: readonly { dir: string; label: string }[]): Promise<DesktopStorageSite[]> {
  return Promise.all(sites.map(async ({ dir, label }) => {
    const read = await deps.runReport({ dir });
    const id = deps.itemIds.issue({ senderId, kind: "site", target: { kind: "site", dir, label } });
    if (read.state !== "ok") return { id, label, totalBytes: null, automaticBytes: null, files: 0 };
    const automatic = read.report.classes.automatic;
    const files = Object.values(read.report.classes).reduce((sum, amount) => sum + amount.files, 0);
    return { id, label, totalBytes: read.report.totalBytes, automaticBytes: automatic ? automatic.bytes : null, files };
  }));
}

async function listSignIns(deps: StorageSheetRequired, senderId: number): Promise<DesktopStorageView["signIns"]> {
  const inventory = await deps.partitionInventory();
  if (inventory.state !== "ok") return { state: "unknown" };
  const items: DesktopStorageSignIn[] = await Promise.all(inventory.candidates.map(async ({ name, path }) => {
    const label = deps.labelForPartition({ partition: name }) ?? UNKNOWN_WEBSITE;
    const id = deps.itemIds.issue({ senderId, kind: "sign-in", target: { kind: "sign-in", partition: name, label } });
    return { id, label, cacheBytes: await deps.measureTree({ path }) };
  }));
  return { state: "ok", items };
}

async function listFolders(deps: StorageSheetRequired, senderId: number, dismissed: readonly { dir: string; label: string }[]): Promise<DesktopStorageFolder[]> {
  return Promise.all(dismissed.map(async ({ dir, label }) => ({
    id: deps.itemIds.issue({ senderId, kind: "folder", target: { kind: "folder", dir, label } }),
    label, kind: "dismissed-site" as const, bytes: await deps.measureTree({ path: dir }),
  })));
}

/**
 * Builds one sender's view and replaces its previous IDs. Read-only: no removal, no lease.
 * @complexity one report per tracked site (bounded by `runReport`'s own limiter) plus tree walks.
 */
export async function listStorageView(deps: StorageSheetRequired, { senderId }: { senderId: number }): Promise<DesktopStorageView> {
  deps.itemIds.reset({ senderId });
  const tracked = await deps.listStrict();
  const sites = tracked.state === "ok" ? tracked.sites : [];
  const dismissed = tracked.state === "ok" ? tracked.dismissed : [];
  // A damaged tracked list means claims are unknown too: no sign-in action may be offered.
  const signIns = tracked.state === "ok" ? await listSignIns(deps, senderId) : { state: "unknown" as const };
  return {
    generatedAt: deps.now().toISOString(), sites: await listSites(deps, senderId, sites), signIns,
    otherFolders: await listFolders(deps, senderId, dismissed), tidy: { actions: await deps.tidyActions() },
  };
}

/** Issues a confirmation bound to one listed ID and one removal action. */
export function previewStorageAction(deps: StorageSheetRequired, { senderId, payload }: { senderId: number; payload: unknown }): DesktopStoragePreview {
  const id = field(payload, "id");
  const action = field(payload, "action") as DesktopStorageActionKind | undefined;
  if (!id || !action || !T6_ACTIONS.has(action)) return { state: "relist" };
  const target = deps.itemIds.resolve({ senderId, id, kind: ACTION_KIND[action] });
  if (!target) return { state: "relist" };
  return { state: "ready", confirmationId: deps.itemIds.issueConfirmation({ senderId, id, action }), action, label: target.label };
}

const fromRemoval = (result: RemovePartitionResult): DesktopStorageActionResult =>
  result.state === "removed" ? { state: "done" } : { state: "kept", reason: result.state === "kept" && result.reason === "busy" ? "in-use" : "unknown" };

/**
 * Spends the confirmation, re-resolves the target, asks in a main-process dialog, then acts.
 * @complexity O(1) plus the action.
 */
export async function actOnStorageItem(deps: StorageSheetRequired, { senderId, payload }: { senderId: number; payload: unknown }): Promise<DesktopStorageActionResult> {
  const confirmationId = field(payload, "confirmationId");
  const spent = confirmationId ? deps.itemIds.spendConfirmation({ senderId, confirmationId }) : undefined;
  if (!spent || !T6_ACTIONS.has(spent.action as DesktopStorageActionKind)) return { state: "relist" };
  const action = spent.action as DesktopStorageActionKind;
  const target = deps.itemIds.resolve({ senderId, id: spent.id, kind: ACTION_KIND[action] });
  if (!target) return { state: "relist" };
  if (!await deps.confirmDialog({ action, label: target.label })) return { state: "declined" };
  if (target.kind === "sign-in") return fromRemoval(await deps.removePartition({ partition: target.partition, confirmed: true, evidence: "owner-dialog" }));
  if (target.kind === "folder") {
    const result = await deps.trashFolder({ dir: target.dir });
    return result.state === "trashed" ? { state: "done" } : { state: "kept", reason: result.reason };
  }
  return { state: "relist" };
}

/**
 * Registers the three named channels. Every handler refuses a non-allowed sender or a non-main
 * frame, and never returns raw exception text.
 * @param optional.reportTimeoutMs unused here (the report limiter owns it); kept for the documented signature.
 */
export function registerStorageSheetIpc(deps: StorageSheetRequired, _optional: Record<string, never> = {}): void {
  const guard = <T>(where: string, refused: T, run: (senderId: number, payload: unknown) => Promise<T> | T) =>
    async (event: StorageIpcEvent, payload: unknown): Promise<T> => {
      if (event.sender.isDestroyed() || !isMainFrame(event) || !deps.allowedSender({ sender: event.sender })) return refused;
      try { return await run(event.sender.id, payload); } catch (error) { deps.reportError({ where, error }); return refused; }
    };
  deps.ipcMain.handle(STORAGE_SHEET_CHANNELS.list, guard("list", null, (senderId) => listStorageView(deps, { senderId })));
  deps.ipcMain.handle(STORAGE_SHEET_CHANNELS.preview, guard<DesktopStoragePreview>("preview", { state: "relist" }, (senderId, payload) => previewStorageAction(deps, { senderId, payload })));
  deps.ipcMain.handle(STORAGE_SHEET_CHANNELS.act, guard<DesktopStorageActionResult>("act", { state: "relist" }, (senderId, payload) => actOnStorageItem(deps, { senderId, payload })));
}
