/**
 * P11 ST-1a.T — the isolated probe's launcher, driven end to end against an in-memory fake Electron.
 * No real Electron, no real profile: the fake world models per-partition (or shared-pool) cache caps,
 * the three storage kinds, and the disposable root's identity. Each child step runs through the REAL
 * `runProbeStep`, so the action→session-call mapping is under test too. The packaged run itself is
 * external (a Mac); nothing here writes real evidence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PROBE_ELECTRON_VERSION, PROBE_PARTITIONS, runCacheProbe, type EvidenceRecord, type ProbeFs } from "./main.ts";
import { partitionCacheDirs, runProbeStep, type PartitionHandle, type StepHost } from "./probe-step.ts";

const MiB = 2 ** 20;
const LIMIT = 32 * MiB * 1.25;
type Store = { cookie: boolean; localStorage: boolean; indexedDb: boolean };
const LOST: Store = { cookie: false, localStorage: false, indexedDb: false };
const KEPT: Store = { cookie: true, localStorage: true, indexedDb: true };

interface WorldOptions { sharedPool?: boolean; blindStorageClear?: boolean; diskCacheRemovalWipesStorage?: boolean; version?: string; swapRootAfter?: number; isPackaged?: boolean }

function fakeWorld(options: WorldOptions = {}) {
  const dirs = new Map<string, number>();
  const stores = new Map<string, Store>();
  const markers = new Map<string, string>();
  const removed: string[] = [];
  const written: { fileName: string; record: EvidenceRecord }[] = [];
  const launches: string[][] = [];
  let identityReads = 0;
  let serverClosed = false;
  const fs: ProbeFs = {
    makeExclusiveDir: async ({ parent, prefix }) => `${parent}/${prefix}A1b2C3`,
    identity: async () => (++identityReads > (options.swapRootAfter ?? Infinity) ? "dev1:ino99" : "dev1:ino42"),
    writeMarker: async ({ root, token }) => { markers.set(root, token); },
    readMarker: async ({ root }) => markers.get(root) ?? null,
    removeDir: async ({ path: target }) => {
      removed.push(target);
      if (options.diskCacheRemovalWipesStorage && target.endsWith(`${path.sep}Cache`)) stores.delete(path.dirname(target));
      for (const key of [...dirs.keys()]) if (key === target || key.startsWith(target + path.sep)) dirs.delete(key);
    },
    randomToken: () => "run-token",
  };
  /** Shrinks the profile's caches to the switch: per partition, or as one shared pool. */
  const enforce = (sessionData: string, cap: number | null, cache: string) => {
    if (cap === null) return;
    if (!options.sharedPool) { dirs.set(cache, Math.min(dirs.get(cache) ?? 0, cap)); return; }
    const pool = [...dirs.keys()].filter((key) => key.startsWith(sessionData) && key.endsWith(`${path.sep}Cache`));
    const total = pool.reduce((sum, key) => sum + dirs.get(key)!, 0);
    if (total > cap) for (const key of pool) dirs.set(key, Math.floor((dirs.get(key)! * cap) / total));
  };
  const handle = (sessionData: string, partition: string, cap: number | null): PartitionHandle => {
    const { cache, codeCache } = partitionCacheDirs({ sessionData, partition });
    const storeKey = path.dirname(cache);
    return {
      fetchCacheable: async ({ urls }) => {
        dirs.set(cache, (dirs.get(cache) ?? 0) + urls.length * MiB);
        dirs.set(codeCache, (dirs.get(codeCache) ?? 0) + urls.length * 4096);
        enforce(sessionData, cap, cache);
      },
      seedStorage: async () => { stores.set(storeKey, { ...KEPT }); },
      readStorage: async () => ({ ...(stores.get(storeKey) ?? LOST) }),
      clearCache: async () => { dirs.set(cache, 0); },
      clearCodeCaches: async () => { dirs.set(codeCache, 0); },
      clearStorageData: async () => { if (!options.blindStorageClear) stores.delete(storeKey); },
      close: async () => {},
    };
  };
  const stepHost = (calls: string[]): StepHost => {
    let ready = false;
    let cap: number | null = null;
    let sessionData = "";
    const beforeReady = (name: string) => { if (ready) throw new Error(`${name} after ready`); calls.push(name); };
    return {
      readMarker: ({ root }) => { beforeReady("readMarker"); return markers.get(root) ?? null; },
      appendSwitch: (name, value) => { beforeReady(`switch:${name}`); cap = Number(value); },
      setPath: (name, value) => { beforeReady(`setPath:${name}`); if (name === "sessionData") sessionData = value; },
      whenReady: async () => { ready = true; calls.push("ready"); },
      openPartition: async ({ partition }) => handle(sessionData, partition, cap),
    };
  };
  const deps = {
    electron: {
      version: options.version ?? PROBE_ELECTRON_VERSION, platform: "darwin-arm64", isPackaged: options.isPackaged ?? true,
      launch: async ({ step }: { step: Parameters<typeof runProbeStep>[0]["step"] }) => {
        const calls: string[] = [];
        launches.push(calls);
        return runProbeStep({ host: stepHost(calls), step });
      },
    },
    loopback: { start: async () => ({ origin: "http://127.0.0.1:41234", close: async () => { serverClosed = true; } }) },
    appPaths: { tempDir: "/tmp" },
    fs,
    measure: { dirBytes: async ({ path: target }: { path: string }) => dirs.get(target) ?? null },
    evidenceWriter: { write: async ({ fileName, record }: { fileName: string; record: EvidenceRecord }) => { written.push({ fileName, record }); return `plans/evidence/${fileName}`; } },
  };
  return { deps, removed, written, launches, isServerClosed: () => serverClosed };
}

