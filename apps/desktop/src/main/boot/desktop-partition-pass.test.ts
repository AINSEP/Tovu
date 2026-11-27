/** ST-2c.T — the desktop boot partition pass, against the REAL desktop binding: real temp dirs, the
 * real platform file lock, the real projects-file writer and the real per-profile retirement ledger.
 * Owner rule (a) is the point: a login is never erased for a live site or another site, and any
 * unknown keeps the partition. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withFileLock } from "@jini-ai/platform/fs";
import { partitionDirName, removeAmbiguousPartition, runPartitionPass, type PartitionMaintenance, type PartitionPassFsPort } from "@jini-ai/desktop-host/electron/partitions";
import { sitePartition } from "../../desktop-auth.ts";
import { bindDesktopPartitions, nodePartitionFs } from "../../desktop-partition-lock.ts";
import { desktopJsonFile } from "../../durable-json-file.ts";
import { bindDesktopRetirement } from "../../site-retirement.ts";
import { trackSite } from "../../tracked-sites.ts";
import { nodePartitionPassFs, runDesktopPartitionPass, type DesktopPartitionPassLogEvent, type DesktopPartitionPassRequired } from "./desktop-partition-pass.ts";
import { bindStorageSignInRemoval } from "./storage-sheet-binding.ts";

const sleep = ({ ms }: { ms: number }) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function fixture({ sessionData }: { sessionData?: string } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "st2c-")));
  const userData = path.join(base, "profile"), partitionsRoot = path.join(userData, "Partitions");
  fs.mkdirSync(partitionsRoot, { recursive: true });
  const projectsPath = path.join(userData, "projects.json");
  const retirement = bindDesktopRetirement({ userDataDir: userData, sessionDataDir: userData, eraseVersion: "9.9.9", partitionFor: sitePartition,
    fs, clock: { now: () => Date.parse("2026-11-25T12:00:00.000Z") }, id: randomUUID, durableJsonFor: desktopJsonFile });
  const folder = (partition: string) => partition.replace(/^persist:/, "");
  let tokens = 0;
  const binding = bindDesktopPartitions<{ name: string }>({
    app: { getPath: (name) => name === "sessionData" && sessionData ? sessionData : userData },
    session: { fromPartition: (partition) => ({ name: partition }) },
    fs: nodePartitionFs({ fs }), fileLock: { withFileLock },
    clock: { mono: () => performance.now(), now: () => Date.now() },
    scheduler: { sleep, every: () => ({ cancel: () => {} }) },
    process: { pid: process.pid, bootId: "boot", hostname: os.hostname(), isAlive: ({ pid }) => pid === process.pid, newToken: () => `a${(tokens += 1).toString(16)}` },
    projectsPath, catalog: { listSiteDirs: () => [] }, instances: [],
    retirement: {
      invalidate: async ({ partition, reason }) => { retirement.port.invalidate({ partition: folder(partition), reason }, {}); },
      invalidateSync: ({ partition, reason }) => { retirement.port.invalidate({ partition: folder(partition), reason }, {}); },
    },
    openMaintenance: async () => {},
    log: () => {},
  });
  assert.deepEqual(binding.registerHolder(), { state: "registered" });
  const logs: DesktopPartitionPassLogEvent[] = [];
  const writeProjects = (siteDirs: string[]) => fs.writeFileSync(projectsPath,
    JSON.stringify({ projects: siteDirs.map((siteDir) => ({ siteDir, createdAt: "2026-11-01T00:00:00.000Z" })), dismissed: [] }));
  /** A site's partition folder holding a sign-in store (`Cookies`) and a cache folder. */
  const partitionFor = (siteDir: string) => {
    const dir = path.join(partitionsRoot, partitionDirName(sitePartition({ siteDir })));
    fs.mkdirSync(path.join(dir, "Cache"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Cookies"), "session=owner");
    return dir;
  };
  /** The erase arm's proof: the site folder was captured, erased and is certainly gone. */
  const retired = (name: string) => {
    const siteDir = path.join(base, name);
    fs.mkdirSync(siteDir);
    const partitionDir = partitionFor(siteDir);
    const candidate = retirement.port.capture({ siteDir, siteId: name }, {});
    assert.ok(candidate, "the erase arm captured a proof");
    fs.rmSync(siteDir, { recursive: true });
    retirement.port.append({ candidate }, {});
    return { siteDir, partitionDir };
  };
  const run = ({ passFs = nodePartitionPassFs({ fs }), maintenance = [], bootWaitMs, partitionPass = runPartitionPass, mono = () => performance.now() }: {
    passFs?: PartitionPassFsPort; maintenance?: PartitionMaintenance[]; bootWaitMs?: number;
    partitionPass?: DesktopPartitionPassRequired["partitionPass"]; mono?: () => number;
  } = {}) =>
    runDesktopPartitionPass({
      partitionPass, claims: binding, ledger: retirement.ledger, fs: passFs, root: { isManaged: binding.isManaged },
      maintenance, log: (event) => logs.push(event), mono, scheduler: { sleep },
      newToken: () => randomUUID().replace(/-/g, ""),
    }, bootWaitMs === undefined ? {} : { bootWaitMs });
  return { base, userData, partitionsRoot, projectsPath, binding, retirement, logs, writeProjects, partitionFor, retired, run };
}

/** The pass's fs, with a hook after a whole partition is renamed into the aside folder. */
function onAsideRename(base: PartitionPassFsPort, hook: (required: { from: string }) => void): PartitionPassFsPort {
  return { ...base, rename: async (input) => {
    await base.rename(input);
    if (path.basename(path.dirname(input.newPath)) === ".removing" && /^tovu-site-[0-9a-f]{32}$/.test(path.basename(input.oldPath))) hook({ from: input.oldPath });
  } };
}

test("a proven-retired partition is removed whole when nothing claims it", async () => {
  const f = fixture();
  f.writeProjects([]);
  const gone = f.retired("site-gone");
  const run = await f.run();
  const report = await run.settled;
  assert.equal(report.result, "done");
  assert.deepEqual(report.removed, [path.basename(gone.partitionDir)]);
  assert.equal(fs.existsSync(gone.partitionDir), false);
  assert.equal(run.lastReport(), report, "the last pass report is retained for desktop Storage");
});

test("T-2c.2 sibling starting during a sweep keeps its partition", async () => {
  const f = fixture();
  f.writeProjects([]);
  const site = f.retired("site-sibling");
  // An older sibling copy of the app starts mid-sweep and tracks the same folder again. It predates
  // the retirement ledger, so it writes the tracked list only: the post-rename tracked recheck is the
  // one thing that can still see it before the removal commits.
  const passFs = onAsideRename(nodePartitionPassFs({ fs }), () => f.writeProjects([site.siteDir]));
  const report = await (await f.run({ passFs })).settled;
  assert.deepEqual(report.removed, [], "the sibling's partition is not removed");
  assert.deepEqual(report.restored, [path.basename(site.partitionDir)]);
  assert.equal(fs.readFileSync(path.join(site.partitionDir, "Cookies"), "utf8"), "session=owner", "its sign-in survives");
  assert.deepEqual(fs.readdirSync(path.join(f.partitionsRoot, ".removing")), [], "nothing is left aside");
});

test("T-2c.3 add/open during discovery keeps the partition", async () => {
  const f = fixture();
  f.writeProjects([]);
  const added = f.retired("site-added"), opened = f.retired("site-opened");
  let opening: ReturnType<typeof f.binding.acquireSite> | undefined;
  const base = nodePartitionPassFs({ fs });
  const passFs: PartitionPassFsPort = { ...base, readdir: async (input) => {
    const names = await base.readdir(input);
    if (input.path === f.partitionsRoot && !opening) {
      // Discovery is listing the partitions: the owner adds one site back and opens the other.
      trackSite({ projectsPath: f.projectsPath, siteDir: added.siteDir, beforeAddedRows: f.binding.beforeAddedRows });
      opening = f.binding.acquireSite({ siteDir: opened.siteDir });
    }
    return names;
  } };
  const report = await (await f.run({ passFs })).settled;
  assert.ok(opening, "the add/open happened during discovery");
  assert.deepEqual(report.removed, []);
  for (const site of [added, opened]) assert.equal(fs.readFileSync(path.join(site.partitionDir, "Cookies"), "utf8"), "session=owner");
  assert.equal((await opening).state, "held", "the open completes once the writer settles");
});

test("T-2c.6 ambiguous partition keeps Cookies", async () => {
  const f = fixture();
  f.writeProjects([]);
  // No tracked row and no proof: an untracked card, an unplugged drive or an older sibling's site.
  const dir = f.partitionFor(path.join(f.base, "site-unknown"));
  const seen: string[] = [];
  const report = await (await f.run({ maintenance: [async ({ partition, classification }) => { seen.push(`${classification}:${partition}`); }] })).settled;
  assert.deepEqual(report.removed, []);
  assert.equal(fs.readFileSync(path.join(dir, "Cookies"), "utf8"), "session=owner", "sign-in data is never touched");
  assert.equal(fs.existsSync(path.join(dir, "Cache")), false, "only the measured cache folder goes");
  assert.deepEqual(report.cacheCleared, [path.basename(dir)]);
  assert.deepEqual(seen, [`ambiguous:${path.basename(dir)}`], "every maintenance hook in the list runs under the fence");
});

test("T-2c.7 damaged tracked list ⇒ pass skipped", async () => {
  const f = fixture();
  fs.writeFileSync(f.projectsPath, "{\"projects\": [ {\"siteDir\": ");
  const site = f.retired("site-damaged");
  const run = await f.run();
  const report = await run.settled;
  assert.equal(report.result, "skipped");
  assert.equal(report.reason, "unknown-claims");
  assert.equal(fs.readFileSync(path.join(site.partitionDir, "Cookies"), "utf8"), "session=owner");
  assert.ok(fs.existsSync(path.join(site.partitionDir, "Cache")), "a skipped pass touches nothing");
  assert.deepEqual(f.logs, [{ event: "pass-skipped", detail: "unknown-claims" }], "logged once");
  assert.equal(run.lastReport(), report);
});

test("a session root outside the profile is never swept, and that is logged once", async () => {
  const foreign = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "st2c-foreign-")));
  const f = fixture({ sessionData: foreign });
  f.writeProjects([]);
  let called = 0;
  const run = await runDesktopPartitionPass({
    partitionPass: async () => { called += 1; throw new Error("must not run"); }, claims: f.binding, ledger: f.retirement.ledger,
    fs: nodePartitionPassFs({ fs }), root: { isManaged: f.binding.isManaged }, maintenance: [], log: (event) => f.logs.push(event),
    mono: () => 0, scheduler: { sleep }, newToken: () => "ab",
  });
  assert.equal(called, 0);
  assert.equal((await run.settled).reason, "foreign-session-root");
  assert.deepEqual(f.logs, [{ event: "pass-skipped", detail: "foreign-session-root" }]);
});

