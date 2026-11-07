import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { importWorkerLaunch, rebuildImportDatabase, type RebuildImportDatabaseOptions } from "#src/server/runtime/composition/site-portability";

/**
 * @file The parent side of the hostile-SQLite import helper, with the space probe, limits and the
 * forked helper replaced by fakes: refusals before staging, cancellation, helper failures, the
 * rebuilt-output cap, and the result read back from the disposable root (always removed).
 */

const plenty = async () => ({ bavail: 1024 * 1024, bsize: 4096 });

test("the isolated worker's redacted diagnostic reaches server stderr without entering the public refusal", async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./import-database-logging.fixture.ts", import.meta.url))]);
  assert.match(stderr, /Portable schema diagnostic \[REDACTED\]/);
  assert.match(stderr, /\[site-share\] Cannot build portable plugin schema/);
  assert.match(stderr, /SQLITE_ERROR \/private\/site\/content.db token=\[REDACTED/);
  assert.doesNotMatch(stderr + stdout, /sk-proj-a{64}/);
  assert.equal(stdout.trim(), "Import database refused: Cannot build portable plugin schema.");
  assert.doesNotMatch(stdout, /diagnostic/);
});

test("an uncaught import worker error is redacted before reaching server logs", async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./import-database-logging.fixture.ts", import.meta.url)), "crash"]);
  assert.match(stderr, /Archive failure \[REDACTED/);
  assert.doesNotMatch(stderr + stdout, /sk-proj-a{64}/);
  assert.equal(stdout.trim(), "Import database has unsupported schema, invalid references or unsafe data.");
});

test("worker stderr sanitizes complete lines across writes and flushes a bounded final line", async () => {
  const { stderr } = await promisify(execFile)(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./import-database-logging.fixture.ts", import.meta.url)), "warning"]);
  assert.match(stderr, /Warning: \[REDACTED/);
  // Any key prefix counts: a control-joined key clipped at 120 characters must not leak its head.
  assert.doesNotMatch(stderr, /sk-proj-a|[\u202e\u0000]/);
  const final = stderr.trimEnd().split("\n").at(-1)!;
  assert.equal(final, "Archive " + "!".repeat(111) + "…");
});

/** A forked helper stand-in: runs `behave` with the disposable root, then reports `exit`. */
class FakeHelper extends EventEmitter {
  readonly kills: string[] = [];
  // Like a real process, the exit is reported asynchronously after the signal is sent.
  kill(signal: NodeJS.Signals): boolean { this.kills.push(signal); setImmediate(() => this.emit("close", null)); return true; }
}

function forkThat(behave: (input: { root: string; child: FakeHelper }) => void): { fork: NonNullable<RebuildImportDatabaseOptions["fork"]>; roots: string[]; children: FakeHelper[] } {
  const roots: string[] = [];
  const children: FakeHelper[] = [];
  return { roots, children, fork: (_helper, args) => {
    const child = new FakeHelper();
    roots.push(args[0]!);
    children.push(child);
    setImmediate(() => behave({ root: args[0]!, child }));
    return child;
  } };
}

function writeOutputs(root: string, { bytes = Buffer.from("rebuilt") }: { bytes?: Buffer } = {}): void {
  fs.writeFileSync(path.join(root, "output.db"), bytes);
  fs.writeFileSync(path.join(root, "media.json"), JSON.stringify([{ storageKey: "blobs/a" }]));
  fs.writeFileSync(path.join(root, "documents.json"), JSON.stringify([]));
  // The worker transports classifications separately from unrelated scope/restore notices.
  fs.writeFileSync(path.join(root, "notices.json"), "[]");
  fs.writeFileSync(path.join(root, "credential-warnings.json"), JSON.stringify([{ path: "content.db:workspaces.name", kind: "provider key shape" }]));
}

test("the helper launch runs the TypeScript source through tsx and a build's JavaScript directly, both with a heap ceiling", () => {
  const source = importWorkerLaunch({ moduleUrl: "file:///app/src/features/site-backup/import-database.ts" });
  assert.deepEqual(source, { helper: fileURLToPath("file:///app/src/features/site-backup/import-database/repo.sqlite.ts"), execArgv: ["--import", "tsx", "--max-old-space-size=512"] });
  const built = importWorkerLaunch({ moduleUrl: "file:///app/dist/features/site-backup/import-database.js" });
  assert.deepEqual(built, { helper: fileURLToPath("file:///app/dist/features/site-backup/import-database/repo.sqlite.js"), execArgv: ["--max-old-space-size=512"] });
});

test("an oversized snapshot and a staging area without room are refused before any helper starts", async () => {
  const { fork, roots } = forkThat(() => assert.fail("no helper may start"));
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.alloc(11) }, { limits: { maxExpandedBytes: 10 }, statfs: plenty, fork }),
    { code: "LIMIT_EXCEEDED", message: "Import database exceeds 300 MiB." });
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.alloc(10) }, { statfs: async () => ({ bavail: 1, bsize: 4096 }), fork }),
    { code: "INSUFFICIENT_STORAGE" });
  assert.deepEqual(roots, []);
});

