import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRegistrations, catalog } from "../../install-tool.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { buildZipFixture } from "../fixtures/build-zip.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { ToolInputError } from "@jini-ai/core";
import { agentPluginActivations } from "../../activation-effects.js";

const input = { source: { kind: "zip", attachmentRef: "attachment:agent123" } };
const context = (value: unknown = input) => ({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: value, signal: new AbortController().signal });

test("agent install catalog publishes a discoverable gated durable install tool", () => {
  assert.equal(catalog[0]!.name, "agent_plugins_install");
  assert.equal(catalog[0]!.authorization?.permission, "admin.plugins.enable");
  assert.match(catalog[0]!.description, /OFF/);
});

test("agent install names chat_list_pending_attachments as the attachmentRef source", () => {
  const source = (catalog[0]!.inputSchema as { properties: { source: { properties: { attachmentRef: { description: string } } } } }).properties.source;
  assert.match(source.properties.attachmentRef.description, /chat_list_pending_attachments/);
  assert.match(catalog[0]!.description, /chat_list_pending_attachments/);
});

test("agent attachment and local ZIP paths install via the real upload service, switched off", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-tool-install-"));
  const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: dir } });
  const bytes = await buildZipFixture([{ path: "plugin.json", content: JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "chat-test", version: "1.0.0" }) }]);
  const reads: unknown[] = [];
  try {
    const [tool] = buildRegistrations({ workspaceId: "workspace-local", authorize: async () => ({ allowed: true, reason: "matched" }), layout,
      readInstallAttachment: async (required, optional) => { reads.push({ required, optional }); return { ok: true, bytes }; },
    });
    const result = await tool!.handler(context(), {}) as { installed: boolean; enabled: boolean; warning: string };
    assert.equal(result.installed, true);
    assert.equal(result.enabled, false);
    assert.match(result.warning, /unverified/);
    assert.deepEqual(reads, [{ required: { ref: "attachment:agent123", ownerId: "owner", runId: "run" }, optional: { maxBytes: 32 * 1024 * 1024 } }]);
    const record = JSON.parse(await readFile(path.join(layout.forWorkspace("workspace-local").root, "activations.json"), "utf8")).plugins["chat-test"];
    assert.equal(record.enabled, false);
    const zip = path.join(dir, "again.zip");
    await writeFile(zip, bytes);
    assert.equal((await tool!.handler(context({ source: { kind: "zip", path: zip } }), {}) as { alreadyInstalled: boolean }).alreadyInstalled, true);
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace("workspace-local").root, pluginId: "chat-test", enabled: true, actor: "owner" });
    const unchanged = await tool!.handler(context(), {}) as { alreadyInstalled: boolean; enabled: boolean };
    assert.equal(unchanged.alreadyInstalled, true);
    assert.equal(unchanged.enabled, true, "a byte-identical no-op must report the preserved activation accurately");
  } finally { await forceRemove(dir); }
});

test("agent tool refuses permissions and inaccessible attachments before installation", async () => {
  let reads = 0;
  const readInstallAttachment = async () => { reads++; return { ok: false as const, refusal: "not-owner" as const }; };
  const [denied] = buildRegistrations({ workspaceId: "workspace-local", authorize: async () => ({ allowed: false, reason: "insufficient_permission" }), readInstallAttachment });
  await assert.rejects(() => denied!.handler(context(), {}));
  assert.equal(reads, 0);
  const [allowed] = buildRegistrations({ workspaceId: "workspace-local", authorize: async () => ({ allowed: true, reason: "matched" }), readInstallAttachment });
  await assert.rejects(() => allowed!.handler(context(), {}), ToolInputError);
  assert.equal(reads, 1);
});

test("agent tool rejects malformed input and invalid archives at preview", async () => {
  const [tool] = buildRegistrations({ workspaceId: "workspace-local", authorize: async () => ({ allowed: true, reason: "matched" }),
    readInstallAttachment: async () => ({ ok: true, bytes: Buffer.from("not zip") }),
  });
  for (const value of [input, { source: { kind: "zip" } }, { source: { kind: "zip", path: "/tmp/plugin.zip", attachmentRef: "attachment:agent123" } }]) {
    await assert.rejects(() => tool!.handler(context(value), {}), ToolInputError);
  }
});
