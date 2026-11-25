/**
 * @file P11 ST-18a.T (T6b) — OS Trash for a DISMISSED site folder, and nothing else.
 *
 * Trashable folders are only the `dismissed` entries of `tracked-sites.ts` (sheets-check FIX 4).
 * Backups and held copies are listed read-only. Everything is re-checked at action time, under the
 * host's add/open fence, because a listing is not deletion authority:
 *  - still dismissed AND not tracked (strict read; an unreadable list keeps the folder);
 *  - a plain directory reached without any link (`lstat` + `realpath` equality);
 *  - not the app bundle, the managed profile, or anything containing or inside them;
 *  - not live, starting or in maintenance (unknown keeps it).
 * Only `trashItem` (Electron `shell.trashItem`) removes it — there is no `rm` fallback.
 */
import path from "node:path";
import type { TrashFolderResult } from "./storage-sheet-ipc.ts";

export type SiteRuntimeState = "stopped" | "running" | "unknown";
export interface TrashFolderFs {
  lstat(target: string): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
  realpath(target: string): Promise<string>;
}
export interface TrashDismissedRequired {
  readonly readTrackedStrict: () => Promise<{ state: "ok"; tracked: readonly string[]; dismissed: readonly string[] } | { state: "unknown" }>;
  readonly protectedRoots: readonly string[];
  readonly fs: TrashFolderFs;
  readonly siteState: (required: { dir: string }) => Promise<SiteRuntimeState>;
  /** The host's add/open serialization (the same fence `trackSite` writes under). */
  readonly withAddOpenFence: <T>(run: () => Promise<T>) => Promise<T>;
  readonly trashItem: (target: string) => Promise<void>;
}

const within = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

async function plainDirectory(fs: TrashFolderFs, dir: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(dir);
    return stat.isDirectory() && !stat.isSymbolicLink() && await fs.realpath(dir) === dir;
  } catch { return false; }
}

async function eligible(deps: TrashDismissedRequired, dir: string): Promise<TrashFolderResult | undefined> {
  if (!path.isAbsolute(dir) || deps.protectedRoots.some((root) => within(root, dir) || within(dir, root))) return { state: "kept", reason: "changed" };
  const list = await deps.readTrackedStrict();
  if (list.state !== "ok") return { state: "kept", reason: "unknown" };
  if (!list.dismissed.includes(dir) || list.tracked.includes(dir)) return { state: "kept", reason: "changed" };
  if (!await plainDirectory(deps.fs, dir)) return { state: "kept", reason: "changed" };
  const state = await deps.siteState({ dir });
  if (state !== "stopped") return { state: "kept", reason: state === "running" ? "in-use" : "unknown" };
  return undefined;
}

/**
 * @returns the `trashFolder` port of `registerStorageSheetIpc`.
 * @complexity O(tracked rows) per call.
 */
export function bindTrashDismissedFolder(deps: TrashDismissedRequired, _optional: Record<string, never> = {}): (required: { dir: string }) => Promise<TrashFolderResult> {
  return ({ dir }) => deps.withAddOpenFence(async () => {
    const refused = await eligible(deps, dir);
    if (refused) return refused;
    try { await deps.trashItem(dir); return { state: "trashed" as const }; } catch { return { state: "kept" as const, reason: "unknown" as const }; }
  });
}
