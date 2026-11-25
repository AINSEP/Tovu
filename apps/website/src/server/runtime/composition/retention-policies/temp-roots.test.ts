import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { sweepOwnedTempRoots, withOwnedTempRoot, type OwnedTempRootLock } from "@jini-ai/platform/fs";
import { captureSqliteBackupBytes } from "@jini-ai/db/transfer";
import { bindOwnedTempRootScope, siteTempRootLock, SITE_TEMP_PREFIXES, type SiteTempPrefix } from "#src/platform/temp/site-temp-roots";
import { rebuildImportDatabase } from "#src/features/site-backup/import-database";
import { rewriteArchiveMedia, sanitizeShareDatabase } from "#src/features/site-backup/share-database/repo.sqlite";
import { captureStaticSite } from "#src/features/site-backup/static-copy";
import { captureDatabaseSnapshot } from "#src/features/site-backup/sources";
import type { DbOpsPort } from "@tovu/contracts/db-ops";
import { createSiteTempRootPolicy } from "./temp-roots.js";

const source = (file: string) => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const OLD = new Date(0);
const noSpace = async () => ({ bavail: 0, bsize: 1 });
/** A lock that always acquires: stands in for a proven-dead owner without a real process. */
const acquiring: OwnedTempRootLock = ({ run }) => run();

function tempParent(t: test.TestContext): string {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "temp-roots-test-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return parent;
}

function policy(required: { parent: string; prefixes?: readonly string[]; fileLock?: OwnedTempRootLock }) {
  const prefixes = required.prefixes ?? Object.values(SITE_TEMP_PREFIXES);
  return createSiteTempRootPolicy({ roots: prefixes.map(prefix => ({ parent: required.parent, prefix })), sweepOwnedTempRoots, fs: fsPromises,
    fileLock: required.fileLock ?? siteTempRootLock, signal: new AbortController().signal });
}

/** An old owned root (folder + provenance marker) as a crashed writer leaves it. */
function leftover(parent: string, name: string, { marker = true } = {}): string {
  const root = path.join(parent, name);
  fs.mkdirSync(root);
  if (marker) { fs.writeFileSync(root + ".owner", "{}"); fs.utimesSync(root + ".owner", OLD, OLD); }
  fs.utimesSync(root, OLD, OLD);
  return root;
}

/** A writer scope that records the protocol's lock and folder creation, in order. */
function recordingScope(parent: string, prefix: SiteTempPrefix) {
  const events: string[] = [];
  const recordingFs = { ...fsPromises, mkdir: (async (target: string, options?: fs.MakeDirectoryOptions) => { events.push(`mkdir ${target}`); return fsPromises.mkdir(target, options); }) as typeof fsPromises.mkdir };
  const lock: OwnedTempRootLock = (required, options) => { events.push(`lock ${required.lockPath}`); return siteTempRootLock(required, options); };
  return { events, scope: bindOwnedTempRootScope({ parent, prefix, withOwnedTempRoot, fs: recordingFs, lock, id: randomUUID }) };
}

function assertLockFirst(events: readonly string[], parent: string, prefix: string): void {
  assert.equal(events.length, 2, `one lock and one folder: ${events.join(", ")}`);
  const root = events[1]!.slice("mkdir ".length);
  assert.equal(path.dirname(root), parent);
  assert.match(path.basename(root), new RegExp(`^${prefix}[0-9a-f-]{36}$`));
  assert.deepEqual(events, [`lock ${root}.lock`, `mkdir ${root}`]);
  assert.deepEqual(fs.readdirSync(parent), [], "the writer leaves no root, lock or marker behind");
}

