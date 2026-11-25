/**
 * P11 ST-1.T / ST-3.T — the production binding of Jini's cache-only partition maintenance.
 *
 * No enabled behaviour without packaged evidence: the HTTP cache switch, the cache clear and the
 * code-cache clear each run only on a `'go'` verdict that a packaged probe (ST-1a.T) recorded for the
 * exact bundled Electron version and platform. No such probe has run, so {@link PACKAGED_CACHE_EVIDENCE}
 * is empty and every verdict resolves to `'unknown'`: no switch, no clear. Every mutation here is
 * cache-only (`Cache`, `Code Cache`); Cookies, Local Storage and IndexedDB are never touched.
 *
 * Wiring: {@link bindDesktopCachePolicy} runs after the profile is selected and before `ready`; the
 * open half runs as the interlock's pre-held `openMaintenance` hook list (ST-1 then ST-3), and the boot
 * half is a per-partition item for ST-2c's partition pass, so it runs only inside that pass's writer
 * fence. There is no independent sweep.
 */
import type fsModule from "node:fs";
import path from "node:path";
import {
  applyDesktopCacheLimits, clearCodeCacheOnUpdate, clearPartitionCacheOnce, createMaintenanceMarker, maybeClearCodeCacheAtOpen,
  type CacheClearResult, type CacheFsPort, type CodeCacheFsPort, type CodeCacheOpenResult, type CodeCacheUpdateResult,
  type HolderRecord, type MaintenanceMarker, type PackagedEvidence, type PartitionMaintenance, type PartitionWriterContext,
  type SizeRead, type StrictRead, type TimeoutClock,
} from "@jini-ai/desktop-host/electron/partitions";

const MiB = 2 ** 20;
type Measure = (required: { path: string }) => Promise<SizeRead>;
type BootInput = Parameters<PartitionMaintenance>[0];

export const UNKNOWN_EVIDENCE: PackagedEvidence = { cap: "unknown", clearOps: { clearCache: "unknown", clearCodeCaches: "unknown" } };
/** One packaged-probe verdict (`plans/evidence/ST-1a-electron-<ver>-<platform>.json`). */
export interface CacheEvidenceRecord { electronVersion: string; platform: NodeJS.Platform; evidence: PackagedEvidence; source: string }
/**
 * The packaged-probe verdicts shipped with this build. Empty: ST-1a.T (the packaged Mac probe) has not
 * run, so there is no evidence for any bundled Electron, and nothing is enabled.
 */
export const PACKAGED_CACHE_EVIDENCE: readonly CacheEvidenceRecord[] = [];

/**
 * The verdict for exactly this Electron version and platform, else all-unknown. Why an Electron upgrade
 * invalidates the verdict: the probe measured one Chromium's disk-cache backend, its handling of
 * `disk-cache-size` across persistent partitions, and which files `clearCache`/`clearCodeCaches` touch.
 * Any of those can change in any Electron release (patch included), so a GO for one version says nothing
 * about another; there is no version range and no "nearest" match, and an upgrade needs a fresh probe.
 * @complexity O(records).
 */
export function evidenceForElectron(
  { records, electronVersion, platform }: { records: readonly CacheEvidenceRecord[]; electronVersion: string | undefined; platform: NodeJS.Platform },
  _optional: Record<string, never> = {},
): PackagedEvidence {
  const match = records.find((record) => record.electronVersion === electronVersion && record.platform === platform);
  return match ? match.evidence : UNKNOWN_EVIDENCE;
}

/** The per-profile maintenance record, `<userData>/partition-maintenance.json`. @complexity O(1). */
export function desktopMaintenanceMarker({ userDataDir, fs }: { userDataDir: string; fs: typeof fsModule }, _optional: Record<string, never> = {}): MaintenanceMarker {
  return createMaintenanceMarker({ file: path.join(userDataDir, "partition-maintenance.json"), fs: {
    readFile: ({ path: file }) => fs.promises.readFile(file, "utf8"),
    writeFile: async ({ path: file, data }) => {
      const handle = await fs.promises.open(file, "w");
      try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    },
    rename: ({ oldPath, newPath }) => fs.promises.rename(oldPath, newPath),
  } });
}

/** Node `fs` as the cache and code-cache port. @complexity O(1) per call. */
export function nodeCacheFs({ fs }: { fs: typeof fsModule }, _optional: Record<string, never> = {}): CodeCacheFsPort {
  return {
    mkdir: async ({ path: dir }) => { await fs.promises.mkdir(dir, { recursive: true }); },
    rename: ({ oldPath, newPath }) => fs.promises.rename(oldPath, newPath),
    readdir: ({ path: dir }) => fs.promises.readdir(dir),
    lstat: ({ path: file }) => fs.promises.lstat(file),
    realpath: ({ path: file }) => fs.promises.realpath(file),
  };
}

