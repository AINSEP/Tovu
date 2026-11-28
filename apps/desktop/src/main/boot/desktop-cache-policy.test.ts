/**
 * P11 ST-1.T / ST-3.T — the production cache and code-cache binding. Behaviour tests inject GO
 * evidence fixtures; the shipped evidence (no packaged probe has run) must enable nothing.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { withFileLock } from "@jini-ai/platform/fs";
import type { PackagedEvidence, PartitionWriterContext } from "@jini-ai/desktop-host/electron/partitions";
import { sitePartition } from "../../desktop-auth.ts";
import { bindDesktopPartitions, nodePartitionFs, NO_RETIREMENT } from "../../desktop-partition-lock.ts";
import {
  bindDesktopCachePolicy, bindDesktopCodeCache, desktopCacheMaintenance, desktopMaintenanceMarker, evidenceForElectron,
  measureTreeBytes, nodeCacheFs, PACKAGED_CACHE_EVIDENCE, UNKNOWN_EVIDENCE,
} from "./desktop-cache-policy.ts";

const MiB = 2 ** 20;
const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const GO: PackagedEvidence = { cap: "go", clearOps: { clearCache: "go", clearCodeCaches: "go" } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "st1-3-"));
const noClock = { sleep: () => new Promise<void>(() => {}) };
const unheld = async () => ({ state: "ok" as const, value: [] });
let tokenSeq = 0;
const newToken = () => (tokenSeq += 1).toString(16).padStart(8, "0");

function fakeApp({ ready = false, sessionData = "/profile" }: { ready?: boolean; sessionData?: string } = {}) {
  const switches: Array<{ name: string; value: string; readyAtCall: boolean }> = [];
  const app = {
    isReady: () => ready, getPath: (_name: "sessionData") => sessionData,
    commandLine: { appendSwitch: (name: string, value: string) => { switches.push({ name, value, readyAtCall: ready }); } },
  };
  return { app, switches };
}

/** A profile on disk: `<userData>/Partitions/<name>` with sign-in stores and both caches. */
function profileWithPartition({ cacheBytes = 4096 }: { cacheBytes?: number } = {}) {
  const userData = tmp(), name = "tovu-site-0123456789abcdef0123456789abcdef";
  const dir = path.join(userData, "Partitions", name);
  for (const sub of ["Cache", "Code Cache", "Local Storage/leveldb", "IndexedDB/http_x.indexeddb.leveldb"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(path.join(dir, "Cache", "data_1"), Buffer.alloc(cacheBytes, 1));
  fs.writeFileSync(path.join(dir, "Code Cache", "js"), Buffer.alloc(cacheBytes, 2));
  fs.writeFileSync(path.join(dir, "Cookies"), "cookie-jar");
  fs.writeFileSync(path.join(dir, "Local Storage/leveldb/000003.log"), "local-storage");
  fs.writeFileSync(path.join(dir, "IndexedDB/http_x.indexeddb.leveldb/000003.log"), "indexed-db");
  return { userData, name, dir };
}

/** The partition pass's writer context for a fenced boot run; `rename` can be made busy. */
function bootDeps({ userData, busyRenames = 0 }: { userData: string; busyRenames?: number }) {
  let busy = busyRenames;
  const real = nodeCacheFs({ fs });
  const cacheFs = { ...real, rename: async (input: { oldPath: string; newPath: string }) => {
    if (busy > 0) { busy -= 1; throw Object.assign(new Error("busy"), { code: "EBUSY" }); }
    return real.rename(input);
  } };
  const writer: PartitionWriterContext = {
    assertHeld: async () => {}, setTarget: async () => {},
    readClaims: async () => { throw new Error("not used"); },
    resolveRoot: async () => ({ state: "ok", root: fs.realpathSync(path.join(userData, "Partitions")) }),
  };
  return { cacheFs, writer };
}

function bindBoth({ userData, evidence = GO, cacheFs, launchMode = () => "fresh" as const, appVersion = "1.0.0", readHoldersStrict = unheld }: {
  userData: string; evidence?: PackagedEvidence; cacheFs: ReturnType<typeof nodeCacheFs>; launchMode?: () => "update" | "fresh";
  appVersion?: string; readHoldersStrict?: typeof unheld;
}) {
  const marker = desktopMaintenanceMarker({ userDataDir: userData, fs });
  const interlock = { readHoldersStrict, newToken, isManaged: (n: string) => n.startsWith("tovu-site-"), clock: noClock };
  const { app } = fakeApp({ sessionData: userData });
  const measure = (input: { path: string }) => measureTreeBytes({ fs, path: input.path });
  const cache = bindDesktopCachePolicy({ app, evidenceForBundledElectron: () => evidence, interlock, marker, fs: cacheFs, measure }, { cacheBytes: 1024 });
  const codeCache = bindDesktopCodeCache({ appVersion, argv: [], launchMode, evidence, interlock, marker, fs: cacheFs, measure, sessionDataDir: userData }, { maxBytes: 1024 });
  return { cache, codeCache, marker, maintenance: desktopCacheMaintenance({ cache, codeCache }) };
}

// ── ST-1.T ───────────────────────────────────────────────────────────────────────────────

test("T-1.1 switch set before ready", () => {
  const before = fakeApp();
  const policy = bindDesktopCachePolicy({ app: before.app, evidenceForBundledElectron: () => GO, interlock: { readHoldersStrict: unheld, newToken, clock: noClock },
    marker: desktopMaintenanceMarker({ userDataDir: tmp(), fs }), fs: nodeCacheFs({ fs }), measure: async () => ({ state: "measured", bytes: 0 }) });
  assert.deepEqual(before.switches, [{ name: "disk-cache-size", value: String(32 * MiB), readyAtCall: false }]);
  assert.deepEqual(policy.switch, { state: "applied", cacheBytes: 32 * MiB });
  // After ready Chromium has read its switches: setting one then would claim a bound that does not exist.
  const after = fakeApp({ ready: true });
  const late = bindDesktopCachePolicy({ app: after.app, evidenceForBundledElectron: () => GO, interlock: { readHoldersStrict: unheld, newToken, clock: noClock },
    marker: desktopMaintenanceMarker({ userDataDir: tmp(), fs }), fs: nodeCacheFs({ fs }), measure: async () => ({ state: "measured", bytes: 0 }) });
  assert.deepEqual(after.switches, []);
  assert.deepEqual(late.switch, { state: "skipped", reason: "after-ready" });
  // Production order: after the profile (`userData`) is selected and before `app.whenReady()`.
  const main = fs.readFileSync(path.join(DESKTOP_ROOT, "src/main/index.ts"), "utf8");
  const bind = main.indexOf("bindDesktopCachePolicy(");
  assert.ok(bind > main.indexOf("applyUserDataDir({"), "bound after the profile is selected");
  assert.ok(bind > 0 && bind < main.indexOf("app.whenReady().then("), "bound before ready");
});

test("T-1.2 NO-GO evidence ⇒ no switch", () => {
  for (const evidence of [{ ...GO, cap: "no-go" as const }, { ...GO, cap: "unknown" as const }]) {
    const { app, switches } = fakeApp();
    const policy = bindDesktopCachePolicy({ app, evidenceForBundledElectron: () => evidence, interlock: { readHoldersStrict: unheld, newToken, clock: noClock },
      marker: desktopMaintenanceMarker({ userDataDir: tmp(), fs }), fs: nodeCacheFs({ fs }), measure: async () => ({ state: "measured", bytes: 0 }) });
    assert.deepEqual(switches, []);
    assert.equal(policy.switch.state, "skipped");
  }
  // A GO verdict measured on another Electron version or platform is no verdict at all.
  const records = [{ electronVersion: "43.8.6", platform: "darwin" as const, evidence: GO, source: "fixture" }];
  assert.deepEqual(evidenceForElectron({ records, electronVersion: "43.8.7", platform: "darwin" }), UNKNOWN_EVIDENCE);
  assert.deepEqual(evidenceForElectron({ records, electronVersion: "43.8.6", platform: "win32" }), UNKNOWN_EVIDENCE);
  assert.deepEqual(evidenceForElectron({ records, electronVersion: "43.8.6", platform: "darwin" }), GO);
});

test("T-1.3 a busy partition is retried next start", async () => {
  const { userData, name, dir } = profileWithPartition();
  const first = bootDeps({ userData, busyRenames: 1 });
  const start1 = bindBoth({ userData, cacheFs: first.cacheFs });
  const busy = await start1.cache.bootMaintenance({ partition: name, path: dir, classification: "tracked", writer: first.writer });
  assert.deepEqual(busy, { state: "pending", reason: "busy" });
  assert.ok(fs.existsSync(path.join(dir, "Cache", "data_1")), "a busy cache is left in place");
  assert.equal((await start1.marker.readCacheClear({ partition: name })).state, "pending");
  const second = bootDeps({ userData });
  const start2 = bindBoth({ userData, cacheFs: second.cacheFs });
  const cleared = await start2.cache.bootMaintenance({ partition: name, path: dir, classification: "tracked", writer: second.writer });
  assert.equal(cleared.state, "cleared");
  assert.ok(!fs.existsSync(path.join(dir, "Cache")), "retried and renamed aside on the next start");
  assert.deepEqual(await start2.marker.readCacheClear({ partition: name }), { state: "done", capBytes: 1024 });
});

test("T-1.4 marker is per profile", async () => {
  const a = tmp(), b = tmp();
  const markerA = desktopMaintenanceMarker({ userDataDir: a, fs }), markerB = desktopMaintenanceMarker({ userDataDir: b, fs });
  await markerA.markCacheClear({ partition: "tovu-site-x", capBytes: 1024, outcome: { state: "done" } });
  assert.deepEqual(await markerA.readCacheClear({ partition: "tovu-site-x" }), { state: "done", capBytes: 1024 });
  assert.deepEqual(await markerB.readCacheClear({ partition: "tovu-site-x" }), { state: "absent" });
  assert.deepEqual(fs.readdirSync(a), ["partition-maintenance.json"]);
  assert.deepEqual(fs.readdirSync(b), []);
});

test("production evidence is unknown, so no switch and no clear", async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
  const bundled = pkg.devDependencies.electron!.replace(/^[^\d]*/, "");
  for (const platform of ["darwin", "win32", "linux"] as const) {
    assert.deepEqual(evidenceForElectron({ records: PACKAGED_CACHE_EVIDENCE, electronVersion: bundled, platform }), UNKNOWN_EVIDENCE);
  }
  const evidence = evidenceForElectron({ records: PACKAGED_CACHE_EVIDENCE, electronVersion: bundled, platform: "darwin" });
  const { userData, name, dir } = profileWithPartition({ cacheBytes: 200 * 1024 });
  const { app, switches } = fakeApp({ sessionData: userData });
  const calls: string[] = [];
  const session = { clearCache: async () => { calls.push("clearCache"); }, clearCodeCaches: async () => { calls.push("clearCodeCaches"); } };
  const marker = desktopMaintenanceMarker({ userDataDir: userData, fs });
  const interlock = { readHoldersStrict: unheld, newToken, isManaged: () => true, clock: noClock };
  const measure = (input: { path: string }) => measureTreeBytes({ fs, path: input.path });
  const cache = bindDesktopCachePolicy({ app, evidenceForBundledElectron: () => evidence, interlock, marker, fs: nodeCacheFs({ fs }), measure }, { cacheBytes: 1024 });
  const codeCache = bindDesktopCodeCache({ appVersion: "2.0.0", argv: ["--updated"], launchMode: () => "update", evidence, interlock, marker, fs: nodeCacheFs({ fs }), measure, sessionDataDir: userData }, { maxBytes: 1024 });
  const both = desktopCacheMaintenance({ cache, codeCache });
  await both.open({ partition: name, subjectDir: "/site", session });
  await both.boot({ partition: name, path: dir, classification: "tracked", writer: bootDeps({ userData }).writer });
  assert.deepEqual(switches, []);
  assert.deepEqual(calls, []);
  assert.ok(fs.existsSync(path.join(dir, "Cache", "data_1")) && fs.existsSync(path.join(dir, "Code Cache", "js")));
});

// ── ST-3.T ───────────────────────────────────────────────────────────────────────────────

test("T-3.3 > 64 MB cleared at open", async () => {
  const calls: string[] = [], settled: string[] = [];
  const sizes: Record<string, number> = { a: 64 * MiB + 1, b: 64 * MiB };
  const marker = { ...desktopMaintenanceMarker({ userDataDir: tmp(), fs }), settleCodeCache: async ({ partition }: { partition: string }) => { settled.push(partition); } };
  const codeCache = bindDesktopCodeCache({ appVersion: "1.0.0", argv: [], launchMode: () => "fresh", evidence: GO,
    interlock: { readHoldersStrict: unheld, newToken, isManaged: () => true, clock: noClock }, marker, fs: nodeCacheFs({ fs }),
    measure: async ({ path: p }) => ({ state: "measured", bytes: sizes[path.basename(path.dirname(p))]! }), sessionDataDir: "/profile" });
  for (const partition of ["a", "b"]) {
    await codeCache.openHook({ partition, session: { clearCodeCaches: async () => { calls.push(partition); } } });
  }
  assert.deepEqual(calls, ["a"], "only the code cache over 64 MiB is cleared");
  assert.deepEqual(settled, ["a"]);
});

test("T-3.4 busy code cache retried next start", async () => {
  const { userData, name, dir } = profileWithPartition();
  const first = bootDeps({ userData, busyRenames: 2 });
  const start1 = bindBoth({ userData, cacheFs: first.cacheFs, launchMode: () => "update", appVersion: "2.0.0", evidence: { ...GO, clearOps: { clearCache: "no-go", clearCodeCaches: "go" } } });
  const busy = await start1.codeCache.bootMaintenance({ partition: name, path: dir, classification: "tracked", writer: first.writer });
  assert.deepEqual(busy, { state: "ran", update: true, cleared: [], kept: [{ partition: name, reason: "busy" }] });
  const queued = await start1.marker.readCodeCache();
  assert.deepEqual(queued, { state: "ok", lastLaunchVersion: "2.0.0", forVersion: "2.0.0", pending: [name] });
  const second = bootDeps({ userData });
  const start2 = bindBoth({ userData, cacheFs: second.cacheFs, appVersion: "2.0.0" });
  const cleared = await start2.codeCache.bootMaintenance({ partition: name, path: dir, classification: "tracked", writer: second.writer });
  assert.deepEqual(cleared, { state: "ran", update: false, cleared: [name], kept: [] });
  assert.ok(!fs.existsSync(path.join(dir, "Code Cache")));
});

test("T-3.5 storage untouched", async () => {
  const { userData, name, dir } = profileWithPartition();
  const stores = ["Cookies", "Local Storage/leveldb/000003.log", "IndexedDB/http_x.indexeddb.leveldb/000003.log"];
  const before = stores.map((file) => fs.readFileSync(path.join(dir, file)));
  const { cacheFs, writer } = bootDeps({ userData });
  const { maintenance } = bindBoth({ userData, cacheFs, launchMode: () => "update", appVersion: "2.0.0" });
  await maintenance.boot({ partition: name, path: dir, classification: "tracked", writer });
  assert.ok(!fs.existsSync(path.join(dir, "Cache")) && !fs.existsSync(path.join(dir, "Code Cache")), "both caches went aside");
  assert.deepEqual(stores.map((file) => fs.readFileSync(path.join(dir, file))), before);
});

test("T-3.6 second window of a held site does not clear", async () => {
  const userData = tmp(), siteDir = path.join(userData, "site-a");
  const name = sitePartition({ siteDir }).replace(/^persist:/, "");
  const dir = path.join(userData, "Partitions", name);
  fs.mkdirSync(path.join(dir, "Code Cache"), { recursive: true });
  fs.writeFileSync(path.join(userData, "projects.json"), JSON.stringify({ projects: [{ siteDir, createdAt: "2026-11-01T00:00:00.000Z" }], dismissed: [] }));
  const calls: string[] = [];
  let hooks: ReturnType<typeof desktopCacheMaintenance> | undefined;
  const binding = bindDesktopPartitions({
    app: { getPath: () => userData },
    session: { fromPartition: () => ({ clearCache: async () => { calls.push("clearCache"); }, clearCodeCaches: async () => { calls.push("clearCodeCaches"); } }) },
    fs: nodePartitionFs({ fs }), fileLock: { withFileLock }, clock: { mono: () => performance.now(), now: () => Date.now() },
    scheduler: { sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)), every: () => ({ cancel: () => {} }) },
    process: { pid: process.pid, bootId: "boot", hostname: os.hostname(), isAlive: ({ pid }) => pid === process.pid, newToken },
    projectsPath: path.join(userData, "projects.json"), catalog: undefined, instances: [], retirement: NO_RETIREMENT,
    openMaintenance: (input) => hooks!.open(input), log: () => {},
  });
  binding.registerHolder();
  const huge = async () => ({ state: "measured" as const, bytes: 100 * MiB });
  const marker = desktopMaintenanceMarker({ userDataDir: userData, fs });
  const interlock = { readHoldersStrict: binding.readHoldersStrict, newToken: binding.newToken, isManaged: binding.isManaged, clock: noClock };
  const cache = bindDesktopCachePolicy({ app: fakeApp({ sessionData: userData }).app, evidenceForBundledElectron: () => GO, interlock, marker, fs: nodeCacheFs({ fs }), measure: huge }, { cacheBytes: 1024 });
  const codeCache = bindDesktopCodeCache({ appVersion: "2.0.0", argv: [], launchMode: () => "update", evidence: GO, interlock, marker, fs: nodeCacheFs({ fs }), measure: huge, sessionDataDir: userData });
  hooks = desktopCacheMaintenance({ cache, codeCache });
  assert.equal((await binding.acquireSite({ siteDir })).maintenance, "ran");
  assert.deepEqual(calls, ["clearCache", "clearCodeCaches"], "ST-1 then ST-3, before first use");
  assert.equal((await binding.acquireSite({ siteDir })).maintenance, "already-held");
  assert.deepEqual(calls, ["clearCache", "clearCodeCaches"], "the second window shares the live session and clears nothing");
  // A boot pass running while this site is held leaves its code cache where it is.
  const result = await binding.withPartitionWriter({ run: (writer) => codeCache.bootMaintenance({ partition: name, path: dir, classification: "tracked", writer }) });
  assert.deepEqual(result, { state: "ran", value: { state: "ran", update: true, cleared: [], kept: [{ partition: name, reason: "held" }] } });
  assert.ok(fs.existsSync(path.join(dir, "Code Cache")));
});

