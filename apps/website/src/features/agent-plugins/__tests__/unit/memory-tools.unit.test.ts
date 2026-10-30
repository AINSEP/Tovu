import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
import { containAgentPluginStatePath } from "#src/features/agent-plugins/lifecycle";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { buildPluginMemoryRegistrations } from "../../memory-tools.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { forceRemove } from "../fixtures/force-remove.js";
import type { ToolExecutionContext } from "@jini-ai/core";
import { executeRegisteredTool } from "../../../../assistant/__tests__/fixtures/execute-registered-tool.js";
import { pluginMemory } from "../../memory.js";

test("L025b memory pairs pin scoped read/write schemas, validation and revocation", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "memory-tools-pin-"));
  t.after(() => forceRemove(root));
  let callable = true;
  const owners: string[] = [];
  const classify = mock.fn(withExtensionApprovalPolicy);
  const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: root } });
  const registrations = buildPluginMemoryRegistrations({ withExtensionApprovalPolicy: classify, workspaceId: "workspace-local", agentPluginLayout: layout,
    sources: [{ id: "agent_plugin_pinned", pluginId: "pinned", archiveDigest: "a".repeat(64) }],
    gate: { isCallable: async owner => { owners.push(owner.pluginId); return callable; } },
  });
  assert.equal(registrations.length, 2);
  assert.deepEqual(classify.mock.calls.map(call => call.arguments[0].family), ["plugin-memory-read", "plugin-memory-write"]);
  registrations.forEach((registration, index) => assert.equal(registration, classify.mock.calls[index]!.result));
  const [read, write] = registrations;
  assert.deepEqual(read!.descriptor.metadata?.approval, { class: "read", confirmation: "direct" });
  assert.deepEqual(write!.descriptor.metadata?.approval, { class: "edit", confirmation: "direct" });
  assert.deepEqual((read!.descriptor.inputSchema as { required: string[] }).required, []);
  assert.deepEqual((write!.descriptor.inputSchema as { required: string[] }).required, ["entryPath", "text"]);
  const ctx: ToolExecutionContext = { executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal, input: {} };
  assert.deepEqual(await read!.handler(ctx), { pluginId: "pinned", entries: [] });
  assert.deepEqual(await read!.handler({ ...ctx, input: { entryPath: "account.json" } }), { pluginId: "pinned", entryPath: "account.json", exists: false });
  await write!.handler({ ...ctx, input: { entryPath: "account.md", text: "Learned context" } }, {});
  assert.deepEqual(await read!.handler({ ...ctx, input: { entryPath: "account.md" } }, {}), { pluginId: "pinned", entryPath: "account.md", text: "Learned context" });
  assert.deepEqual(await read!.handler(ctx), { pluginId: "pinned", entries: [{ relativePath: "account.md", text: "Learned context" }] });
  const listed = await executeRegisteredTool({ registration: read!, input: {} });
  assert.equal(listed.status, "completed", "the execution gate must accept list mode too");
  const sibling = pluginMemory({ contain: containAgentPluginStatePath, workspaceId: "workspace-local", pluginId: "sibling" }, { layout });
  await sibling.learned.write({ entryPath: "private.md", text: "other plugin's context" });
  assert.deepEqual(await read!.handler({ ...ctx, input: { entryPath: "private.md" } }), { pluginId: "pinned", entryPath: "private.md", exists: false });
  const directory = path.join(layout.forWorkspace("workspace-local").pluginMemoryDir({ pluginId: "pinned", kind: "learned" }), "not-a-file");
  await mkdir(directory);
  await assert.rejects(read!.handler({ ...ctx, input: { entryPath: "not-a-file" } }), /regular UTF-8 files/, "non-ENOENT errors must propagate");
  for (const entryPath of ["../escape", "", 42]) await assert.rejects(read!.handler({ ...ctx, input: { entryPath } }));
  for (const registration of registrations) {
    await assert.rejects(() => registration.handler({ ...ctx, input: { entryPath: "account.md", pluginId: "other" } }, {}), /accepts no plugin id/);
    if (registration === write) await assert.rejects(() => registration.handler({ ...ctx, input: {} }, {}), /entryPath/);
    const authCtx = {} as Parameters<typeof registration.policy.authorize>[0];
    callable = false;
    assert.equal(await registration.policy.authorize(authCtx), "deny");
    callable = true;
    assert.equal(await registration.policy.authorize(authCtx), "allow");
  }
  await assert.rejects(() => write!.handler({ ...ctx, input: { entryPath: "account.md" } }, {}), /text/);
  assert.deepEqual(owners, ["pinned", "pinned", "pinned", "pinned", "pinned"]);
});
