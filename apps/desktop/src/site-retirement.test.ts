/**
 * @file ST-2b: the erase arm's retirement proof. A record in the sign-in removal list is the ONLY
 * thing that may later let the next-start pass delete a deleted website's whole sign-in partition,
 * so these tests pin when one is written (after the folder is certainly gone) and when one is not
 * (untrack, failed erase, folder still present). Real ledger, real durable JSON, real temp folders.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readRegistry, isLiveServeRow } from "./site-child-registry.ts";
import { handleDelete } from "./project-ipc.delete.ts";
import type { ProjectIpcDeps } from "./project-ipc.types.ts";
import { SITE_ORIGIN, sitesFilePath, trackSite, readTrackedSites } from "./tracked-sites.ts";
import { sitePartition } from "./desktop-auth.ts";
import { desktopJsonFile } from "./durable-json-file.ts";
import { bindDesktopRetirement, bindTrackedAgainRetirement, NO_RETIREMENT, type SiteRetirementPort } from "./site-retirement.ts";

const tempDir = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-retirement-")));

function writeSite(dir: string, siteId: string): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: path.basename(dir) }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, schemaVersion: 58 }));
  return dir;
}

/** A profile with a real Partitions root and a real ledger, plus the delete deps that use it. */
function fixture(overrides: Partial<ProjectIpcDeps> = {}) {
  const root = tempDir();
  const userDataDir = path.join(root, "profile");
  fs.mkdirSync(path.join(userDataDir, "Partitions"), { recursive: true });
  const real = bindDesktopRetirement({ userDataDir, sessionDataDir: userDataDir, eraseVersion: "9.9.9", partitionFor: sitePartition,
    fs, clock: { now: () => Date.parse("2026-11-25T12:00:00.000Z") }, id: randomUUID, durableJsonFor: desktopJsonFile });
  const calls: string[] = [];
  const projectsPath = sitesFilePath({ userDataDir });
  const spy: SiteRetirementPort = {
    capture: (input) => { calls.push("capture"); return real.port.capture(input); },
    absence: (input) => real.port.absence(input),
    append: (input) => {
      calls.push(`append gone=${!fs.existsSync(input.candidate.subjectDir)} tracked=${readTrackedSites({ projectsPath }).length}`);
      real.port.append(input);
    },
    invalidate: (input) => real.port.invalidate(input),
  };
  const deps = {
    projectsPath, registryPath: path.join(root, "site-processes"), repoRoot: "/repo", openSites: new Map(),
    readRegistry, isLiveServeRow, recordSiteClosed: () => {}, deletePreview: () => {},
    serializer: { run: ({ fn }: { key: string; fn: () => unknown }) => fn() },
    removeSiteTree: async ({ root: dir }: { root: string }) => { fs.rmSync(dir, { recursive: true }); },
    trimRetiredSiteCache: async () => {}, warn: ({ message }: { message: string }) => assert.fail(message),
    retirement: spy, ...overrides,
  } as unknown as ProjectIpcDeps;
  const site = (name: string, origin: "created" | "adopted") => {
    const siteDir = writeSite(path.join(root, "sites", name), `${name}-id`);
    trackSite({ beforeAddedRows: () => {}, projectsPath, siteDir }, { origin: SITE_ORIGIN[origin], siteId: `${name}-id` });
    return siteDir;
  };
  const partitionDir = (siteDir: string) => path.join(userDataDir, "Partitions", sitePartition({ siteDir }).replace(/^persist:/, ""));
  return { root, userDataDir, ledger: real.ledger, deps, calls, site, partitionDir, projectsPath };
}