test("a successful helper's rebuilt database and manifests are returned and its staging root is removed", async () => {
  const { fork, roots } = forkThat(({ root, child }) => { writeOutputs(root); child.emit("close", 0); });
  const result = await rebuildImportDatabase({ snapshot: Buffer.from("input") }, { statfs: plenty, fork });
  assert.deepEqual(result, { bytes: Buffer.from("rebuilt"), media: [{ storageKey: "blobs/a" }], documents: [], notices: [], credentialWarnings: [{ path: "content.db:workspaces.name", kind: "provider key shape" }] });
  assert.equal(fs.existsSync(roots[0]!), false);
  assert.equal(fs.existsSync(roots[0]! + ".lock"), false);
});

test("a rebuilt database over the cap is refused even when the helper succeeded", async () => {
  const { fork, roots } = forkThat(({ root, child }) => { writeOutputs(root, { bytes: Buffer.alloc(64) }); child.emit("close", 0); });
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.from("input") }, { limits: { maxExpandedBytes: 32 }, statfs: plenty, fork }),
    { code: "LIMIT_EXCEEDED", message: "Rebuilt import database exceeds 300 MiB." });
  assert.equal(fs.existsSync(roots[0]!), false);
  assert.equal(fs.existsSync(roots[0]! + ".lock"), false);
});

test("a helper that exits non-zero is an invalid database; a helper that fails to start surfaces its own error", async () => {
  const exits = forkThat(({ child }) => child.emit("close", 1));
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.from("input") }, { statfs: plenty, fork: exits.fork }), { code: "INVALID_DATABASE" });
  const spawnError = new Error("spawn EACCES");
  const fails = forkThat(({ child }) => { child.emit("error", spawnError); child.emit("close", null); });
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.from("input") }, { statfs: plenty, fork: fails.fork }), (error: unknown) => error === spawnError);
  assert.equal(fs.existsSync(exits.roots[0]!) || fs.existsSync(fails.roots[0]!), false);
});

test("a cancellation that lands while staging kills the helper as soon as it starts", async () => {
  const controller = new AbortController();
  const { fork, children } = forkThat(() => undefined);
  const statfs = async () => { controller.abort(); return plenty(); };
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.from("input") }, { signal: controller.signal, statfs, fork }), { code: "CANCELLED" });
  assert.deepEqual(children[0]!.kills, ["SIGKILL"]);
});


test("database staging creates its private root only after taking ownership", async t => {
  const originalMkdir = fsPromises.mkdir;
  const roots: string[] = [];
  const mock = t.mock.method(fsPromises, "mkdir", async (...args: Parameters<typeof fsPromises.mkdir>) => {
    const root = String(args[0]);
    if (path.basename(root).startsWith("tovu-import-db-")) {
      roots.push(root);
      assert.equal(fs.existsSync(root), false);
      assert.equal(fs.existsSync(root + ".lock"), true);
      assert.deepEqual(args[1], { mode: 0o700 });
    }
    return originalMkdir(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });
  const helper = forkThat(({ root, child }) => { writeOutputs(root); child.emit("close", 0); });
  await rebuildImportDatabase({ snapshot: Buffer.from("input") }, { statfs: plenty, fork: helper.fork });
  assert.equal(roots.length, 1);
});