const snapshotDbOps = { getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }), captureRestorePoint: async () => { throw new Error("capture refused"); } } as unknown as DbOpsPort;
const writers: Array<{ name: string; prefix: SiteTempPrefix; run: (scope: ReturnType<typeof recordingScope>["scope"]) => Promise<unknown> }> = [
  { name: "import database", prefix: SITE_TEMP_PREFIXES.importDatabase, run: tempRoot => rebuildImportDatabase({ snapshot: Buffer.from("x"), moduleUrl: import.meta.url }, { tempRoot, statfs: noSpace }).catch(() => undefined) },
  { name: "share projection", prefix: SITE_TEMP_PREFIXES.shareProjection, run: tempRoot => sanitizeShareDatabase({ snapshot: Buffer.from("x"), modules: [] }, { tempRoot, statfs: noSpace }).catch(() => undefined) },
  { name: "archive media", prefix: SITE_TEMP_PREFIXES.archiveMedia, run: tempRoot => rewriteArchiveMedia({ bytes: Buffer.from("not a database"), copies: [] }, { tempRoot }).catch(() => undefined) },
  { name: "static copy", prefix: SITE_TEMP_PREFIXES.staticCopy, run: tempRoot => captureStaticSite({ render: async () => { throw new Error("no render"); }, context: async () => { throw new Error("no context"); }, now: () => new Date() }, { tempRoot }) },
  { name: "database snapshot", prefix: SITE_TEMP_PREFIXES.snapshot, run: tempRoot => captureDatabaseSnapshot({ dbOps: snapshotDbOps, scopeId: "site-share" }, { tempRoot }) },
  { name: "chat transfer", prefix: SITE_TEMP_PREFIXES.transferChat, run: withTempRoot => captureSqliteBackupBytes({ source: { backupTo: dest => fsPromises.writeFile(dest, "chat") }, tempDirPrefix: SITE_TEMP_PREFIXES.transferChat }, { withTempRoot }) },
];
for (const writer of writers) test(`writer creates the lock before the folder (${writer.name})`, async t => {
  const parent = tempParent(t);
  const { events, scope } = recordingScope(parent, writer.prefix);
  await writer.run(scope);
  assertLockFirst(events, parent, writer.prefix);
});

