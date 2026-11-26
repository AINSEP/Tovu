/**
 * @file P11 ST-1a.T — the isolated packaged probe's LAUNCHER: {@link runCacheProbe}.
 *
 * It answers, for exactly one packaged Electron build and platform, the two questions
 * `desktop-cache-policy.ts` refuses to guess: does `disk-cache-size` cap EACH persistent partition, and
 * do the cache-only clears (`clearCache`, `clearCodeCaches`, and unheld disk removal of `Cache` /
 * `Code Cache`) leave a persistent cookie, Local Storage and IndexedDB intact across relaunch.
 *
 * Shape of a run, all effects injected (the packaged wiring is `electron-host.ts` + `packaged-entry.ts`):
 *  1. an EXCLUSIVE disposable root (a fresh `mkdtemp`) plus an identity record (dev:ino and a marker
 *     token). Every relaunch and every disk removal re-checks both first; a changed root stops the run
 *     and voids the verdict. Nothing outside that root is ever opened, cleared or removed;
 *  2. one loopback-only server for the whole run (a stable origin, so storage keys survive relaunch);
 *  3. a capped profile with two real-shaped persistent partitions loaded together (overlapping
 *     occupancy), with distinct cacheable 1 MiB responses over several relaunch rounds, and an uncapped
 *     control profile under the same load; `Cache` and `Code Cache` are measured separately;
 *  4. four survival cases, each on its own fresh pair, plus a negative-control pair whose storage is
 *     deliberately cleared, proving the probe can see loss at all.
 * The readings go through `verdict.ts`; evidence is written ONLY when the run is a packaged app. This
 * file never touches `PACKAGED_CACHE_EVIDENCE`: a human reviews the artifact first.
 */
import path from "node:path";

import { probeVerdict, type PartitionObservation, type ProbeReadings, type ProbeVerdict, type SurvivalObservation } from "./verdict.ts";
import { partitionCacheDirs, profilePaths, type ProbeStep, type StepAction, type StepReport } from "./probe-step.ts";

/** The packaged Electron this probe may describe; pinned to `package-lock.json` and the probe builder config by the tests. */
export const PROBE_ELECTRON_VERSION = "43.8.6";
/** Two partitions shaped like the app's own (`persist:tovu-site-<digest>`); one partition cannot tell a per-partition cap from a shared pool. */
export const PROBE_PARTITIONS = ["persist:tovu-site-3f9a1c2e7b4d5a60", "persist:tovu-site-8c1e4b7a2d9f0e35"] as const;
const MiB = 2 ** 20;
const ROUNDS = 3;
const SEED_RESOURCES = 4;
const ROOT_PREFIX = "tovu-cache-probe-";

export interface ProbeElectron {
  readonly version: string;
  readonly platform: string;
  readonly isPackaged: boolean;
  /** Runs one step in a FRESH Electron process (a real relaunch) and returns its report. */
  launch(required: { step: ProbeStep }): Promise<StepReport>;
}
export interface ProbeLoopback { start(): Promise<{ readonly origin: string; close(): Promise<void> }> }
export interface ProbeAppPaths { readonly tempDir: string }
export interface ProbeFs {
  /** Creates a NEW directory that did not exist before (exclusive), returning its path. */
  makeExclusiveDir(required: { parent: string; prefix: string }): Promise<string>;
  /** A stable identity for a directory (e.g. `dev:ino`), or null when it is gone. */
  identity(required: { path: string }): Promise<string | null>;
  writeMarker(required: { root: string; token: string }): Promise<void>;
  readMarker(required: { root: string }): Promise<string | null>;
  removeDir(required: { path: string }): Promise<void>;
  randomToken(): string;
}
export interface ProbeMeasure { dirBytes(required: { path: string }): Promise<number | null> }
export interface EvidenceRecord {
  readonly electronVersion: string;
  readonly platform: string;
  readonly packaged: boolean;
  readonly tolerance: number;
  readonly readings: ProbeReadings;
  readonly verdict: ProbeVerdict;
  readonly reasons: readonly string[];
}
export interface EvidenceWriter { write(required: { fileName: string; record: EvidenceRecord }): Promise<string> }
export interface ProbeDeps {
  readonly electron: ProbeElectron;
  readonly loopback: ProbeLoopback;
  readonly appPaths: ProbeAppPaths;
  readonly fs: ProbeFs;
  readonly measure: ProbeMeasure;
  readonly evidenceWriter: EvidenceWriter;
}
export interface ProbeOptions { capBytes?: number; tolerance?: number; expected?: { electronVersion: string; platform: string } }
export interface ProbeResult { readonly verdict: ProbeVerdict; readonly record: EvidenceRecord; readonly evidenceFile: string | null }

