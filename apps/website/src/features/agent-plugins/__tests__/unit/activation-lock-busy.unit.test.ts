import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file B1-B7 — the busy-error mapping every writer performs when `withFileLock` throws:
 * `FileLockTimeoutError`/`FileLockLostError` become `AgentPluginActivationsBusyError`, and every
 * OTHER error (chiefly `AgentPluginActivationsUnreadableError`) passes through unchanged. Formerly mocked
 * `@jini-ai/platform/fs/file-lock` rather than forcing real contention, so each failure mode is exact and
 * instant — `activation-cross-process-writes.integration.test.ts` is the file that proves the REAL
 * lock closes the race this file merely assumes it does.
 *
 * The former mock was registered ONCE, at module top level, before the host activation binding/`seed-bundled.js` are
 * imported (also once) — `mock.module()` cannot retroactively change a binding a module already
 * resolved at its first load (this repo's own established caveat; see
 * `members/__tests__/disable.unit.test.ts`'s header). Each test only reassigns the shared mutable
 * `behavior`; run standalone, like every other file in this directory. That historical module
 * replacement is now a DI filesystem port: timeout injection preserves the mapping probe and
 * lost-lock injection removes the real lock before assertHeld(), preserving the no-write proof.
 */

const real = await import("@jini-ai/platform/fs/file-lock");

const realFsp = await import("node:fs/promises");
let behavior: typeof realFsp.open = realFsp.open;
const { createTovuAgentPluginLifecycle } = await import("../../lifecycle.js");
// Inject native effects once; every writer and seed preflight uses the same lifecycle owner.
const lifecycle = createTovuAgentPluginLifecycle({}, {
  filesystem: { ...realFsp, open: (...args) => behavior(...args) },
});
const { assertAgentPluginActivationsWritable, deleteAgentPluginActivation, recordBundledAgentPluginIfAbsent, setAgentPluginActivation, seedBundledAgentPlugins, listInstalledPlugins } = lifecycle;
const { AgentPluginActivationsBusyError, AgentPluginActivationsUnreadableError,  } = await import("@jini-ai/agent-plugins/lifecycle");
const { resolveAgentPluginLayout } = await import("../../layout.js");

const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";

async function freshRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "tovu-activation-lock-busy-"));
}

/** Copied from `activation-corrupt-file-writes.unit.test.ts` (deliberately, per the plan — no
 *  cross-test-file imports): a minimal, real bundled-plugin SOURCE directory. */
async function writeBundledSourceFixture(bundledRoot: string): Promise<void> {
  const pluginDir = path.join(bundledRoot, "mini-bundled");
  await mkdir(path.join(pluginDir, "skills", "mini-bundled"), { recursive: true });
  await writeFile(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "mini-bundled", version: "1.0.0" }),
    "utf8",
  );
  await writeFile(path.join(pluginDir, "skills", "mini-bundled", "SKILL.md"), "# mini-bundled\n", "utf8");
}

function timeoutBehavior(pid: number): typeof behavior {
  return async (...args) => {
    const lockPath = String(args[0]);
    if (path.basename(lockPath) !== "activations.json.lock") return realFsp.open(...args);
    const holder = { pid, hostname: "otherhost", token: "t", acquiredAt: new Date().toISOString() };
    throw new real.FileLockTimeoutError({ lockPath, holder, waitedMs: 15_000 });
  };
}

function lostBehavior(): typeof behavior {
  return async (...args) => {
    const handle = await realFsp.open(...args);
    const target = String(args[0]);
    if (path.basename(target).startsWith("activations.json.tmp-")) {
      const close = handle.close.bind(handle);
      // Lose real ownership immediately before assertHeld(), after the temp file is flushed.
      handle.close = async () => {
        await close();
        await realFsp.rm(path.join(path.dirname(target), "activations.json.lock"));
      };
    }
    return handle;
  };
}

function assertBusy(error: unknown, expectPid: number): void {
  assert.ok(error instanceof AgentPluginActivationsBusyError, `expected AgentPluginActivationsBusyError, got ${String(error)}`);
  assert.ok(error.lockPath.endsWith("activations.json.lock"), error.lockPath);
  assert.match(error.message, new RegExp(`pid ${expectPid}`));
  assert.equal(error.lost, false);
}

test("B1: setAgentPluginActivation maps a lock timeout to AgentPluginActivationsBusyError, writing nothing", async () => {
  const root = await freshRoot();
  try {
    const seed = '{"schemaVersion":1,"plugins":{}}\n';
    await writeFile(path.join(root, "activations.json"), seed, "utf8");
    behavior = timeoutBehavior(4201);

    await assert.rejects(
      () => setAgentPluginActivation({ workspaceRoot: root, pluginId: "plugin-a", enabled: false, actor: "op" }),
      (error: unknown) => {
        assertBusy(error, 4201);
        return true;
      },
    );
    assert.equal(await readFile(path.join(root, "activations.json"), "utf8"), seed);
  } finally {
    behavior = realFsp.open;
    await forceRemove(root);
  }
});

