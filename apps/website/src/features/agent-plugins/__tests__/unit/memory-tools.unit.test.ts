import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPluginMemoryRegistrations } from "../../memory-tools.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { forceRemove } from "../fixtures/force-remove.js";
import type { ToolExecutionContext } from "@jini-ai/core";

test("L025b memory pairs pin scoped read/write schemas, validation and revocation", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "memory-tools-pin-"));
  t.after(() => forceRemove(root));
  let callable = true;
  const owners: string[] = [];
  const registrations = buildPluginMemoryRegistrations({ workspaceId: "workspace-local", agentPluginLayout: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: root } }),
    sources: [{ id: "agent_plugin_pinned", pluginId: "pinned", archiveDigest: "a".repeat(64) }],
    gate: { isCallable: async owner => { owners.push(owner.pluginId); return callable; } },
  });
  assert.equal(registrations.length, 2);
  const [read, write] = registrations;
  assert.deepEqual((read!.descriptor.inputSchema as { required: string[] }).required, ["entryPath"]);
  assert.deepEqual((write!.descriptor.inputSchema as { required: string[] }).required, ["entryPath", "text"]);
  const ctx: ToolExecutionContext = { executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal, input: {} };
  await write!.handler({ ...ctx, input: { entryPath: "account.md", text: "Learned context" } }, {});
  assert.deepEqual(await read!.handler({ ...ctx, input: { entryPath: "account.md" } }, {}), { pluginId: "pinned", entryPath: "account.md", text: "Learned context" });
  for (const registration of registrations) {
    await assert.rejects(() => registration.handler({ ...ctx, input: { entryPath: "account.md", pluginId: "other" } }, {}), /accepts no plugin id/);
    await assert.rejects(() => registration.handler({ ...ctx, input: {} }, {}), /entryPath/);
    const authCtx = {} as Parameters<typeof registration.policy.authorize>[0];
    callable = false;
    assert.equal(await registration.policy.authorize(authCtx), "deny");
    callable = true;
    assert.equal(await registration.policy.authorize(authCtx), "allow");
  }
  await assert.rejects(() => write!.handler({ ...ctx, input: { entryPath: "account.md" } }, {}), /text/);
  assert.deepEqual(owners, ["pinned", "pinned", "pinned", "pinned"]);
});