/**
 * Bytes under a cache folder, without following links. A missing folder is 0 bytes; anything it cannot
 * read, or a tree over `maxEntries`, answers unknown rather than guessing (unknown never clears).
 * @complexity O(min(entries, maxEntries)) fs calls.
 */
export async function measureTreeBytes(
  { fs, path: root }: { fs: typeof fsModule; path: string },
  { maxEntries = 50_000 }: { maxEntries?: number } = {},
): Promise<SizeRead> {
  const walk = { bytes: 0, seen: 0, stack: [root] };
  try {
    while (walk.stack.length > 0) {
      if (!(await visit({ fs, walk, maxEntries }))) return { state: "unknown", reason: `more than ${maxEntries} entries` };
    }
  } catch (error) { return unreadable(error, walk.seen); }
  return { state: "measured", bytes: walk.bytes };
}

/** A missing root is an empty cache; any other read failure, or one mid-walk, is unknown. */
function unreadable(error: unknown, seen: number): SizeRead {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" && seen === 0 ? { state: "measured", bytes: 0 } : { state: "unknown", reason: String(code ?? error) };
}

/** One entry of the walk; false once the entry cap is passed. Links are counted, never followed. */
async function visit({ fs, walk, maxEntries }: { fs: typeof fsModule; walk: { bytes: number; seen: number; stack: string[] }; maxEntries: number }): Promise<boolean> {
  const at = walk.stack.pop()!;
  const stat = await fs.promises.lstat(at);
  if ((walk.seen += 1) > maxEntries) return false;
  if (stat.isDirectory()) for (const name of await fs.promises.readdir(at)) walk.stack.push(path.join(at, name));
  else if (stat.isFile()) walk.bytes += stat.size;
  return true;
}

export interface DesktopCacheInterlock {
  readHoldersStrict: () => Promise<StrictRead<HolderRecord[]>>;
  /** Lowercase hex; names the cache-only aside folder. */
  newToken: () => string;
  clock: TimeoutClock;
}
export interface BindDesktopCachePolicyRequired {
  app: { isReady(): boolean; getPath(name: "sessionData"): string; commandLine: { appendSwitch(name: string, value: string): void } };
  evidenceForBundledElectron: () => PackagedEvidence;
  interlock: DesktopCacheInterlock;
  marker: MaintenanceMarker;
  fs: CacheFsPort;
  measure: Measure;
}
export type CacheSwitchResult = ReturnType<typeof applyDesktopCacheLimits> | { state: "skipped"; reason: "after-ready" };

/**
 * ST-1: set the HTTP cache cap switch now (call after the profile is selected, before `ready`), and
 * return the open hook and the boot pass item that clear an oversized `Cache`.
 * @complexity O(1) to bind; each hook is one measurement plus O(1) fs calls.
 */
export function bindDesktopCachePolicy(
  { app, evidenceForBundledElectron, interlock, marker, fs, measure }: BindDesktopCachePolicyRequired,
  { cacheBytes = 32 * MiB, fallbackMultiplier = 2 }: { cacheBytes?: number; fallbackMultiplier?: number } = {},
) {
  const evidence = evidenceForBundledElectron();
  // Chromium reads its switches once at startup; a switch appended after ready bounds nothing.
  const cacheSwitch: CacheSwitchResult = app.isReady()
    ? { state: "skipped", reason: "after-ready" }
    : applyDesktopCacheLimits({ appendSwitch: (name, value) => app.commandLine.appendSwitch(name, value), evidence, cacheBytes });
  const partitionsRoot = path.join(app.getPath("sessionData"), "Partitions");
  const shared = { fs, measure, marker, evidence, capBytes: cacheBytes };
  return {
    evidence, switch: cacheSwitch,
    openHook: ({ partition, session }: { partition: string; session: { clearCache(): Promise<void> } }): Promise<CacheClearResult> =>
      clearPartitionCacheOnce({ ...shared, partition: { name: partition, dir: path.join(partitionsRoot, partition) },
        interlock: { phase: "open", session, clock: interlock.clock } }, { fallbackMultiplier }),
    bootMaintenance: ({ partition, path: dir, writer }: BootInput): Promise<CacheClearResult> =>
      clearPartitionCacheOnce({ ...shared, partition: { name: partition, dir },
        interlock: { phase: "boot", writer, readHoldersStrict: interlock.readHoldersStrict, newToken: interlock.newToken } }, { fallbackMultiplier }),
  };
}