test("cache sizing treats only a missing root as empty", async (t) => {
  const root = tmp();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const vanished = path.join(root, "vanished");
  assert.deepEqual(await measureTreeBytes({ fs, path: vanished }), { state: "measured", bytes: 0 });

  // Simulate a file removed after readdir but before lstat, without racing real I/O.
  const disappearing: typeof fs = { ...fs, promises: new Proxy(fs.promises, { get: (real, key) => (key === "readdir" ? async () => ["vanished"] : Reflect.get(real, key)) }) };
  assert.deepEqual(await measureTreeBytes({ fs: disappearing, path: root }), { state: "unknown", reason: "ENOENT" });
  const unreadable: typeof fs = { ...fs, promises: { ...fs.promises, lstat: async () => { throw new Error("stat adapter failed"); } } };
  assert.deepEqual(await measureTreeBytes({ fs: unreadable, path: root }), { state: "unknown", reason: "Error: stat adapter failed" });
});

test("cache sizing respects its entry budget and does not follow symlinks", async (t) => {
  const base = tmp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const cache = path.join(base, "cache");
  const external = path.join(base, "external");
  fs.mkdirSync(cache);
  fs.writeFileSync(external, Buffer.alloc(128));
  fs.writeFileSync(path.join(cache, "entry"), "12345");
  fs.symlinkSync(external, path.join(cache, "outside-link"));
  assert.deepEqual(await measureTreeBytes({ fs, path: cache }, { maxEntries: 3 }), { state: "measured", bytes: 5 });
  assert.deepEqual(await measureTreeBytes({ fs, path: cache }, { maxEntries: 2 }), { state: "unknown", reason: "more than 2 entries" });
});