interface Run {
  readonly deps: ProbeDeps;
  readonly root: { readonly path: string; readonly token: string; readonly identity: string | null };
  readonly origin: string;
  verified: boolean;
  readonly notes: string[];
}
type StepInput = Pick<ProbeStep, "profile" | "partitions" | "capBytes" | "action" | "resources">;

async function createRoot({ fs, appPaths }: ProbeDeps): Promise<Run["root"]> {
  const rootPath = await fs.makeExclusiveDir({ parent: appPaths.tempDir, prefix: ROOT_PREFIX });
  const token = fs.randomToken();
  await fs.writeMarker({ root: rootPath, token });
  return { path: rootPath, token, identity: await fs.identity({ path: rootPath }) };
}

/** The root is still the one this run created: same identity, same marker. Latches `verified` off. */
async function rootIntact(run: Run): Promise<boolean> {
  if (!run.verified) return false;
  const { fs } = run.deps;
  const same = run.root.identity !== null && (await fs.identity({ path: run.root.path })) === run.root.identity
    && (await fs.readMarker({ root: run.root.path })) === run.root.token;
  if (!same) { run.verified = false; run.notes.push("disposable root changed identity: run stopped"); }
  return same;
}

/** One relaunch. Null when the root is no longer ours or the child failed. */
async function launchStep(run: Run, input: StepInput): Promise<StepReport | null> {
  if (!(await rootIntact(run))) return null;
  const report = await run.deps.electron.launch({ step: { ...input, root: run.root.path, token: run.root.token, origin: run.origin } });
  if (report.ok) return report;
  run.notes.push(`${input.profile} ${input.action} failed: ${report.reason ?? "unknown"}`);
  if (report.reason === "disposable root identity mismatch") run.verified = false;
  return null;
}

/** Removes one directory, only inside the verified root. A path outside it is a programming error. */
async function removeInsideRoot(run: Run, target: string): Promise<void> {
  if (!target.startsWith(run.root.path + path.sep)) throw new Error(`refusing to remove outside the disposable root: ${target}`);
  if (await rootIntact(run)) await run.deps.fs.removeDir({ path: target });
}

const resourceIds = (profile: string, round: number, count: number) =>
  Object.fromEntries(PROBE_PARTITIONS.map((partition, index) => [partition, Array.from({ length: count }, (_, i) => `${profile}-p${index}-r${round}-${i}`)]));

async function measurePartitions(run: Run, profile: string): Promise<PartitionObservation[]> {
  const { sessionData } = profilePaths({ root: run.root.path, profile });
  return Promise.all(PROBE_PARTITIONS.map(async (name) => {
    const dirs = partitionCacheDirs({ sessionData, partition: name });
    return { name, cacheBytes: await run.deps.measure.dirBytes({ path: dirs.cache }), codeCacheBytes: await run.deps.measure.dirBytes({ path: dirs.codeCache }) };
  }));
}

const maxReading = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.max(a, b));
const missing = (): PartitionObservation[] => PROBE_PARTITIONS.map((name) => ({ name, cacheBytes: null, codeCacheBytes: null }));

/**
 * Fills both partitions together over {@link ROUNDS} relaunches and keeps each partition's peak.
 * @complexity O(ROUNDS × partitions × perRound) requests.
 */
async function occupancy(run: Run, { profile, capBytes, perRound }: { profile: string; capBytes: number | null; perRound: number }): Promise<PartitionObservation[]> {
  let peak: PartitionObservation[] | null = null;
  for (let round = 0; round < ROUNDS; round += 1) {
    const report = await launchStep(run, { profile, partitions: PROBE_PARTITIONS, capBytes, action: "fill-cache", resources: resourceIds(profile, round, perRound) });
    const now = report ? await measurePartitions(run, profile) : missing();
    peak = peak === null ? now : now.map((obs, i) => ({ name: obs.name, cacheBytes: maxReading(obs.cacheBytes, peak![i]!.cacheBytes), codeCacheBytes: maxReading(obs.codeCacheBytes, peak![i]!.codeCacheBytes) }));
  }
  return peak ?? missing();
}

type CacheOp = { readonly action: StepAction } | { readonly remove: "cache" | "codeCache" };
const SURVIVAL_CASES: Readonly<Record<keyof ProbeReadings["survival"], CacheOp>> = {
  clearCache: { action: "clear-cache" },
  clearCodeCaches: { action: "clear-code-caches" },
  diskCache: { remove: "cache" },
  diskCodeCache: { remove: "codeCache" },
};

async function applyOp(run: Run, profile: string, op: CacheOp, capBytes: number): Promise<void> {
  if ("action" in op) { await launchStep(run, { profile, partitions: PROBE_PARTITIONS, capBytes, action: op.action, resources: {} }); return; }
  const { sessionData } = profilePaths({ root: run.root.path, profile });
  for (const partition of PROBE_PARTITIONS) await removeInsideRoot(run, partitionCacheDirs({ sessionData, partition })[op.remove]);
}

