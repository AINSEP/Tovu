/**
 * P11 ST-18a.T — the Storage sheet's REAL bound sources (`storage-sheet-sources.ts`) behind the
 * registrar: the strict projects file, the boot pass's own claim sources (via the real
 * `bindDesktopPartitions`), J3's `listAmbiguousPartitions`, the CLI report and dismissed-folder Trash.
 * Real temp folders, so "nothing was removed" is checked on disk, not on a spy alone.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ChildProcess } from "node:child_process";
import { withFileLock } from "@jini-ai/platform/fs";
import { partitionDirName } from "@jini-ai/desktop-host/electron/partitions";
import { sitePartition } from "../../desktop-auth.ts";
import { bindDesktopPartitions, nodePartitionFs } from "../../desktop-partition-lock.ts";
import { readProjectsFile } from "../../tracked-sites.ts";
import { STORAGE_SHEET_CHANNELS } from "../../contracts/storage-sheet.ts";
import { createStorageItemIds } from "../../storage/storage-item-ids.ts";
import { registerStorageSheetIpc, type StorageIpcEvent, type StorageTarget } from "../../storage/storage-sheet-ipc.ts";
import { nodePartitionPassFs } from "./desktop-partition-pass.ts";
import { bindStorageSheetSources, type SiteActivity } from "./storage-sheet-sources.ts";

const REPORT = JSON.stringify({ totalBytes: 30, knownBytes: 30, classes: { automatic: { bytes: 10, files: 2 }, "owner-data": { bytes: 20, files: 3 } }, paths: ["/secret"] });

function fakeChild(stdout: string): ChildProcess {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), kill: () => true });
  setImmediate(() => { child.stdout.emit("data", Buffer.from(stdout)); child.emit("close", 0); });
  return child as unknown as ChildProcess;
}

const partitionOf = (siteDir: string) => partitionDirName(sitePartition({ siteDir }));

function world({ catalog = { listSiteDirs: () => [] as readonly string[] }, activity = {}, ledger = { state: "ok", records: [] } }: {
  catalog?: { listSiteDirs(): readonly string[] }; activity?: Record<string, SiteActivity | Error>;
  ledger?: { state: "ok"; records: readonly Record<string, unknown>[] } | { state: "unreadable" };
} = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "st18-src-")));
  const userData = path.join(root, "profile"), sites = path.join(root, "sites");
  const dir = (name: string) => path.join(sites, name);
  for (const name of ["a", "old", "live", "starting", "target"]) fs.mkdirSync(dir(name), { recursive: true });
  fs.mkdirSync(userData);
  fs.symlinkSync(dir("target"), dir("link"));
  const projectsPath = path.join(userData, "projects.json");
  const writeProjects = (tracked: string[], dismissed: string[]) => fs.writeFileSync(projectsPath, JSON.stringify({
    projects: tracked.map((siteDir) => ({ siteDir, createdAt: "2026-11-01T00:00:00.000Z" })), dismissed }));
  writeProjects([dir("a")], ["old", "live", "starting", "link"].map(dir));
  const partitionsRoot = path.join(userData, "Partitions");
  const stranger = `tovu-site-${"f".repeat(32)}`;
  for (const name of [partitionOf(dir("a")), partitionOf(dir("old")), stranger]) fs.mkdirSync(path.join(partitionsRoot, name, "Cookies"), { recursive: true });
  const binding = bindDesktopPartitions<{ name: string }>({
    app: { getPath: () => userData }, session: { fromPartition: (partition) => ({ name: partition }) },
    fs: nodePartitionFs({ fs }), fileLock: { withFileLock }, clock: { mono: () => performance.now(), now: () => Date.now() },
    scheduler: { sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)), every: () => ({ cancel: () => {} }) },
    process: { pid: process.pid, bootId: "boot", hostname: os.hostname(), isAlive: ({ pid }) => pid === process.pid, newToken: () => "a1" },
    projectsPath, catalog, instances: [], retirement: { invalidate: async () => {}, invalidateSync: () => {} },
    openMaintenance: async () => {}, log: () => {},
  });
  binding.registerHolder();
  const calls = { trashed: [] as string[], spawned: [] as string[][], fenced: [] as string[] };
  const sources = bindStorageSheetSources({
    projectsPath, readProjects: readProjectsFile,
    partitions: { sessionDataDir: userData, fs: nodePartitionPassFs({ fs }), isManaged: binding.isManaged, readClaims: binding.readClaims },
    ledger: { readStrict: () => ledger as never },
    cli: { planFor: ({ cliArgs }) => ({ command: "node", args: ["cli.js", ...cliArgs] }), spawn: ({ args }) => { calls.spawned.push([...args]); return fakeChild(REPORT); } },
    measure: async ({ path: target }) => fs.existsSync(target) ? { state: "measured", bytes: 1 } : { state: "unknown", reason: "missing" },
    trash: {
      protectedRoots: [userData], fs: { lstat: (target) => fs.promises.lstat(target), realpath: (target) => fs.promises.realpath(target) },
      siteActivity: ({ dir: site }) => {
        const state = activity[path.basename(site)];
        if (state instanceof Error) throw state;
        return state ?? "idle";
      },
      withAddOpenFence: ({ dir: site, run }) => { calls.fenced.push(site); return run(); },
      trashItem: async (target) => { calls.trashed.push(target); fs.rmSync(target, { recursive: true }); },
    },
  });
  const handlers = new Map<string, (event: StorageIpcEvent, payload: unknown) => Promise<unknown>>();
  let n = 0;
  registerStorageSheetIpc({
    ...sources, ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener as never); } }, allowedSender: () => true,
    removePartition: async () => { throw new Error("not under test"); }, confirmDialog: async () => true, tidyActions: async () => [],
    itemIds: createStorageItemIds<StorageTarget>({ randomId: () => `id-${++n}`, now: () => 0 }), reportError: () => {}, now: () => new Date(0),
  });
  const frame = {};
  const call = (channel: string, payload: unknown = {}) =>
    handlers.get(channel)!({ sender: { id: 1, mainFrame: frame, isDestroyed: () => false, getURL: () => "" }, senderFrame: frame }, payload);
  return { root, dir, userData, partitionsRoot, projectsPath, stranger, writeProjects, sources, calls, call };
}

type View = { sites: { label: string; totalBytes: number | null }[]; signIns: { state: string; items?: { id: string; label: string }[] }; otherFolders: { id: string; label: string }[] };
const list = async (w: ReturnType<typeof world>) => await w.call(STORAGE_SHEET_CHANNELS.list) as View;
const treeOf = (root: string): string[] => fs.readdirSync(root, { recursive: true, withFileTypes: false }).map(String).sort();

test("T-18.1 listing never removes owner folders", async () => {
  const w = world();
  const before = treeOf(w.root), projects = fs.readFileSync(w.projectsPath, "utf8");
  const view = await list(w);
  await list(w);
  assert.deepEqual(w.calls.trashed, []);
  assert.deepEqual(treeOf(w.root), before);
  assert.equal(fs.readFileSync(w.projectsPath, "utf8"), projects);
  assert.deepEqual(w.calls.spawned[0], ["cli.js", "storage", "report", w.dir("a"), "--json"]);
  assert.deepEqual(view.sites.map(({ label, totalBytes }) => ({ label, totalBytes })), [{ label: "a", totalBytes: 30 }]);
  // The tracked site's partition is claimed; the dismissed one is labelled from its folder; a stranger stays unnamed.
  assert.equal(view.signIns.state, "ok");
  assert.deepEqual(view.signIns.items!.map((item) => item.label).sort(), ["Unknown website", "old"]);
  assert.ok(!JSON.stringify(view).includes("tovu-site-"), "no partition key crosses the bridge");
  assert.deepEqual(view.otherFolders.map((folder) => folder.label), ["old", "live", "starting", "link"]);
  assert.deepEqual(await w.sources.runReport({ dir: "relative/site" }), { state: "unknown" });
  assert.equal(w.calls.spawned.length, 2, "a relative dir never reaches the CLI");
});

test("T-18.5 linked folder is refused", async () => {
  const w = world();
  assert.deepEqual(await w.sources.trashFolder({ dir: w.dir("link") }), { state: "kept", reason: "changed" });
  assert.deepEqual(w.calls.trashed, []);
  assert.ok(fs.existsSync(path.join(w.dir("target"))) && fs.lstatSync(w.dir("link")).isSymbolicLink());
  // The tracked site and the profile are never trashable either, dismissed or not.
  assert.deepEqual(await w.sources.trashFolder({ dir: w.dir("a") }), { state: "kept", reason: "changed" });
  assert.deepEqual(await w.sources.trashFolder({ dir: w.userData }), { state: "kept", reason: "changed" });
  assert.deepEqual(w.calls.trashed, []);
});

test("T-18.6 running or starting site is refused", async () => {
  const w = world({ activity: { live: "live", starting: "starting" } });
  assert.deepEqual(await w.sources.trashFolder({ dir: w.dir("live") }), { state: "kept", reason: "in-use" });
  assert.deepEqual(await w.sources.trashFolder({ dir: w.dir("starting") }), { state: "kept", reason: "in-use" });
  assert.deepEqual(w.calls.trashed, []);
  assert.ok(fs.existsSync(w.dir("live")) && fs.existsSync(w.dir("starting")));
  // A stopped, plain, dismissed folder does go to the OS Trash, inside the add/open fence for its own path.
  assert.deepEqual(await w.sources.trashFolder({ dir: w.dir("old") }), { state: "trashed" });
  assert.deepEqual(w.calls.trashed, [w.dir("old")]);
  assert.deepEqual(w.calls.fenced, [w.dir("live"), w.dir("starting"), w.dir("old")]);
});

test("broken catalog gives unknown and no sign-in action", async () => {
  let broken = false;
  const w = world({ catalog: { listSiteDirs: () => { if (broken) throw new Error("catalog damaged"); return []; } } });
  const healthy = await list(w);
  assert.equal(healthy.signIns.state, "ok", "control: a readable catalog lists sign-ins");
  broken = true;
  const view = await list(w);
  assert.deepEqual(view.signIns, { state: "unknown" });
  const stale = healthy.signIns.items![0]!.id;
  assert.deepEqual(await w.call(STORAGE_SHEET_CHANNELS.preview, { id: stale, action: "remove-sign-in" }), { state: "relist" });
  // A damaged projects file is a plain unknown too: no sites, no folders, no sign-ins, nothing trashable.
  broken = false;
  fs.writeFileSync(w.projectsPath, "{\"projects\": [");
  assert.deepEqual(await w.sources.listStrict(), { state: "unknown" });
  const damaged = await list(w);
  assert.deepEqual([damaged.sites, damaged.otherFolders, damaged.signIns], [[], [], { state: "unknown" }]);
  assert.equal(w.sources.labelForPartition({ partition: partitionOf(w.dir("old")) }), undefined);
  assert.deepEqual(await w.sources.trashFolder({ dir: w.dir("old") }), { state: "kept", reason: "unknown" });
  assert.ok(fs.existsSync(w.dir("old")) && fs.existsSync(path.join(w.partitionsRoot, w.stranger, "Cookies")));
});

test("an unreadable activity check keeps a dismissed folder, while an unreadable size is never reported as zero", async (t) => {
  const w = world({ activity: { old: new Error("site activity unavailable") } });
  t.after(() => fs.rmSync(w.root, { recursive: true, force: true }));
  const folder = w.dir("old"), data = path.join(folder, "draft.txt");
  fs.writeFileSync(data, "keep my draft");
  assert.equal(await w.sources.measureTree({ path: folder }), 1);
  assert.equal(await w.sources.measureTree({ path: w.dir("missing") }), null);
  assert.deepEqual(await w.sources.trashFolder({ dir: folder }), { state: "kept", reason: "unknown" });
  assert.deepEqual(w.calls.fenced, [folder]);
  assert.deepEqual(w.calls.trashed, []);
  assert.equal(fs.readFileSync(data, "utf8"), "keep my draft");
});

test("a forgotten partition is named from its erased ledger record only, and an unreadable ledger leaves it unnamed", async (t) => {
  const erasedDir = "/old-sites/bakery", strangerDir = "/old-sites/florist";
  const records = [
    { basis: "orphaned", partition: partitionOf(strangerDir) },
    { basis: "erased", partition: partitionOf(erasedDir), subjectDir: erasedDir },
  ];
  const w = world({ ledger: { state: "ok", records } });
  t.after(() => fs.rmSync(w.root, { recursive: true, force: true }));
  assert.equal(w.sources.labelForPartition({ partition: partitionOf(erasedDir) }), "bakery");
  assert.equal(w.sources.labelForPartition({ partition: partitionOf(strangerDir) }), undefined, "a record without a folder names nothing");
  assert.equal(w.sources.labelForPartition({ partition: partitionOf("/old-sites/unrecorded") }), undefined);
  const unreadable = world({ ledger: { state: "unreadable" } });
  t.after(() => fs.rmSync(unreadable.root, { recursive: true, force: true }));
  assert.equal(unreadable.sources.labelForPartition({ partition: partitionOf(erasedDir) }), undefined);
});
