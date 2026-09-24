import assert from "node:assert/strict";
import test from "node:test";

import { buildBootModules } from "../bootstrap.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { PluginActivationRecord } from "#src/features/plugin-runtime/activation";

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
    if (Date.now() - started > timeoutMs) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("plugin-runtime-attach: once started, a plugin disabled by ANOTHER process is detached from this process's hook registry, and an enabled one attached; stop() ends polling", async () => {
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