/** Seed (launch) → operate (launch, or unheld disk removal between launches) → read back (launch). */
async function storageAfter(run: Run, { profile, op, capBytes }: { profile: string; op: CacheOp; capBytes: number }): Promise<Record<string, SurvivalObservation> | null> {
  const base = { profile, partitions: PROBE_PARTITIONS, capBytes };
  if (!(await launchStep(run, { ...base, action: "seed-storage", resources: resourceIds(profile, 0, SEED_RESOURCES) }))) return null;
  await applyOp(run, profile, op, capBytes);
  const report = await launchStep(run, { ...base, action: "read-storage", resources: {} });
  return report && PROBE_PARTITIONS.every((partition) => partition in report.storage) ? { ...report.storage } : null;
}

const FIELDS = ["cookie", "localStorage", "indexedDb"] as const;
/** Every partition kept every kind of storage → true per field; any missing reading → null overall. */
function combineSurvival(storage: Record<string, SurvivalObservation> | null): SurvivalObservation | null {
  if (storage === null) return null;
  const all = Object.values(storage);
  const field = (key: (typeof FIELDS)[number]) => (all.some((obs) => obs[key] === null) ? null : all.every((obs) => obs[key] === true));
  return { cookie: field("cookie"), localStorage: field("localStorage"), indexedDb: field("indexedDb") };
}
/** The negative control must see every kind of storage lost in every partition. */
const detectedLoss = (storage: Record<string, SurvivalObservation> | null) =>
  storage === null ? null : Object.values(storage).every((obs) => FIELDS.every((key) => obs[key] === false));

async function survivalReadings(run: Run, capBytes: number) {
  const survival: Record<string, SurvivalObservation | null> = {};
  for (const [name, op] of Object.entries(SURVIVAL_CASES)) survival[name] = combineSurvival(await storageAfter(run, { profile: `survival-${name}`, op, capBytes }));
  const negative = await storageAfter(run, { profile: "negative-control", op: { action: "clear-storage" }, capBytes });
  return { survival: survival as ProbeReadings["survival"], negativeControlDetectedLoss: detectedLoss(negative) };
}

async function collectReadings(run: Run, { capBytes, tolerance }: { capBytes: number; tolerance: number }): Promise<ProbeReadings> {
  const perRound = Math.ceil((capBytes * tolerance) / MiB) + 8;
  const partitions = await occupancy(run, { profile: "capped", capBytes, perRound });
  const control = await occupancy(run, { profile: "uncapped", capBytes: null, perRound });
  const controlBytes = control.map((obs) => obs.cacheBytes);
  const uncappedControlBytes = controlBytes.includes(null) ? null : Math.min(...(controlBytes as number[]));
  const { survival, negativeControlDetectedLoss } = await survivalReadings(run, capBytes);
  const { electron } = run.deps;
  return { electronVersion: electron.version, platform: electron.platform, profileVerified: run.verified, capBytes, partitions, uncappedControlBytes, survival, negativeControlDetectedLoss };
}

/**
 * Runs the whole isolated probe once and (packaged runs only) writes its evidence file.
 * @param required every effect: Electron relaunches, the loopback server, the disposable root's fs,
 *   directory measurement and the evidence writer.
 * @param optional.capBytes the `disk-cache-size` under test (32 MiB); optional.tolerance allowed
 *   overshoot (1.25); optional.expected the exact Electron version and platform the evidence may describe.
 * @returns the verdict, the full record, and the evidence path (null when nothing was written).
 * @complexity O(rounds × partitions × requests) plus five survival pairs of three launches each.
 */
export async function runCacheProbe(
  deps: ProbeDeps,
  { capBytes = 32 * 2 ** 20, tolerance = 1.25, expected = { electronVersion: PROBE_ELECTRON_VERSION, platform: "darwin-arm64" } }: ProbeOptions = {},
): Promise<ProbeResult> {
  const root = await createRoot(deps);
  const server = await deps.loopback.start();
  const run: Run = { deps, root, origin: server.origin, verified: root.identity !== null, notes: [] };
  try {
    const readings = await collectReadings(run, { capBytes, tolerance });
    const verdict = probeVerdict({ readings, expected }, { tolerance });
    const packagedNote = deps.electron.isPackaged ? [] : ["not a packaged run: no evidence written"];
    const record: EvidenceRecord = { electronVersion: readings.electronVersion, platform: readings.platform, packaged: deps.electron.isPackaged, tolerance, readings, verdict, reasons: [...verdict.reasons, ...run.notes, ...packagedNote] };
    const fileName = `ST-1a-electron-${readings.electronVersion}-${readings.platform}.json`;
    const evidenceFile = deps.electron.isPackaged ? await deps.evidenceWriter.write({ fileName, record }) : null;
    return { verdict, record, evidenceFile };
  } finally {
    await server.close();
    if (await rootIntact(run)) await deps.fs.removeDir({ path: root.path });
  }
}
