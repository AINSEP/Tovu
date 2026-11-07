import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tidyImportDatabases } from "#src/features/site-backup/import-database";
/** Review B-1 RED: projection temp dirs escaped the disposable root and survived SIGKILL. */
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { importFixture } from "#src/features/site-backup/__tests__/import.fixture";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rebuildImportDatabase } from "#src/server/runtime/composition/site-portability";

for (const interruption of ["cancellation", "timeout"] as const) test(`B worker ${interruption} removes every nested artifact`, { timeout: 30_000 }, async t => {
  const fork = childProcess.fork;
  const controller = new AbortController();
  let root = "", projection = "";
  let ready!: (message: { projection: string; env: Record<string, string> }) => void;
  const started = new Promise<{ projection: string; env: Record<string, string> }>(resolve => { ready = resolve; });
  t.mock.method(childProcess, "fork", (_helper: string | URL, args: readonly string[] = [], options?: childProcess.ForkOptions) => {
    assert.ok(args[0], "the worker receives its disposable root");
    root = args[0];
    const child = fork(fileURLToPath(new URL("./import-database-hanging.fixture.ts", import.meta.url)), args, options);
    t.after(() => { child.kill("SIGKILL"); if (projection) fs.rmSync(projection, { recursive: true, force: true }); });
    child.once("message", ready);
    return child;
  });
  if (interruption === "timeout") t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = rebuildImportDatabase({ snapshot: Buffer.from("fixture") }, { signal: controller.signal });
  const rejected = assert.rejects(pending, (error: unknown) => (error as { code: string }).code === (interruption === "timeout" ? "DATABASE_TIMEOUT" : "CANCELLED"));
  const message = await started;
  projection = message.projection;
  assert.equal(fs.existsSync(path.join(projection, "nested/private.db")), true);
  if (interruption === "timeout") t.mock.timers.tick(90_000);
  else controller.abort();
  await rejected;
  assert.equal(fs.existsSync(root), false);
  assert.equal(fs.existsSync(projection), false, "sanitizer snapshot must not survive worker termination");
  assert.equal(path.dirname(projection), root);
  assert.deepEqual(message.env, { TMPDIR: root, TMP: root, TEMP: root });
});


test("startup removes a killed parent's database folders and keeps another active import's folder", { timeout: 30000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-db-startup-test-"));
  const original = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };
  for (const name of Object.keys(original)) process.env[name] = temp;
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const parents: childProcess.ChildProcess[] = [];
  const closed = new Map<childProcess.ChildProcess, Promise<void>>();
  async function parent() {
    const child = childProcess.fork(fileURLToPath(new URL("./import-database-parent.fixture.ts", import.meta.url)), [], {
      execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    parents.push(child);
    closed.set(child, new Promise(resolve => { child.once("close", () => resolve()); }));
    const root = await new Promise<string>((resolve, reject) => {
      child.once("error", reject);
      child.once("message", message => resolve((message as { root: string }).root));
      child.once("exit", () => reject(new Error("Import parent exited before staging its database.")));
    });
    return { child, root };
  }
  try {
    const active = await parent();
    // A live owner remains protected even when its lock timestamp is old.
    fs.utimesSync(active.root + ".lock", new Date(0), new Date(0));
    const interrupted = await parent();
    interrupted.child.kill("SIGKILL");
    await closed.get(interrupted.child);
    assert.equal(fs.existsSync(interrupted.root), true);
    const orphanLock = path.join(temp, "tovu-import-db-orphan.lock");
    fs.copyFileSync(interrupted.root + ".lock", orphanLock);
    const legacy = fs.mkdtempSync(path.join(temp, "tovu-import-db-"));
    fs.writeFileSync(path.join(legacy, "input.db"), "legacy staged database");
    const unrelated = fs.mkdtempSync(path.join(temp, "other-import-"));
    const plainFile = path.join(temp, "tovu-import-db-file");
    fs.writeFileSync(plainFile, "unrelated file");
    const h = await importFixture(t);
    await h.backend.tidy({});
    assert.equal(fs.existsSync(interrupted.root), false);
    assert.equal(fs.existsSync(legacy), false);
    assert.equal(fs.existsSync(orphanLock), false);
    assert.equal(fs.existsSync(active.root), true);
    assert.equal(fs.readFileSync(path.join(active.root, "input.db"), "utf8"), "staged database");
    assert.equal(fs.existsSync(unrelated), true);
    assert.equal(fs.readFileSync(plainFile, "utf8"), "unrelated file");
    await h.backend.tidy({});
    assert.equal(fs.existsSync(active.root), true);
    active.child.kill("SIGKILL");
    await closed.get(active.child);
    await h.backend.tidy({});
    assert.equal(fs.existsSync(active.root), false);
  } finally {
    for (const child of parents) child.kill("SIGKILL");
    await Promise.all(closed.values());
  }
});


for (const code of ["EBUSY", "EPERM", "EACCES"]) test(`cleanup continues after a temporary folder reports ${code}`, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cleanup-errors-"));
  const originalEnv = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };
  for (const name of Object.keys(originalEnv)) process.env[name] = temp;
  const blocked = path.join(temp, "tovu-import-db-a-busy");
  const later = path.join(temp, "tovu-import-db-z-ready");
  fs.mkdirSync(blocked); fs.mkdirSync(later);
  const originalRm = fsPromises.rm;
  const mock = t.mock.method(fsPromises, "rm", async (...args: Parameters<typeof fsPromises.rm>) => {
    if (String(args[0]) === blocked) throw Object.assign(new Error("Temporary folder is unavailable."), { code });
    return originalRm(...args);
  });
  syncBuiltinESMExports();
  t.after(() => {
    mock.mock.restore(); syncBuiltinESMExports();
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await tidyImportDatabases({});
  assert.equal(fs.existsSync(blocked), true);
  assert.equal(fs.existsSync(later), false);
});
