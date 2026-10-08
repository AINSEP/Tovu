import assert from "node:assert/strict";
import test from "node:test";

import { buildBootModules } from "../bootstrap.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { PluginActivationRecord } from "@jini-ai/plugins/host";

/**
 * @file The serving (API) process must reconcile its hook registry against the durable activation
 * table, the same way the agent daemon does. `plugins_set_enabled` runs in the DAEMON process, so a
 * chat-driven disable detached the plugin's beforeSave hook only there — every admin save in the
 * serving process kept running the "disabled" plugin's hook until restart.
 */
const WORKSPACE_ID = "workspace-local";

function row(pluginId: string, enabled: boolean): PluginActivationRecord {
  return { pluginId, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled, updatedAt: "2026-09-24T00:00:00.000Z" };
}

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`plugin reconciliation timed out after ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("plugin-runtime-attach: once started, a plugin disabled by ANOTHER process is detached from this process's hook registry, and an enabled one attached; stop() ends polling", async (t) => {
  let rows: PluginActivationRecord[] = [row("word-count", true)];
  const enabledCalls: string[] = [];
  const disabledCalls: string[] = [];
  const deps = {
    workspaceId: WORKSPACE_ID,
    pluginRuntimeReady: Promise.resolve(),
    pluginActivationRepo: { listAll: async () => rows },
    onPluginEnabled: async (id: string) => {
      enabledCalls.push(id);
    },
    onPluginDisabled: (id: string) => {
      disabledCalls.push(id);
    },
  } as unknown as NewsletterRouteDeps;

  const modules = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:", pluginActivationPollIntervalMs: 10 });
  const attach = modules.find((module) => module.name === "plugin-runtime-attach");
  assert.ok(attach);
  t.after(() => attach.stop());
  await attach.prepare();
  await attach.start();

  rows = [row("word-count", false), row("reading-time", true)];
  await waitFor(() => disabledCalls.includes("word-count") && enabledCalls.includes("reading-time"));
  assert.deepEqual(disabledCalls, ["word-count"]);
  assert.deepEqual(enabledCalls, ["reading-time"]);

  await attach.stop();
  rows = [row("word-count", true)];
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(enabledCalls, ["reading-time"], "no reconciliation may run after stop()");
});

for (const heldStep of ["readiness", "activation read"] as const) {
  test(`stop cancels a queued reconciliation waiting on ${heldStep}`, async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let reads = 0;
    const changes: string[] = [];
    const deps = {
      workspaceId: WORKSPACE_ID,
      pluginRuntimeReady: heldStep === "readiness" ? held : Promise.resolve(),
      pluginActivationRepo: { listAll: async () => {
        reads += 1;
        if (reads === 1) return [row("boot-plugin", true)];
        if (heldStep === "activation read") await held;
        return [row("late-plugin", true)];
      } },
      onPluginEnabled: async (id: string) => { changes.push(`enable:${id}`); },
      onPluginDisabled: (id: string) => { changes.push(`disable:${id}`); },
    } as unknown as NewsletterRouteDeps;
    const attach = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:", pluginActivationPollIntervalMs: 10 })
      .find((module) => module.name === "plugin-runtime-attach")!;
    t.after(() => attach.stop());
    await attach.start();
    await new Promise<void>((resolve) => setImmediate(resolve));
    t.mock.timers.tick(10);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(reads, heldStep === "readiness" ? 0 : 2, "the intended continuation must be held in flight");
    await attach.stop();
    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    t.mock.timers.tick(100);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(changes, [], "settling work queued before stop must not change the registry");
  });
}

// F1.4/F2.3: run the daemon's actual module-level start call with the real timer/reconciler.
test("the daemon polling call reconciles external activation changes and stop halts it", async (t) => {
  const { default: ts } = await import("typescript");
  const { daemonSource, evaluateDaemonExpression } = await import("../../../inbound/assistant/__tests__/helpers/daemon-source.js");
  const { startPluginActivationPolling } = await import("../../composition/agent-daemon-deps.js");
  const statement = daemonSource.statements.find((entry) => ts.isExpressionStatement(entry) && ts.isCallExpression(entry.expression) && entry.expression.expression.getText(daemonSource) === "startPluginActivationPolling");
  assert.ok(statement && ts.isExpressionStatement(statement));
  t.mock.timers.enable({ apis: ["setInterval"] });
  let rows = [row("word-count", true)];
  let reads = 0;
  const activeHooks = new Set(["word-count"]);
  const poller = evaluateDaemonExpression<{ stop(): void }>(statement.expression, {
    startPluginActivationPolling,
    routeDeps: { workspaceId: WORKSPACE_ID, pluginRuntimeReady: Promise.resolve(),
      pluginActivationRepo: { listAll: async () => { reads += 1; return rows; } },
      onPluginEnabled: async (id: string) => { activeHooks.add(id); },
      onPluginDisabled: (id: string) => { activeHooks.delete(id); },
    },
  });
  t.after(() => poller.stop());
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reads, 1, "the initial enabled snapshot must seed the poller");
  rows = [row("word-count", false), row("reading-time", true)];
  t.mock.timers.tick(5000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual([...activeHooks], ["reading-time"]);
  poller.stop();
  const stoppedReads = reads;
  rows = [row("word-count", true)];
  t.mock.timers.tick(10000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reads, stoppedReads);
  assert.deepEqual([...activeHooks], ["reading-time"]);
});

test("waitFor rejects at its deadline instead of silently accepting missing reconciliation", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const checked = assert.rejects(waitFor(() => false, 20), /plugin reconciliation timed out after 20ms/);
  t.mock.timers.tick(21);
  await checked;
});
