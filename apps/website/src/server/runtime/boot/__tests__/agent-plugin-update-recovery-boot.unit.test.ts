import assert from "node:assert/strict";
import test from "node:test";

import { buildBootModules } from "../bootstrap.js";
import { runBootLifecycle } from "../../lifecycle/boot-lifecycle.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";

/**
 * @file Boot's Agent Plugin update recovery: an update a crash interrupted is finished or rolled back
 * by the lifecycle owner before the bundled seed runs and before anything is served, and a failed
 * recovery is logged and retried next boot without taking the whole site down.
 */
const WORKSPACE_ID = "workspace-local";
const options = { useMemory: true, defaultContentDbPath: () => ":memory:" };

function depsWith(reconcile: (input: { workspaceId: string }) => Promise<void>): NewsletterRouteDeps {
  return { workspaceId: WORKSPACE_ID, agentPluginLifecycle: { reconcileAgentPluginUpdates: reconcile } } as unknown as NewsletterRouteDeps;
}

function recoveryModule(deps: NewsletterRouteDeps) {
  const modules = buildBootModules(deps, options);
  const index = modules.findIndex((module) => module.name === "agent-plugin-update-recovery");
  assert.ok(index >= 0);
  return { modules, index, recovery: modules[index]! };
}

test("agent-plugin-update-recovery: reconciles this workspace's updates through the lifecycle owner", async () => {
  const calls: { workspaceId: string }[] = [];
  const { recovery } = recoveryModule(depsWith(async (input) => void calls.push(input)));
  assert.equal(recovery.owner, "features/agent-plugins");
  await recovery.prepare();
  await recovery.start();
  await recovery.stop();
  assert.deepEqual(calls, [{ workspaceId: WORKSPACE_ID }]);
});

test("agent-plugin-update-recovery: runs before the bundled seed (so before serving), never after it", () => {
  const { modules, index } = recoveryModule(depsWith(async () => {}));
  const seed = modules.findIndex((module) => module.name === "bundled-agent-plugins");
  assert.ok(seed > index, "recovery must precede the bundled seed");
});

test("agent-plugin-update-recovery: a failed recovery is logged and is optional, so boot still completes", async (t) => {
  const errors: string[] = [];
  t.mock.method(console, "error", (message: string) => void errors.push(message));
  const { recovery } = recoveryModule(depsWith(async () => { throw new Error("rollback bytes missing"); }));
  assert.equal(recovery.criticality, "optional");
  await assert.rejects(recovery.prepare(), { message: "rollback bytes missing" });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /could not be recovered; it is retried next boot: rollback bytes missing/);

  const result = await runBootLifecycle([recovery]);
  assert.equal(result.ok, true);
  assert.equal(result.modules[0]!.lifecycle.status, "failed");
});

test("agent-plugin-update-recovery: a non-Error rejection is still logged in plain words", async (t) => {
  const errors: string[] = [];
  t.mock.method(console, "error", (message: string) => void errors.push(message));
  const { recovery } = recoveryModule(depsWith(() => Promise.reject("journal unreadable")));
  await assert.rejects(recovery.prepare());
  assert.match(errors[0]!, /retried next boot: journal unreadable$/);
});
