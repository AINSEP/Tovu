import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { importWorkerLaunch, rebuildImportDatabase, type RebuildImportDatabaseOptions } from "#src/server/runtime/composition/site-portability";

/**
 * @file The parent side of the hostile-SQLite import helper, with the space probe, limits and the
 * forked helper replaced by fakes: refusals before staging, cancellation, helper failures, the
 * rebuilt-output cap, and the result read back from the disposable root (always removed).
 */

const plenty = async () => ({ bavail: 1024 * 1024, bsize: 4096 });

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
  assert.deepEqual(result, { bytes: Buffer.from("rebuilt"), media: [{ storageKey: "blobs/a" }], documents: [] });
  assert.equal(fs.existsSync(roots[0]!), false);
});

test("a rebuilt database over the cap is refused even when the helper succeeded", async () => {
  const { fork, roots } = forkThat(({ root, child }) => { writeOutputs(root, { bytes: Buffer.alloc(64) }); child.emit("close", 0); });
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.from("input") }, { limits: { maxExpandedBytes: 32 }, statfs: plenty, fork }),
    { code: "LIMIT_EXCEEDED", message: "Rebuilt import database exceeds 300 MiB." });
  assert.equal(fs.existsSync(roots[0]!), false);
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
