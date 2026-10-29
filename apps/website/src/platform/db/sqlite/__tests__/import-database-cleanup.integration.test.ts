/** Review B-1 RED: projection temp dirs escaped the disposable root and survived SIGKILL. */
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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
