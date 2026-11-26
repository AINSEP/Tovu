/**
 * @file P11 ST-1a.T — ONE relaunch of the isolated packaged probe (the child side).
 *
 * The launcher (`main.ts`) runs every measurement as a fresh Electron process so that "relaunch" means
 * a real process restart against the same on-disk profile. Each child runs exactly one {@link ProbeStep}
 * through {@link runProbeStep}, whose effects are all behind {@link StepHost}, so the ordering rules are
 * testable without Electron:
 *  - the disposable root's identity marker is checked BEFORE anything else, so a step can never open
 *    a profile the launcher did not create for this run (and so never a production profile);
 *  - the cache switch, `userData` and `sessionData` are all applied before `ready` — Chromium reads
 *    them once at startup, so setting any of them later would silently measure the wrong profile;
 *  - every partition of the step is opened and driven concurrently, so occupancy overlaps.
 *
 * Nothing here imports the app's `main/`; the probe owns its own copy of the partition layout below.
 */
import path from "node:path";

import type { SurvivalObservation } from "./verdict.ts";

/** The marker file the launcher writes into the disposable root; its content is the run's token. */
export const ROOT_MARKER = ".tovu-cache-probe-identity";

export type StepAction = "fill-cache" | "seed-storage" | "clear-cache" | "clear-code-caches" | "clear-storage" | "read-storage";

export interface ProbeStep {
  readonly root: string;
  readonly token: string;
  readonly profile: string;
  readonly partitions: readonly string[];
  /** `disk-cache-size` in bytes, or `null` for an uncapped control. */
  readonly capBytes: number | null;
  readonly action: StepAction;
  readonly origin: string;
  /** Distinct cacheable resource ids per partition name. */
  readonly resources: Readonly<Record<string, readonly string[]>>;
}

/** One opened persistent partition (a hidden window on that session in the real host). */
export interface PartitionHandle {
  fetchCacheable(required: { urls: readonly string[] }): Promise<void>;
  seedStorage(): Promise<void>;
  readStorage(): Promise<SurvivalObservation>;
  clearCache(): Promise<void>;
  clearCodeCaches(): Promise<void>;
  clearStorageData(): Promise<void>;
  close(): Promise<void>;
}

/** Every effect one child step has. `readMarker` is synchronous on purpose: it must finish before `ready`. */
export interface StepHost {
  readMarker(required: { root: string }): string | null;
  appendSwitch(name: string, value: string): void;
  setPath(name: "userData" | "sessionData", value: string): void;
  whenReady(): Promise<void>;
  openPartition(required: { partition: string; origin: string }): Promise<PartitionHandle>;
}

export interface StepReport {
  readonly ok: boolean;
  readonly reason?: string;
  /** Storage read back per partition; filled only by `read-storage`. */
  readonly storage: Readonly<Record<string, SurvivalObservation>>;
}

/** Where a probe profile lives inside the disposable root. @complexity O(1). */
export function profilePaths({ root, profile }: { root: string; profile: string }, _optional: Record<string, never> = {}) {
  return { userData: path.join(root, profile, "userData"), sessionData: path.join(root, profile, "session") };
}

/** A persistent partition's `Cache` and `Code Cache` directories under `sessionData`. @complexity O(1). */
export function partitionCacheDirs({ sessionData, partition }: { sessionData: string; partition: string }, _optional: Record<string, never> = {}) {
  const dir = path.join(sessionData, "Partitions", partition.replace(/^persist:/, ""));
  return { cache: path.join(dir, "Cache"), codeCache: path.join(dir, "Code Cache") };
}

const blobUrls = (origin: string, ids: readonly string[]) => ids.map((id) => `${origin}/blob/${id}`);

/**
 * What each action does to one partition. `clear-cache` and `clear-code-caches` are the two
 * cache-only operations under test; `clear-storage` exists ONLY for the negative control, and the
 * launcher sends it only to a dedicated pair inside the disposable root.
 */
const ACTIONS: Readonly<Record<StepAction, (handle: PartitionHandle, urls: readonly string[]) => Promise<void>>> = {
  "fill-cache": (handle, urls) => handle.fetchCacheable({ urls }),
  "seed-storage": async (handle, urls) => { await handle.fetchCacheable({ urls }); await handle.seedStorage(); },
  "clear-cache": (handle) => handle.clearCache(),
  "clear-code-caches": (handle) => handle.clearCodeCaches(),
  "clear-storage": (handle) => handle.clearStorageData(),
  "read-storage": async () => {},
};

/** Applies everything Chromium reads at startup. Synchronous, so it all lands before `ready`. */
function applyStartup({ host, step }: { host: StepHost; step: ProbeStep }): void {
  if (step.capBytes !== null) host.appendSwitch("disk-cache-size", String(step.capBytes));
  const paths = profilePaths(step);
  host.setPath("userData", paths.userData);
  host.setPath("sessionData", paths.sessionData);
}

/**
 * Runs one step in this process. Refuses (`ok: false`) when the root's marker is not this run's token.
 * @param required.host the Electron-side effects; required.step what this relaunch does.
 * @returns the step report; storage readings only for `read-storage`.
 * @complexity O(partitions × resources) network work, all partitions concurrent.
 */
export async function runProbeStep({ host, step }: { host: StepHost; step: ProbeStep }, _optional: Record<string, never> = {}): Promise<StepReport> {
  if (host.readMarker({ root: step.root }) !== step.token) return { ok: false, reason: "disposable root identity mismatch", storage: {} };
  applyStartup({ host, step });
  await host.whenReady();
  const handles = await Promise.all(step.partitions.map((partition) => host.openPartition({ partition, origin: step.origin })));
  try {
    await Promise.all(handles.map((handle, index) => ACTIONS[step.action](handle, blobUrls(step.origin, step.resources[step.partitions[index]!] ?? []))));
    if (step.action !== "read-storage") return { ok: true, storage: {} };
    const readings = await Promise.all(handles.map(async (handle, index) => [step.partitions[index]!, await handle.readStorage()] as const));
    return { ok: true, storage: Object.fromEntries(readings) };
  } finally {
    await Promise.all(handles.map((handle) => handle.close()));
  }
}