test("T-2b.1 erase writes a record after the folder is gone", async () => {
  const f = fixture();
  const siteDir = f.site("bakery", "created");
  const before = fs.lstatSync(siteDir);
  await handleDelete({ id: siteDir, deps: f.deps });
  assert.deepEqual(f.calls, ["capture", "append gone=true tracked=1"], "captured before the erase, appended after it and before untrack");
  const read = f.ledger.readStrict({});
  assert.equal(read.state, "ok");
  const records = read.state === "ok" ? read.records : [];
  assert.equal(records.length, 1);
  const record = records[0]!;
  assert.equal(record.basis, "erased");
  assert.equal(record.state, "pending");
  assert.equal(record.profile, f.userDataDir);
  assert.equal(record.sessionRoot, path.join(f.userDataDir, "Partitions"));
  assert.equal(record.partition, path.basename(f.partitionDir(siteDir)));
  assert.ok(record.basis === "erased");
  assert.equal(record.subjectId, "bakery-id");
  assert.equal(record.subjectDir, siteDir);
  assert.deepEqual(record.dirIdentity, { dev: before.dev, ino: before.ino, birthtimeMs: before.birthtimeMs });
  assert.equal(record.parentDev, fs.lstatSync(path.dirname(siteDir)).dev);
  assert.equal(record.eraseVersion, "9.9.9");
  assert.deepEqual(readTrackedSites({ projectsPath: f.projectsPath }), []);
});

test("T-2b.2 untrack + re-add keeps the login", async () => {
  // Both untrack arms: an adopted card (no siteId at all), and a CREATED card with a siteId that the
  // delete guard still refuses to erase because it sits under the protected checkout root.
  for (const origin of ["adopted", "created"] as const) {
    const f = fixture();
    const deps = origin === "created" ? ({ ...f.deps, repoRoot: f.root } as ProjectIpcDeps) : f.deps;
    const siteDir = f.site(`kept-${origin}`, origin);
    const cookies = path.join(f.partitionDir(siteDir), "Cookies");
    fs.mkdirSync(path.dirname(cookies), { recursive: true });
    fs.writeFileSync(cookies, Buffer.from([1, 2, 3, 250]));
    await handleDelete({ id: siteDir, deps });
    assert.deepEqual(readTrackedSites({ projectsPath: f.projectsPath }), [], `${origin}: the card is removed`);
    assert.deepEqual(f.calls, [], `${origin}: the untrack arm never captures or records`);
    assert.deepEqual(f.ledger.readStrict({}), { state: "ok", records: [] });
    trackSite({ beforeAddedRows: () => {}, projectsPath: f.projectsPath, siteDir }, { origin: SITE_ORIGIN[origin], siteId: `kept-${origin}-id` });
    assert.equal(fs.existsSync(siteDir), true);
    assert.deepEqual(fs.readFileSync(cookies), Buffer.from([1, 2, 3, 250]), `${origin}: cookie file byte-identical`);
    assert.deepEqual(f.ledger.readStrict({}), { state: "ok", records: [] });
  }
});

test("T-2b.3 failed erase writes no record", async (t) => {
  const failing = fixture({ removeSiteTree: async () => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); } });
  const siteDir = failing.site("busy", "created");
  await assert.rejects(handleDelete({ id: siteDir, deps: failing.deps }), {
    message: "Could not delete this website. The folder could not be removed. Its card has been kept so you can try again.",
  });
  assert.deepEqual(failing.calls, ["capture"]);
  assert.deepEqual(failing.ledger.readStrict({}), { state: "ok", records: [] });
  assert.equal(readTrackedSites({ projectsPath: failing.projectsPath }).length, 1, "the row stays as the recovery handle");

  // An erase that "succeeded" but left the folder behind is not proof either; the result is unchanged.
  const lingering = fixture({ removeSiteTree: async () => {} });
  const stillThere = lingering.site("still-there", "created");
  await handleDelete({ id: stillThere, deps: lingering.deps });
  assert.deepEqual(lingering.ledger.readStrict({}), { state: "ok", records: [] });

  // A ledger that cannot be written only warns: the folder is gone and the delete still succeeds.
  const warn = t.mock.method(console, "warn", () => {});
  const full = fixture();
  const fullDeps = { ...full.deps, retirement: { ...full.deps.retirement, append: () => { throw new Error("ENOSPC: disk full"); } } } as ProjectIpcDeps;
  const gone = full.site("gone", "created");
  await handleDelete({ id: gone, deps: fullDeps });
  assert.equal(fs.existsSync(gone), false);
  assert.deepEqual(readTrackedSites({ projectsPath: full.projectsPath }), []);
  assert.equal(warn.mock.calls[0]?.arguments[0], "tovu desktop: could not record the deleted website's sign-in for later removal; it will be kept and listed instead.");
});