test("writer creates the lock before the folder (composition binds every writer to its owned root)", () => {
  // Both chat transfer entry points hand the Jini backup the owned-root scope instead of its own mkdtemp.
  assert.match(source("../database-transfer-adapters.ts"), /withTempRoot: siteTempRoot\(\{ prefix: SITE_TEMP_PREFIXES\.transferChat \}\)/);
  assert.match(source("../site-deps/route-deps-assistant-mcp.ts"), /withTempRoot: siteTempRoot\(\{ prefix: SITE_TEMP_PREFIXES\.transferChat \}\)/);
  // The export snapshot parent is the same resolved parent the sweeper reads.
  assert.match(source("../site-deps/site-sharing.ts"), /snapshotRoot: SITE_TEMP_PARENT/);
  for (const file of ["features/site-backup/import-database.ts", "features/site-backup/share-database/repo.sqlite.ts", "features/site-backup/static-copy.ts", "features/site-backup/sources.ts"]) {
    assert.doesNotMatch(source(`../../../../${file}`), /mkdtemp\(|tmpdir\(\)/, `${file} allocates only owned roots`);
  }
});

test("only named prefixes in the named root are touched", async t => {
  const parent = tempParent(t), elsewhere = tempParent(t);
  const dead = leftover(parent, SITE_TEMP_PREFIXES.importDatabase + randomUUID());
  const foreign = leftover(parent, "tovu-other-" + randomUUID());
  const notExact = leftover(parent, SITE_TEMP_PREFIXES.importDatabase + "AbC123");
  const outside = leftover(elsewhere, SITE_TEMP_PREFIXES.importDatabase + randomUUID());
  const subject = policy({ parent, fileLock: acquiring });
  assert.deepEqual(await subject.measure(), { bytes: null, items: 1 });
  assert.deepEqual(await subject.sweep({ now: Date.now() }), { freedBytes: null, removed: 1 });
  assert.equal(fs.existsSync(dead) || fs.existsSync(dead + ".owner"), false);
  for (const kept of [foreign, notExact, outside]) assert.equal(fs.existsSync(kept), true, kept);
});

test("pre-protocol leftover is report-only", async t => {
  const parent = tempParent(t);
  const legacy = leftover(parent, SITE_TEMP_PREFIXES.staticCopy + randomUUID(), { marker: false });
  const mkdtempStyle = leftover(parent, SITE_TEMP_PREFIXES.importDatabase + "x1Y2z3", { marker: false });
  assert.deepEqual(await policy({ parent, fileLock: acquiring }).sweep({ now: Date.now() }), { freedBytes: null, removed: 0 });
  assert.equal(fs.existsSync(legacy), true);
  assert.equal(fs.existsSync(mkdtempStyle), true);
});

test("root kept while the worker runs", async t => {
  const parent = tempParent(t);
  let release!: () => void;
  const started = new Promise<string>(resolve => {
    void rebuildImportDatabase({ snapshot: Buffer.from("staged"), moduleUrl: import.meta.url }, {
      tempRoot: bindOwnedTempRootScope({ parent, prefix: SITE_TEMP_PREFIXES.importDatabase, withOwnedTempRoot, fs: fsPromises, lock: siteTempRootLock, id: randomUUID }),
      statfs: async () => ({ bavail: 1 << 20, bsize: 4096 }),
      fork: (_helper, args) => {
        const child = Object.assign(new EventEmitter(), { kill: () => true });
        release = () => child.emit("close", 1);
        resolve(args[0]!);
        return child;
      },
    }).catch(() => undefined);
  });
  const root = await started;
  for (const file of [root, root + ".owner", root + ".lock"]) fs.utimesSync(file, OLD, OLD);
  assert.deepEqual(await policy({ parent }).sweep({ now: Date.now() }), { freedBytes: null, removed: 0 });
  assert.equal(fs.readFileSync(path.join(root, "input.db"), "utf8"), "staged");
  release();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(fs.existsSync(root), false);
});

test("a root with a live marker from another process is kept", { timeout: 30_000 }, async t => {
  const parent = tempParent(t);
  const fixture = fileURLToPath(new URL("../../../../platform/db/sqlite/__tests__/import-database-parent.fixture.ts", import.meta.url));
  const stage = async () => {
    const child = childProcess.fork(fixture, [], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"], env: { ...process.env, TMPDIR: parent, TMP: parent, TEMP: parent } });
    const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
    t.after(async () => { child.kill("SIGKILL"); await closed; });
    const root = await new Promise<string>((resolve, reject) => {
      child.once("message", message => resolve((message as { root: string }).root));
      child.once("exit", () => reject(new Error("The import parent exited before staging its database.")));
    });
    for (const file of [root, root + ".owner", root + ".lock"]) fs.utimesSync(file, OLD, OLD);
    return { root, kill: async () => { child.kill("SIGKILL"); await closed; } };
  };
  const live = await stage(), killed = await stage();
  await killed.kill();
  assert.deepEqual(await policy({ parent }).sweep({ now: Date.now() }), { freedBytes: null, removed: 1 });
  assert.equal(fs.existsSync(killed.root), false);
  assert.equal(fs.readFileSync(path.join(live.root, "input.db"), "utf8"), "staged database");
  await live.kill();
  assert.deepEqual(await policy({ parent }).sweep({ now: Date.now() }), { freedBytes: null, removed: 1 });
  assert.equal(fs.existsSync(live.root), false);
});

test("the temp-root tidy is registered with the serving policies and the old startup tidier is gone", () => {
  assert.match(source("../retention.ts"), /createSiteTempRootPolicy\(\{ roots: SITE_TEMP_ROOTS/);
  assert.doesNotMatch(source("../../../../cli/commands/serve.ts"), /tidyImportDatabases/);
  assert.doesNotMatch(source("../../../../features/site-backup/import-backend.ts"), /tidyImportDatabases/);
  assert.match(source("../../../../features/site-backup/import-backend.ts"), /registry\.expire\(\{\}\)/);
});