export interface BindDesktopCodeCacheRequired {
  appVersion: string;
  argv: readonly string[];
  /** The explicit post-install relaunch signal (`desktopLaunchMode`). */
  launchMode: (required: { argv: readonly string[] }) => "update" | "fresh";
  evidence: PackagedEvidence;
  interlock: DesktopCacheInterlock & { isManaged: (name: string) => boolean };
  marker: MaintenanceMarker;
  fs: CodeCacheFsPort;
  measure: Measure;
  sessionDataDir: string;
}

/**
 * ST-3: clear stale `Code Cache` after an update (boot, inside the pass fence) and an oversized one at
 * open. Why version comparison is an update fallback, not a reason to delete login state: Squirrel.Mac
 * relaunches without an "updated" flag, so a changed app version is how an update is noticed there; but
 * a version change only says compiled code from the old build may be stale. That queues `Code Cache`
 * renames (re-creatable, rebuilt on next use) and nothing else; it never says a site is gone, so it is
 * never grounds for touching Cookies, Local Storage or IndexedDB, or for removing a partition.
 * @complexity O(1) to bind; the boot item is O(partitions) once per pass.
 */
export function bindDesktopCodeCache(
  { appVersion, argv, launchMode, evidence, interlock, marker, fs, measure, sessionDataDir }: BindDesktopCodeCacheRequired,
  { versionChangeIsUpdate = true, maxBytes = 64 * MiB }: { versionChangeIsUpdate?: boolean; maxBytes?: number } = {},
) {
  const isUpdate = launchMode({ argv }) === "update";
  const partitionsRoot = path.join(sessionDataDir, "Partitions");
  // One run per pass: the update record (pending before launch version) covers every managed partition at once.
  const runs = new WeakMap<PartitionWriterContext, Promise<CodeCacheUpdateResult>>();
  const runInFence = async (writer: PartitionWriterContext): Promise<CodeCacheUpdateResult> => {
    const read = versionChangeIsUpdate || isUpdate ? null : await marker.readCodeCache();
    // With the version fallback off, the last launch version stands in so only the flag marks an update.
    const version = read?.state === "ok" ? read.lastLaunchVersion ?? appVersion : appVersion;
    return clearCodeCacheOnUpdate({ fs, marker, evidence, version, isUpdate, interlock: {
      // The pass already holds the writer lock with its fence; taking it again would only answer busy.
      withPartitionWriter: async <T>({ run }: { run: (context: PartitionWriterContext) => Promise<T> }) => ({ state: "ran" as const, value: await run(writer) }),
      readHoldersStrict: interlock.readHoldersStrict, isManaged: interlock.isManaged, newToken: interlock.newToken,
    } });
  };
  return {
    openHook: ({ partition, session }: { partition: string; session: { clearCodeCaches(options: Record<string, never>): Promise<void> } }): Promise<CodeCacheOpenResult> =>
      maybeClearCodeCacheAtOpen({ session, evidence, clock: interlock.clock,
        measure: () => measure({ path: path.join(partitionsRoot, partition, "Code Cache") }),
        marker: { settle: () => marker.settleCodeCache({ partition }) } }, { maxBytes }),
    bootMaintenance: ({ writer }: BootInput): Promise<CodeCacheUpdateResult> => {
      const existing = runs.get(writer);
      if (existing) return existing;
      const started = runInFence(writer);
      runs.set(writer, started);
      return started;
    },
  };
}

type OpenSession = { clearCache(): Promise<void>; clearCodeCaches(options: Record<string, never>): Promise<void> };

/**
 * The hook lists in order (ST-1 then ST-3). `open` is the interlock's pre-held `openMaintenance`; `boot`
 * is the maintenance item for ST-2c's `runDesktopPartitionPass`, run per partition inside its fence.
 * @complexity O(1) composition.
 */
export function desktopCacheMaintenance(
  { cache, codeCache }: { cache: ReturnType<typeof bindDesktopCachePolicy>; codeCache: ReturnType<typeof bindDesktopCodeCache> },
  _optional: Record<string, never> = {},
) {
  return {
    open: async ({ partition, session }: { partition: string; subjectDir: string; session: OpenSession }): Promise<void> => {
      await cache.openHook({ partition, session });
      await codeCache.openHook({ partition, session });
    },
    boot: (async (input: BootInput): Promise<void> => {
      await cache.bootMaintenance(input);
      await codeCache.bootMaintenance(input);
    }) satisfies PartitionMaintenance,
  };
}