test("B2: recordBundledAgentPluginIfAbsent maps a lock timeout to AgentPluginActivationsBusyError, writing nothing", async () => {
  const root = await freshRoot();
  try {
    behavior = timeoutBehavior(4202);

    await assert.rejects(
      () => recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "mini-bundled" }),
      (error: unknown) => {
        assertBusy(error, 4202);
        return true;
      },
    );
    await assert.rejects(readFile(path.join(root, "activations.json")), { code: "ENOENT" });
  } finally {
    behavior = realFsp.open;
    await forceRemove(root);
  }
});

test("B3: deleteAgentPluginActivation maps a lock timeout to AgentPluginActivationsBusyError, writing nothing", async () => {
  const root = await freshRoot();
  try {
    const seed = JSON.stringify({ schemaVersion: 1, plugins: { "plugin-a": { enabled: false, origin: "operator-installed", updatedAt: "t", updatedBy: "op" } } });
    await writeFile(path.join(root, "activations.json"), seed, "utf8");
    behavior = timeoutBehavior(4203);

    await assert.rejects(
      () => deleteAgentPluginActivation({ workspaceRoot: root, pluginId: "plugin-a" }),
      (error: unknown) => {
        assertBusy(error, 4203);
        return true;
      },
    );
    assert.equal(await readFile(path.join(root, "activations.json"), "utf8"), seed);
  } finally {
    behavior = realFsp.open;
    await forceRemove(root);
  }
});

test("B4: assertAgentPluginActivationsWritable maps a lock timeout to AgentPluginActivationsBusyError", async () => {
  const root = await freshRoot();
  try {
    behavior = timeoutBehavior(4204);

    await assert.rejects(() => assertAgentPluginActivationsWritable({ workspaceRoot: root }), (error: unknown) => {
      assertBusy(error, 4204);
      return true;
    });
  } finally {
    behavior = realFsp.open;
    await forceRemove(root);
  }
});

test("B5: a lock LOST right before the rename maps to AgentPluginActivationsBusyError with lost:true, and leaves no temp file", async () => {
  const root = await freshRoot();
  try {
    const seed = '{"schemaVersion":1,"plugins":{}}\n';
    await writeFile(path.join(root, "activations.json"), seed, "utf8");
    behavior = lostBehavior();

    await assert.rejects(
      () => setAgentPluginActivation({ workspaceRoot: root, pluginId: "plugin-a", enabled: false, actor: "op" }),
      (error: unknown) => {
        assert.ok(error instanceof AgentPluginActivationsBusyError);
        assert.equal(error.lost, true);
        return true;
      },
    );
    assert.equal(await readFile(path.join(root, "activations.json"), "utf8"), seed);
    const entries = await readdir(root);
    assert.deepEqual(
      entries.filter((entry) => entry.includes(".tmp-")),
      [],
      `no temp file may survive a lost-lock write: ${JSON.stringify(entries)}`,
    );
  } finally {
    behavior = realFsp.open;
    await forceRemove(root);
  }
});

test("B6: a busy pre-flight fails every bundled plugin with a reason naming the write lock, installing nothing", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "tovu-seed-lock-busy-"));
  const bundledRoot = await mkdtemp(path.join(os.tmpdir(), "tovu-seed-lock-busy-bundled-"));
  try {
    await writeBundledSourceFixture(bundledRoot);
    const layout = resolveAgentPluginLayout({ cwd, env: {} });
    behavior = timeoutBehavior(4206);

    const result = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: bundledRoot });

    assert.equal(result.outcomes.length, 1);
    const outcome = result.outcomes[0] as { pluginId: string; status: string; reason?: string };
    assert.equal(outcome.pluginId, "mini-bundled");
    assert.equal(outcome.status, "failed");
    assert.match(outcome.reason ?? "", /write lock/);
    assert.deepEqual(await listInstalledPlugins(layout.forWorkspace(WORKSPACE_ID).root), []);
  } finally {
    behavior = realFsp.open;
    await forceRemove(cwd);
    await forceRemove(bundledRoot);
  }
});

test("B7: a REAL lock combined with a corrupt file rejects AgentPluginActivationsUnreadableError, not Busy — non-lock errors are not remapped", async () => {
  const root = await freshRoot();
  try {
    behavior = realFsp.open;
    await writeFile(path.join(root, "activations.json"), "{ not json at all", "utf8");

    await assert.rejects(
      () => setAgentPluginActivation({ workspaceRoot: root, pluginId: "plugin-a", enabled: false, actor: "op" }),
      AgentPluginActivationsUnreadableError,
    );
  } finally {
    await forceRemove(root);
  }
});