test("capture fails closed to no candidate when the identity cannot be read", () => {
  const f = fixture();
  const siteDir = f.site("no-root", "created");
  fs.rmSync(path.join(f.userDataDir, "Partitions"), { recursive: true });
  const bound = bindDesktopRetirement({ userDataDir: f.userDataDir, sessionDataDir: f.userDataDir, eraseVersion: "1", partitionFor: sitePartition,
    fs, clock: { now: () => 0 }, id: randomUUID, durableJsonFor: desktopJsonFile });
  assert.equal(bound.port.capture({ siteDir, siteId: "x" }), null, "no Partitions root");
  fs.mkdirSync(path.join(f.userDataDir, "Partitions"));
  assert.equal(bound.port.capture({ siteDir: path.join(f.root, "missing"), siteId: "x" }), null, "no folder");
  const inMemory = bindDesktopRetirement({ userDataDir: f.userDataDir, sessionDataDir: f.userDataDir, eraseVersion: "1", partitionFor: () => "tovu-site-abc",
    fs, clock: { now: () => 0 }, id: randomUUID, durableJsonFor: desktopJsonFile });
  assert.equal(inMemory.port.capture({ siteDir, siteId: "x" }), null, "a non-persistent partition has no folder to retire");
  const candidate = bound.port.capture({ siteDir, siteId: "x" });
  assert.ok(candidate);
  assert.equal(bound.port.absence({ candidate }), "present");
  assert.equal(bound.port.absence({ candidate: { ...candidate, parentDev: candidate.parentDev + 1 } }), "unknown", "another volume is not certain absence");
  fs.rmSync(siteDir, { recursive: true });
  assert.equal(bound.port.absence({ candidate }), "absent");
  bound.port.append({ candidate });
  assert.deepEqual(bound.port.invalidate({ partition: candidate.partition, reason: "tracked-again" }), undefined);
  const read = bound.ledger.readStrict({});
  assert.equal(read.state === "ok" && read.records[0]?.state, "invalidated");
});

test("NO_RETIREMENT captures nothing and so records nothing", () => {
  assert.equal(NO_RETIREMENT.capture({ siteDir: "/x", siteId: "y" }), null);
});

test("production binding is not NO_RETIREMENT", () => {
  const source = fs.readFileSync(new URL("./main/index.ts", import.meta.url), "utf8");
  const start = source.indexOf("function buildProjectDeps(");
  const body = source.slice(start, source.indexOf("\n}\n", start));
  assert.match(body, /retirement: desktopRetirement\.port/);
  assert.match(source, /const desktopRetirement = bindDesktopRetirement\(\{/);
  assert.doesNotMatch(source, /NO_RETIREMENT/);
  assert.match(source, /durableJsonFor: desktopJsonFile/);
});

test("the add-site writer invalidates only the re-added folder's pending sign-in retirement", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const readded = f.site("readded", "created");
  const remainsErased = f.site("remains-erased", "created");
  await handleDelete({ id: readded, deps: f.deps });
  await handleDelete({ id: remainsErased, deps: f.deps });
  const states = () => {
    const result = f.ledger.readStrict({});
    assert.ok(result.state === "ok", "expected to read the retirement ledger");
    return new Map(result.records.map(({ partition, state }) => [partition, state]));
  };
  const readdedPartition = path.basename(f.partitionDir(readded));
  const erasedPartition = path.basename(f.partitionDir(remainsErased));
  assert.deepEqual(states(), new Map([[readdedPartition, "pending"], [erasedPartition, "pending"]]));

  writeSite(readded, "new-identity");
  const beforeAddedRows = bindTrackedAgainRetirement({
    userDataDir: f.userDataDir,
    fs,
    clock: { now: () => Date.parse("2026-11-25T13:00:00.000Z") },
    id: () => "unused",
    durableJsonFor: desktopJsonFile,
    partitionFor: sitePartition,
  });
  trackSite({ projectsPath: f.projectsPath, siteDir: readded, beforeAddedRows });
  assert.deepEqual(readTrackedSites({ projectsPath: f.projectsPath }).map(({ siteDir }) => siteDir), [readded]);
  assert.deepEqual(states(), new Map([[readdedPartition, "invalidated"], [erasedPartition, "pending"]]));
});
