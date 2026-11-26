/**
 * @file P11 ST-18a.T — the desktop Storage sheet's READ and TRASH sources, bound to their real
 * origins and kept out of `main/index.ts`. DARK: only `desktopStorageSheetDeps` uses this, and that
 * is built only while `STORAGE_SHEET_ENABLED` is on (it is off).
 *
 *  - `listStrict`: tracked + dismissed folders from the strict projects file. Anything but a file
 *    this app could have written is a plain `unknown` — never an empty list standing in for it.
 *  - `partitionInventory`: Jini J3 `listAmbiguousPartitions` over the boot pass's own partitions
 *    root, managed-name predicate, claim sources (`desktop-partition-lock.ts`'s read-only
 *    `readClaims`) and retirement ledger. Claims are re-read on EVERY listing, never cached: a site
 *    added or opened since the last listing must drop out. Listing takes no lock and opens no session.
 *  - `runReport`: `storage report <absolute-dir> --json` through the desktop's own spawn plan,
 *    capped and validated by `storage/storage-report-cli.ts`, two at a time, timeout → unknown.
 *  - `labelForPartition`: a folder name from a tracked/dismissed match or ledger metadata; otherwise
 *    `undefined`, which the registrar shows as "Unknown website". A partition key is never a label.
 *  - `trashFolder`: `storage/trash-dismissed-folder.ts`'s re-checks, inside the host's add/open
 *    fence for that exact folder, against live/starting/stopping state read at action time.
 * Nothing here removes anything except `trashFolder`, and that only through the injected OS Trash.
 */
import path from "node:path";
import {
  listAmbiguousPartitions, listCandidates, partitionDirName, resolvePartitionRoot,
  type ClaimsRead, type PartitionFsPort, type PartitionPassLedger,
} from "@jini-ai/desktop-host/electron/partitions";
import { sitePartition } from "../../desktop-auth.ts";
import { bindRunCli, bindStorageReports, type SpawnCli } from "../../storage/storage-report-cli.ts";
import type { StorageSheetRequired, TrackedListRead } from "../../storage/storage-sheet-ipc.ts";
import { bindTrashDismissedFolder, type SiteRuntimeState, type TrashFolderFs } from "../../storage/trash-dismissed-folder.ts";

/** What the host knows about a site folder right now; anything but `idle` keeps its folder. */
export type SiteActivity = "idle" | "live" | "starting" | "stopping" | "maintenance";

/** The strict projects-file read (`tracked-sites.ts`'s `readProjectsFile`). */
export type ReadProjects = (required: { projectsPath: string }) => {
  state: "ok" | "missing" | "unreadable"; rows: readonly { siteDir: string; displayNameAlias?: string }[]; dismissed: readonly string[];
};

export interface StorageSheetSourcesRequired {
  readonly projectsPath: string;
  readonly readProjects: ReadProjects;
  readonly partitions: {
    readonly sessionDataDir: string;
    readonly fs: Pick<PartitionFsPort, "readdir" | "lstat" | "realpath">;
    readonly isManaged: (name: string) => boolean;
    /** `bindDesktopPartitions(...).readClaims` — the boot pass's claim sources, read-only. */
    readonly readClaims: () => Promise<ClaimsRead>;
  };
  readonly ledger: Pick<PartitionPassLedger, "readStrict">;
  readonly cli: { readonly planFor: (required: { cliArgs: readonly string[] }) => { command: string; args: readonly string[] }; readonly spawn: SpawnCli };
  readonly measure: (required: { path: string }) => Promise<{ state: "measured"; bytes: number } | { state: "unknown"; reason: string }>;
  readonly trash: {
    readonly protectedRoots: readonly string[];
    readonly fs: TrashFolderFs;
    readonly siteActivity: (required: { dir: string }) => SiteActivity;
    /** The host's add/open serialization for this exact folder (`serializer.run({ key: dir })`). */
    readonly withAddOpenFence: <T>(required: { dir: string; run: () => Promise<T> }) => Promise<T>;
    /** Electron `shell.trashItem`: the only way an owner folder leaves. */
    readonly trashItem: (target: string) => Promise<void>;
  };
}

export type StorageSheetSources = Pick<StorageSheetRequired, "listStrict" | "partitionInventory" | "runReport" | "measureTree" | "labelForPartition" | "trashFolder">;

const folderLabel = (dir: string) => path.basename(dir);