test("with version inference off, a fresh launch preserves code cache until an explicit update", async (t) => {
  const { userData, name, dir } = profileWithPartition();
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const marker = desktopMaintenanceMarker({ userDataDir: userData, fs });
  const launch = (appVersion: string, mode: "fresh" | "update") => {
    const { writer, cacheFs } = bootDeps({ userData });
    const codeCache = bindDesktopCodeCache({
      appVersion, argv: [], launchMode: () => mode, marker, fs: cacheFs, evidence: GO,
      interlock: { readHoldersStrict: unheld, newToken, isManaged: (candidate) => candidate === name, clock: noClock },
      measure: async () => assert.fail("boot does not measure code cache"), sessionDataDir: userData,
    }, { versionChangeIsUpdate: false });
    return codeCache.bootMaintenance({ partition: name, path: dir, classification: "tracked", writer });
  };

  const entry = path.join(dir, "Code Cache", "js");
  await marker.writeLaunchVersion({ version: "1.0.0" });
  assert.deepEqual(await launch("2.0.0", "fresh"), { state: "ran", update: false, cleared: [], kept: [] });
  assert.deepEqual(fs.readFileSync(entry), Buffer.alloc(4096, 2));
  assert.deepEqual(await launch("2.0.0", "update"), { state: "ran", update: true, cleared: [name], kept: [] });
  assert.equal(fs.existsSync(entry), false);
  assert.equal(fs.readFileSync(path.join(dir, "Cookies"), "utf8"), "cookie-jar");
});