test("the boot wait ends at bootWaitMs, but the writer keeps the fence until the pass settles", async () => {
  const f = fixture();
  const siteDir = path.join(f.base, "site-live");
  fs.mkdirSync(siteDir);
  f.writeProjects([siteDir]);
  f.partitionFor(siteDir);
  let release!: () => void;
  const hook: PartitionMaintenance = () => new Promise<void>((done) => { release = done; });
  const run = await f.run({ maintenance: [hook], bootWaitMs: 30 });
  assert.equal(run.wait, "continuing", "the UI stops waiting at the budget");
  assert.equal(run.lastReport(), null, "no report until the pass settles");
  let acquired = false;
  const opening = f.binding.acquireSite({ siteDir }).then((result) => { acquired = true; return result; });
  await sleep({ ms: 150 });
  assert.equal(acquired, false, "an open still waits: the outstanding writer was not released by the timeout");
  release();
  const report = await run.settled;
  assert.equal((await opening).state, "held");
  assert.equal(report.result, "done");
  assert.deepEqual(f.logs.map((entry) => entry.event), ["pass-continuing", "pass-done"]);
});

test("T6 confirmed sign-in removal: a site added back after the owner confirmed keeps its sign-in (real interlock)", async () => {
  const f = fixture();
  f.writeProjects([]);
  const unclaimed = (name: string) => { const siteDir = path.join(f.base, name); fs.mkdirSync(siteDir); return { siteDir, partitionDir: f.partitionFor(siteDir) }; };
  const raced = unclaimed("site-raced"), idle = unclaimed("site-idle");
  const remove = (passFs: PartitionPassFsPort) => bindStorageSignInRemoval({ removeAmbiguousPartition, interlock: f.binding, ledger: f.retirement.ledger,
    fs: passFs, root: { isManaged: f.binding.isManaged }, newToken: () => randomUUID().replace(/-/g, "") });
  // The owner confirmed in the Storage sheet; while the removal is mid-rename the site is added back.
  const racing = onAsideRename(nodePartitionPassFs({ fs }), () => trackSite({ projectsPath: f.projectsPath, siteDir: raced.siteDir, beforeAddedRows: f.binding.beforeAddedRows }));
  const kept = await remove(racing)({ partition: path.basename(raced.partitionDir), confirmed: true, evidence: "owner-dialog" });
  assert.notEqual(kept.state, "removed", "the post-rename claim recheck keeps a re-added site's sign-in");
  assert.equal(fs.readFileSync(path.join(raced.partitionDir, "Cookies"), "utf8"), "session=owner", "its login bytes are untouched");
  // Control: the same binding removes an unclaimed sign-in when nothing races it.
  assert.deepEqual(await remove(nodePartitionPassFs({ fs }))({ partition: path.basename(idle.partitionDir), confirmed: true, evidence: "owner-dialog" }), { state: "removed" });
  assert.equal(fs.existsSync(idle.partitionDir), false);
});