/** Strict tracked + still-dismissed folders; any non-`ok` file is unknown. @complexity O(rows + dismissed). */
function readTrackedList(required: StorageSheetSourcesRequired): TrackedListRead {
  const file = required.readProjects({ projectsPath: required.projectsPath });
  if (file.state !== "ok") return { state: "unknown" };
  const tracked = new Set(file.rows.map((row) => row.siteDir));
  const dismissed = [...new Set(file.dismissed)].filter((dir) => !tracked.has(dir));
  return {
    state: "ok",
    sites: file.rows.map((row) => ({ dir: row.siteDir, label: row.displayNameAlias ?? folderLabel(row.siteDir) })),
    dismissed: dismissed.map((dir) => ({ dir, label: folderLabel(dir) })),
  };
}

/** Folder-name label for a managed partition, or `undefined` (shown as "Unknown website"). @complexity O(rows + records). */
function labelFor(required: StorageSheetSourcesRequired, partition: string): string | undefined {
  const file = required.readProjects({ projectsPath: required.projectsPath });
  if (file.state !== "ok") return undefined;
  const known = [...file.rows.map((row) => row.siteDir), ...file.dismissed];
  const match = known.find((dir) => partitionDirName(sitePartition({ siteDir: dir })) === partition);
  if (match) return folderLabel(match);
  const ledger = required.ledger.readStrict({}, {});
  if (ledger.state !== "ok") return undefined;
  const record = ledger.records.find((entry) => entry.partition === partition && typeof entry.subjectDir === "string");
  return record ? folderLabel(record.subjectDir) : undefined;
}

/** J3's inventory over the boot pass's root, names, fresh claims and ledger. @complexity O(candidates + claims). */
async function readInventory(required: StorageSheetSourcesRequired): ReturnType<StorageSheetRequired["partitionInventory"]> {
  const { sessionDataDir, fs, isManaged, readClaims } = required.partitions;
  const inventory = await listAmbiguousPartitions({
    readRoot: () => resolvePartitionRoot({ sessionDataDir, fs }),
    list: ({ root }) => listCandidates({ root, fs, isManaged }),
    readClaims,
    readLedger: () => required.ledger.readStrict({}, {}),
  });
  if (inventory.state !== "ok") return { state: "unknown" };
  return { state: "ok", candidates: inventory.candidates.map(({ name, path: dir }) => ({ name, path: dir })) };
}

/** Live/starting/stopping/maintenance read at action time; a throw is unknown. */
function runtimeState(siteActivity: StorageSheetSourcesRequired["trash"]["siteActivity"], dir: string): SiteRuntimeState {
  try { return siteActivity({ dir }) === "idle" ? "stopped" : "running"; } catch { return "unknown"; }
}

/** Dismissed-folder OS Trash, re-checked inside the add/open fence for that folder. */
function bindTrash(required: StorageSheetSourcesRequired): StorageSheetSources["trashFolder"] {
  const { protectedRoots, fs, siteActivity, withAddOpenFence, trashItem } = required.trash;
  const readTrackedStrict = async () => {
    const file = required.readProjects({ projectsPath: required.projectsPath });
    return file.state === "ok" ? { state: "ok" as const, tracked: file.rows.map((row) => row.siteDir), dismissed: [...file.dismissed] } : { state: "unknown" as const };
  };
  return ({ dir }) => bindTrashDismissedFolder({
    readTrackedStrict, protectedRoots, fs, trashItem,
    siteState: async ({ dir: site }) => runtimeState(siteActivity, site),
    withAddOpenFence: (run) => withAddOpenFence({ dir, run }),
  })({ dir });
}

/**
 * The Storage sheet's real read + Trash ports. Listing is read-only end to end.
 * @complexity see each port; all O(1) to bind.
 */
export function bindStorageSheetSources(required: StorageSheetSourcesRequired, _optional: Record<string, never> = {}): StorageSheetSources {
  const reports = bindStorageReports({ runCli: bindRunCli(required.cli) }, { concurrency: 2, timeoutMs: 20_000 });
  return {
    listStrict: async () => readTrackedList(required),
    partitionInventory: () => readInventory(required),
    // The CLI resolves a relative dir against ITS cwd, so only an absolute folder is ever reported.
    runReport: async ({ dir }) => path.isAbsolute(dir) ? reports({ dir }) : { state: "unknown" },
    measureTree: async ({ path: target }) => {
      const size = await required.measure({ path: target });
      return size.state === "measured" ? size.bytes : null;
    },
    labelForPartition: ({ partition }) => labelFor(required, partition),
    trashFolder: bindTrash(required),
  };
}
