/** ST-2a.T — the desktop binding of the profile partition interlock: every managed session is
 * reached through the held set, a guest cannot attach to a partition a cleanup could be touching,
 * damaged claim sources answer "unknown" (skip), never "nothing claimed", and every added tracked
 * row invalidates a pending retirement first. Real temp dirs and the real platform file lock. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { withFileLock } from "@jini-ai/platform/fs";
import { PartitionBusyError, PartitionOpenRefusedError } from "@jini-ai/desktop-host/electron/partitions";
import { sitePartition } from "./desktop-auth.ts";
import { bindDesktopPartitions, partitionOpenFailure, nodePartitionFs, NO_RETIREMENT, type DesktopRetirementPort } from "./desktop-partition-lock.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : sourceFiles(full);
    return /\.(m?ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test("T-2a.3 no bare session.fromPartition in D/ outside desktop-partition-lock.ts", () => {
  const offenders = [...sourceFiles(path.join(DESKTOP_ROOT, "src")), ...sourceFiles(path.join(DESKTOP_ROOT, "bin"))]
    .filter((file) => path.basename(file) !== "desktop-partition-lock.ts")
    .filter((file) => /\bfromPartition\s*\(/.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(DESKTOP_ROOT, file));
  assert.deepEqual(offenders, []);
});

interface Fixture {
  root: string; userData: string; projectsPath: string; logs: string[]; invalidated: string[];
  binding: ReturnType<typeof bindDesktopPartitions<{ name: string }>>;
}

function fixture({ catalog, retirement, sessionData }: {
  catalog?: { listSiteDirs(): readonly string[] } | undefined; retirement?: DesktopRetirementPort; sessionData?: string;
} = {}): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "st2a-"));
  const userData = path.join(root, "profile");
  fs.mkdirSync(userData);
  const projectsPath = path.join(userData, "projects.json");
  const logs: string[] = [], invalidated: string[] = [];
  let tokens = 0;
  const binding = bindDesktopPartitions<{ name: string }>({
    app: { getPath: (name) => name === "sessionData" && sessionData ? sessionData : userData },
    session: { fromPartition: (partition) => ({ name: partition }) },
    fs: nodePartitionFs({ fs }), fileLock: { withFileLock },
    clock: { mono: () => performance.now(), now: () => Date.now() },
    scheduler: { sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)), every: () => ({ cancel: () => {} }) },
    process: { pid: process.pid, bootId: "boot", hostname: os.hostname(), isAlive: ({ pid }) => pid === process.pid, newToken: () => `a${(tokens += 1).toString(16)}` },
    projectsPath, catalog, instances: [],
    retirement: retirement ?? { invalidate: async ({ partition }) => { invalidated.push(partition); }, invalidateSync: ({ partition }) => { invalidated.push(`sync:${partition}`); } },
    openMaintenance: async () => {},
    log: ({ event, partition }) => logs.push(`${event}:${partition ?? ""}`),
  });
  assert.deepEqual(binding.registerHolder(), { state: "registered" });
  return { root, userData, projectsPath, logs, invalidated, binding };
}

const writeProjects = (f: Fixture, siteDirs: string[]) =>
  fs.writeFileSync(f.projectsPath, JSON.stringify({ projects: siteDirs.map((siteDir) => ({ siteDir, createdAt: "2026-11-01T00:00:00.000Z" })), dismissed: [] }));
const claims = (f: Fixture) => f.binding.withPartitionWriter({ run: (context) => context.readClaims() });

test("T-2a.4 guest attaching during cleanup is refused until acquired", async () => {
  const f = fixture();
  writeProjects(f, []);
  const siteDir = path.join(f.root, "site-a");
  const partition = sitePartition({ siteDir });
  let release!: () => void;
  const writerEntered = new Promise<void>((entered) => {
    void f.binding.withPartitionWriter({ run: () => { entered(); return new Promise<void>((done) => { release = done; }); } });
  });
  await writerEntered;
  assert.equal(f.binding.admitGuestPartition({ partition }), false, "an unheld managed guest is refused while a cleanup runs");
  assert.throws(() => f.binding.siteSession({ partition }), /used before it was acquired/);
  assert.throws(() => f.binding.assertPartitionHeld({ partition }), /used before it was acquired/);
  let acquired = false;
  const acquiring = f.binding.acquireSite({ siteDir }).then((result) => { acquired = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(acquired, false, "the open waits while the writer fences every partition");
  assert.equal(f.binding.admitGuestPartition({ partition }), false, "still refused while the acquisition waits");
  release();
  assert.equal((await acquiring).state, "held");
  assert.equal(f.binding.admitGuestPartition({ partition }), true);
  assert.deepEqual(f.binding.siteSession({ partition }), { name: partition });
  assert.deepEqual(f.invalidated, [partition.replace(/^persist:/, "")], "the reacquired path invalidates its pending retirement first");
  assert.ok(f.logs.includes(`guest-refused:${partition}`));
  // Navigation policy is unchanged for anything this interlock does not manage.
  assert.equal(f.binding.admitGuestPartition({ partition: undefined }), true);
  assert.equal(f.binding.admitGuestPartition({ partition: "persist:something-else" }), true);
  f.binding.assertPartitionHeld({ partition: undefined });
});

test("T-2a.8 damaged tracked list = skip", async () => {
  const f = fixture({ catalog: { listSiteDirs: () => [] } });
  const missing = await claims(f);
  assert.ok(missing.state === "ran" && missing.value.state === "unknown" && /tracked/.test(missing.value.reasons.join()), "a missing projects list is unknown, not empty");
  fs.writeFileSync(f.projectsPath, "{\"projects\": [ {\"siteDir\": ");
  const damaged = await claims(f);
  assert.ok(damaged.state === "ran" && damaged.value.state === "unknown", "a damaged projects list is unknown, not empty");
  fs.writeFileSync(f.projectsPath, "null");
  const wrongShape = await claims(f);
  assert.ok(wrongShape.state === "ran" && wrongShape.value.state === "unknown");
  const siteDir = path.join(f.root, "site-b");
  writeProjects(f, [siteDir]);
  const ok = await claims(f);
  assert.ok(ok.state === "ran" && ok.value.state === "ok");
  assert.deepEqual(ok.value.claimed, [sitePartition({ siteDir }).replace(/^persist:/, "")]);
});

test("a catalog that cannot be read is unknown; attach mode has no catalog and claims nothing from it", async () => {
  const broken = fixture({ catalog: { listSiteDirs: () => { throw new Error("catalog torn"); } } });
  writeProjects(broken, []);
  const unknown = await claims(broken);
  assert.ok(unknown.state === "ran" && unknown.value.state === "unknown" && /catalog/.test(unknown.value.reasons.join()));
  const catalogDir = path.join(broken.root, "cat");
  const listed = fixture({ catalog: { listSiteDirs: () => [catalogDir] } });
  writeProjects(listed, []);
  const ok = await claims(listed);
  assert.ok(ok.state === "ran" && ok.value.state === "ok");
  assert.deepEqual(ok.value.claimed, [sitePartition({ siteDir: catalogDir }).replace(/^persist:/, "")]);
  const attach = fixture({ catalog: undefined });
  writeProjects(attach, []);
  const none = await claims(attach);
  assert.ok(none.state === "ran" && none.value.state === "ok" && none.value.claimed.length === 0);
});

test("T-2a.14 add-site CLI invalidates the retirement for that path", () => {
  const f = fixture();
  const siteDir = path.join(f.root, "site-c");
  f.binding.beforeAddedRows({ rows: [{ siteDir }] });
  assert.deepEqual(f.invalidated, [`sync:${sitePartition({ siteDir }).replace(/^persist:/, "")}`]);
  const none = fixture({ retirement: NO_RETIREMENT });
  none.binding.beforeAddedRows({ rows: [{ siteDir }] });
  assert.deepEqual(none.invalidated, []);
});

test("a sessionData root outside this profile blocks automatic maintenance", () => {
  assert.equal(fixture().binding.automaticMaintenance, true);
  const shared = fixture({ sessionData: path.join(os.tmpdir(), "shared-session-root") });
  assert.equal(shared.binding.automaticMaintenance, false);
  assert.ok(shared.logs.includes("maintenance-blocked:"));
});

test("a refused window acquire says busy, refused or unknown in plain words", () => {
  const busy = partitionOpenFailure({ error: new PartitionBusyError("Tovu is tidying website data. Try opening this website again in a moment.") });
  assert.equal(busy.kind, "busy");
  assert.match(busy.message, /tidying website data/);
  const refused = partitionOpenFailure({ error: new PartitionOpenRefusedError("Tovu could not confirm this website's sign-in data is safe to open. Try opening it again in a moment.") });
  assert.equal(refused.kind, "refused");
  assert.match(refused.message, /could not confirm/);
  const unknown = partitionOpenFailure({ error: new TypeError("x is not a function") });
  assert.equal(unknown.kind, "unknown");
  assert.doesNotMatch(unknown.message, /not a function/, "an internal error is not shown to the owner");
  assert.match(unknown.message, /Tovu could not open this website/);
  assert.ok(unknown.cause instanceof TypeError, "the original stays attached for the log");
});

test("an unregistered instance's window acquire is refused and touches no session", async () => {
  const f = fixture();
  f.binding.unregisterHolder();
  const siteDir = path.join(f.root, "site-b");
  await assert.rejects(f.binding.acquireSiteWindow({ siteDir }), (error: Error & { kind?: string }) => error.kind === "refused" && /settings folder/.test(error.message));
  assert.throws(() => f.binding.siteSession({ partition: sitePartition({ siteDir }) }), /used before it was acquired/, "no fallback session was handed out");
  assert.equal(f.binding.admitGuestPartition({ partition: sitePartition({ siteDir }) }), false);
});
