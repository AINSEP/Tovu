import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file D1-D2 (R5, t91 2026-09-16) — proves the durability ORDER `writeActivationsAtomically`
 * promises: the temp file is fsync'd before the rename lands, and the workspace directory is
 * best-effort fsync'd after. Mocks `node:fs/promises` to log `open().sync()` and `rename()` calls by
 * basename, in call order, while leaving every actual filesystem effect real — a log-only wrapper,
 * not a stub, so `setAgentPluginActivation` still genuinely succeeds and can be asserted on
 * afterwards too.
 *
 * Registered ONCE at module top level, before `activation.js` is imported (also once) — same
 * `mock.module()`-cannot-retroactively-rebind caveat as this directory's other mocked test files.
 */

const realFsp = await import("node:fs/promises");
const log: string[] = [];

const wrappedOpen = (async (...args: Parameters<typeof realFsp.open>) => {
  const handle = await realFsp.open(...args);
  const realSync = handle.sync.bind(handle);
  const target = String(args[0]);
  handle.sync = (async () => {
    log.push(`sync:${path.basename(target)}`);
    return realSync();
  }) as typeof handle.sync;
  return handle;
}) as typeof realFsp.open;

const wrappedRename = (async (from: Parameters<typeof realFsp.rename>[0], to: Parameters<typeof realFsp.rename>[1]) => {
  log.push(`rename:${path.basename(String(to))}`);
  return realFsp.rename(from, to);
}) as typeof realFsp.rename;

mock.module("node:fs/promises", { namedExports: { ...realFsp, open: wrappedOpen, rename: wrappedRename } });

const { setAgentPluginActivation } = await import("../../activation.js");

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
