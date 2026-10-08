import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file D1-D2 (R5, t91 2026-09-16) — proves the durability ORDER `writeActivationsAtomically`
 * promises: the temp file is fsync'd before the rename lands, and the workspace directory is
 * best-effort fsync'd after. Wraps `node:fs/promises` to log `open().sync()` and `rename()` calls by
 * basename, in call order, while leaving every actual filesystem effect real — a log-only wrapper,
 * not a stub, so `setAgentPluginActivation` still genuinely succeeds and can be asserted on
 * afterwards too.
 *
 * Supplied once through the lifecycle filesystem port, preserving the native effects. The former
 * module mock needed registration before import because resolved bindings cannot be rebound.
 */

const realFsp = await import("node:fs/promises");
const log: string[] = [];
let failDirectorySyncFor: string | undefined;

const wrappedOpen = (async (...args: Parameters<typeof realFsp.open>) => {
  const handle = await realFsp.open(...args);
  const realSync = handle.sync.bind(handle);
  const target = String(args[0]);
  handle.sync = (async () => {
    log.push(`sync:${path.basename(target)}`);
    if (target === failDirectorySyncFor) throw Object.assign(new Error("directory fsync unsupported"), { code: "EINVAL" });
    return realSync();
  }) as typeof handle.sync;
  return handle;
}) as typeof realFsp.open;

const wrappedRename = (async (from: Parameters<typeof realFsp.rename>[0], to: Parameters<typeof realFsp.rename>[1]) => {
  log.push(`rename:${path.basename(String(to))}`);
  return realFsp.rename(from, to);
}) as typeof realFsp.rename;

const { createTovuAgentPluginLifecycle } = await import("../../lifecycle.js");
// The same log-only native wrappers are supplied through the owner's filesystem port.
const { setAgentPluginActivation, resolveAgentPluginActivation } = createTovuAgentPluginLifecycle({}, {
  filesystem: { ...realFsp, open: wrappedOpen, rename: wrappedRename },
});

async function freshRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "tovu-activation-durable-"));
}

test("D1: the temp file is fsync'd before the rename that publishes it", async () => {
  const root = await freshRoot();
  try {
    log.length = 0;
    await setAgentPluginActivation({ workspaceRoot: root, pluginId: "plugin-a", enabled: false, actor: "op" });

    const syncIndex = log.findIndex((entry) => entry.startsWith("sync:activations.json.tmp-"));
    const renameIndex = log.indexOf("rename:activations.json");
    assert.ok(syncIndex >= 0, `expected a temp-file sync: entry in ${JSON.stringify(log)}`);
    assert.ok(renameIndex >= 0, `expected rename:activations.json in ${JSON.stringify(log)}`);
    assert.ok(syncIndex < renameIndex, `temp file must be fsync'd BEFORE the rename: ${JSON.stringify(log)}`);
  } finally {
    await forceRemove(root);
  }
});

test(
  "D2: the workspace directory is best-effort fsync'd AFTER the rename",
  { skip: process.platform === "win32" ? "directory fsync is skipped entirely on win32" : false },
  async () => {
    const root = await freshRoot();
    try {
      log.length = 0;
      await setAgentPluginActivation({ workspaceRoot: root, pluginId: "plugin-a", enabled: false, actor: "op" });

      const renameIndex = log.indexOf("rename:activations.json");
      const dirSyncIndex = log.indexOf(`sync:${path.basename(root)}`);
      assert.ok(renameIndex >= 0, `expected rename:activations.json in ${JSON.stringify(log)}`);
      assert.ok(dirSyncIndex >= 0, `expected a directory sync: entry in ${JSON.stringify(log)}`);
      assert.ok(dirSyncIndex > renameIndex, `directory fsync must come AFTER the rename: ${JSON.stringify(log)}`);
    } finally {
      await forceRemove(root);
    }
  },
);

// F6.2/F6.4: fail the directory fsync after the real rename, then read the served activation.
test('D2: unsupported directory fsync does not reject a persisted activation', { skip: process.platform === 'win32' }, async () => {
  const root = await freshRoot();
  try {
    log.length = 0;
    failDirectorySyncFor = root;
    await setAgentPluginActivation({ workspaceRoot: root, pluginId: 'plugin-fsync', enabled: false, actor: 'op' });
    const renameIndex = log.indexOf('rename:activations.json');
    const directorySyncIndex = log.indexOf(`sync:${path.basename(root)}`);
    assert.ok(renameIndex >= 0 && directorySyncIndex > renameIndex, 'a real rename precedes the attempted directory fsync');
    assert.equal((await resolveAgentPluginActivation({ workspaceRoot: root, pluginId: 'plugin-fsync' })).verdict, 'inactive');
    const saved = JSON.parse(await realFsp.readFile(path.join(root, 'activations.json'), 'utf8'));
    assert.equal(saved.plugins['plugin-fsync'].enabled, false);
  } finally {
    failDirectorySyncFor = undefined;
    await forceRemove(root);
  }
});