test("T-1a.1 cache stays under the switch per partition", async () => {
  const world = fakeWorld();
  const result = await runCacheProbe(world.deps);
  assert.equal(result.verdict.cap, "go", result.verdict.reasons.join("; "));
  assert.equal(result.record.readings.partitions.length, 2);
  for (const observation of result.record.readings.partitions) {
    assert.ok(observation.cacheBytes! > 0 && observation.cacheBytes! <= LIMIT, `${observation.name} stays under the switch`);
    assert.ok(observation.codeCacheBytes! > 0, "Code Cache is measured separately");
  }
  assert.ok(result.record.readings.uncappedControlBytes! > LIMIT, "the uncapped control grows past the cap");
  for (const calls of world.launches) assert.equal(calls[0], "readMarker", "identity before anything else");
  for (const calls of world.launches) assert.ok(calls.indexOf("setPath:sessionData") < calls.indexOf("ready") && calls.includes("setPath:userData"));
  assert.ok(world.launches.some((calls) => calls.includes("switch:disk-cache-size")) && world.launches.some((calls) => !calls.includes("switch:disk-cache-size")));
  assert.deepEqual(world.written.map((entry) => entry.fileName), ["ST-1a-electron-43.8.6-darwin-arm64.json"]);
  assert.equal(result.evidenceFile, "plans/evidence/ST-1a-electron-43.8.6-darwin-arm64.json");
  assert.ok(world.isServerClosed());
});

test("T-1a.2 cookie, Local Storage and IndexedDB survive each cache operation", async () => {
  const kept = await runCacheProbe(fakeWorld().deps);
  assert.deepEqual(kept.record.readings.survival, { clearCache: KEPT, clearCodeCaches: KEPT, diskCache: KEPT, diskCodeCache: KEPT });
  assert.deepEqual(kept.verdict.clearOps, { clearCache: "go", clearCodeCaches: "go" });
  assert.equal(kept.record.readings.negativeControlDetectedLoss, true);
  const diskLoss = await runCacheProbe(fakeWorld({ diskCacheRemovalWipesStorage: true }).deps);
  assert.deepEqual(diskLoss.record.readings.survival.diskCache, LOST, "the probe sees storage loss from a disk removal");
  assert.deepEqual(diskLoss.verdict.clearOps, { clearCache: "no-go", clearCodeCaches: "go" });
});

test("shared pool is not evidence of a per-partition cap", async () => {
  const result = await runCacheProbe(fakeWorld({ sharedPool: true }).deps);
  assert.equal(result.verdict.cap, "no-go");
  assert.ok(result.verdict.reasons.includes("combined occupancy fits one pool: no per-partition evidence"));
});

test("wrong profile or Electron version cannot yield GO", async () => {
  const wrongVersion = await runCacheProbe(fakeWorld({ version: "43.8.7" }).deps);
  assert.deepEqual([wrongVersion.verdict.cap, wrongVersion.verdict.clearOps], ["no-go", { clearCache: "no-go", clearCodeCaches: "no-go" }]);
  const world = fakeWorld({ swapRootAfter: 3 });
  const swapped = await runCacheProbe(world.deps);
  assert.equal(swapped.record.readings.profileVerified, false);
  assert.deepEqual([swapped.verdict.cap, swapped.verdict.clearOps], ["no-go", { clearCache: "no-go", clearCodeCaches: "no-go" }]);
  assert.equal(world.launches.length, 2, "no relaunch once the root's identity changed");
  assert.deepEqual(world.removed, [], "a root that is no longer ours is never removed");
});

test("a negative control that does not detect storage loss yields no GO", async () => {
  const result = await runCacheProbe(fakeWorld({ blindStorageClear: true }).deps);
  assert.equal(result.record.readings.negativeControlDetectedLoss, false);
  assert.deepEqual([result.verdict.cap, result.verdict.clearOps], ["no-go", { clearCache: "no-go", clearCodeCaches: "no-go" }]);
});

test("disk removals stay inside the disposable root, and only a packaged run writes evidence", async () => {
  const world = fakeWorld({ isPackaged: false });
  const result = await runCacheProbe(world.deps);
  assert.ok(world.removed.length > 0 && world.removed.every((target) => target.startsWith("/tmp/tovu-cache-probe-A1b2C3")));
  assert.deepEqual(world.written, []);
  assert.equal(result.evidenceFile, null);
  assert.ok(result.record.reasons.includes("not a packaged run: no evidence written"));
});

test("the probe build uses the app's exact Electron and two real-shaped persistent partitions", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const lock = JSON.parse(readFileSync(path.join(here, "..", "..", "package-lock.json"), "utf8")) as { packages: Record<string, { version: string }> };
  assert.equal(PROBE_ELECTRON_VERSION, lock.packages["node_modules/electron"]!.version);
  assert.match(readFileSync(path.join(here, "electron-builder.probe.yml"), "utf8"), new RegExp(`^electronVersion: "${PROBE_ELECTRON_VERSION}"$`, "m"));
  assert.equal(new Set(PROBE_PARTITIONS).size, 2);
  for (const partition of PROBE_PARTITIONS) assert.match(partition, /^persist:tovu-site-[0-9a-f]{16}$/);
});