test("a continuing pass that rejects records one failed report and never rejects settled", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.base, { recursive: true, force: true }));
  let fail!: (reason: Error) => void;
  const done = new Promise<never>((_resolve, reject) => { fail = reject; });
  let now = 100;
  const run = await f.run({
    bootWaitMs: 37, mono: () => now,
    partitionPass: async (_required, options) => {
      assert.deepEqual(options, { budgetMs: 37 });
      now += 37;
      return { state: "continuing", done };
    },
  });
  assert.deepEqual([run.wait, run.waitedMs, run.lastReport()], ["continuing", 37, null]);
  assert.deepEqual(f.logs, [{ event: "pass-continuing", detail: "after 37 ms" }]);
  fail(Object.assign(new Error("partition storage disappeared"), { code: "EIO" }));
  const result = await run.settled;
  assert.deepEqual(result, { result: "failed", reason: "EIO", removed: [], cacheCleared: [], restored: [], kept: [], skipped: [] });
  assert.equal(run.lastReport(), result);
  assert.deepEqual(f.logs, [{ event: "pass-continuing", detail: "after 37 ms" }, { event: "pass-failed", detail: "EIO" }]);
});

test("a pass implementation throwing before it returns is reported as finished and failed", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.base, { recursive: true, force: true }));
  const run = await f.run({ mono: () => 100, partitionPass: () => { throw new Error("writer unavailable"); } });
  assert.deepEqual([run.wait, run.waitedMs], ["finished", 0]);
  assert.deepEqual(await run.settled, { result: "failed", reason: "writer unavailable", removed: [], cacheCleared: [], restored: [], kept: [], skipped: [] });
  assert.deepEqual(run.lastReport(), await run.settled);
  assert.deepEqual(f.logs, [{ event: "pass-failed", detail: "writer unavailable" }]);
});
