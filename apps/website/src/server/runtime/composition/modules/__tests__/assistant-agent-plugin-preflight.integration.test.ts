import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../../app.js";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { registerAssistantToolExecRoutes } from "../assistant-tool-exec.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { AutomaticPluginRun } from "#src/features/agent-plugins/automatic-agent-plugins";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTempSiteLayoutFixture } from "#src/__tests__/fixtures/site-layout-context";
import { resolveAgentPluginRefs } from "#src/features/agent-plugins/lifecycle";
import { createAssistantByokModule } from "../assistant-byok.js";

test("plugin preflight uses the site's live run identity and releases terminal consent", async t => {
  const deps = createRouteDeps();
  const conversationId = "plugin-chat";
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: "member" }).create({ id: conversationId });
  await deps.chatRunLedger.durable!.accept({ conversationId, messageId: "plugin-answer", runId: "plugin-run", principalId: "member", workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: JSON.stringify({ prompt: "use the plugin", userPrompt: "the user's own words", principalId: "forged-context", conversationId: "forged-chat", pluginRefIds: ["picked"] }) } }, {});
  const contexts: AutomaticPluginRun[] = [];
  const messages: (string | undefined)[] = [];
  const forgotten: string[] = [];
  const app = express();
  registerAssistantToolExecRoutes({ router: app, workspaceId: deps.workspaceId, runStore: deps.chatRunLedger.durable,
    toolSurface: { daemonCalls: { executor: { execute: async () => ({ executionId: "unused", status: "completed" }), cancel() {}, getAuditRecord: () => null, resumeConfirmation: () => { throw new Error("unused"); } }, listToolsFor: async () => [] } },
    plugins: {
      controller: { start: async ({ context, messageId }) => { contexts.push(context); messages.push(messageId); await context.publish({ conversationId: context.conversationId, state: context.state, plugins: [] }); return "automatic guidance"; }, forget: ({ runId }) => { forgotten.push(runId); } },
      pinnedPrefix: async ({ pluginRefIds }) => { assert.deepEqual(pluginRefIds, ["picked"]); return "pinned guidance"; },
      emit: async ({ principalId, runId, payload }) => { assert.equal(principalId, "member"); assert.equal(runId, "plugin-run"); assert.equal(payload.type, "agent_plugins"); },
      refusalPrefix: () => "withheld tools",
    },
  }, {});
  const baseUrl = await startTestServer(app, t);
  // Boot installs the RPC token before serving, including before an unauthenticated first request.
  const token = ensureToolExecToken({}, {});
  const post = (body: unknown, authenticated = true) => fetch(`${baseUrl}/internal/agent-plugin-preflight`, { method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post({ runId: "plugin-run" }, false)).status, 401);
  for (const body of [{}, { runId: "missing" }, { runId: "plugin-run", principalId: "owner" }]) assert.ok([400, 404].includes((await post(body)).status));
  assert.equal(contexts.length, 0);
  const response = await post({ runId: "plugin-run" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { prefix: "pinned guidance\n\nautomatic guidance", refusalPrefix: "withheld tools", pluginIds: [] });
  assert.equal(contexts[0]?.principal.id, "member");
  assert.equal(contexts[0]?.conversationId, conversationId);
  assert.equal(contexts[0]?.query, "the user's own words");
  assert.deepEqual(messages, ["plugin-answer"]);
  await deps.chatRunLedger.durable!.cancel({ runId: "plugin-run", reason: "user-stop" }, {});
  assert.equal((await post({ runId: "plugin-run" })).status, 404);
  assert.ok(forgotten.includes("plugin-run"));
});

test("a stopped run cannot publish late plugin consent or receive a prepared prefix", { timeout: 5000 }, async t => {
  const deps = createRouteDeps();
  const conversationId = "stopped-plugin-chat";
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: "member" }).create({ id: conversationId });
  await deps.chatRunLedger.durable!.accept({ conversationId, messageId: "stopped-answer", runId: "stopped-run", principalId: "member", workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: JSON.stringify({ prompt: "hello", principalId: "member" }) } }, {});
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  let emissions = 0;
  const forgotten: string[] = [];
  const app = express();
  registerAssistantToolExecRoutes({ router: app, workspaceId: deps.workspaceId, runStore: deps.chatRunLedger.durable,
    toolSurface: { daemonCalls: { executor: { execute: async () => ({ executionId: "unused", status: "completed" }), cancel() {}, getAuditRecord: () => null, resumeConfirmation: () => { throw new Error("unused"); } }, listToolsFor: async () => [] } },
    plugins: { controller: { start: async ({ context }) => { assert.equal(context.query, "hello", "a missing userPrompt falls back to the saved prompt"); entered(); await waiting; await context.publish({ conversationId, state: context.state, plugins: [] }); return "late"; }, forget: ({ runId }) => { forgotten.push(runId); } },
      pinnedPrefix: async () => "", emit: async () => { emissions++; }, refusalPrefix: () => "" },
  }, {});
  const baseUrl = await startTestServer(app, t);
  const pending = fetch(`${baseUrl}/internal/agent-plugin-preflight`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ensureToolExecToken({}, {})}` }, body: JSON.stringify({ runId: "stopped-run" }) });
  assert.equal(await Promise.race([started.then(() => "started"), pending.then(() => "responded")]), "started", "a valid preflight must reach the server controller");
  await deps.chatRunLedger.durable!.cancel({ runId: "stopped-run", reason: "user-stop" }, {});
  release();
  assert.equal((await pending).status, 404);
  assert.equal(emissions, 0);
  assert.ok(forgotten.includes("stopped-run"));
});

test("pinned preflight always inlines text and carries its identity, even with pointer environment delivery", async t => {
  const previous = process.env.TOVU_AGENT_PLUGIN_DELIVERY;
  process.env.TOVU_AGENT_PLUGIN_DELIVERY = "pointer";
  t.after(() => { if (previous === undefined) delete process.env.TOVU_AGENT_PLUGIN_DELIVERY; else process.env.TOVU_AGENT_PLUGIN_DELIVERY = previous; });
  const site = createTempSiteLayoutFixture({});
  t.after(site.cleanup);
  const deps = { ...createRouteDeps(), ...site.deps };
  await Promise.all([deps.pluginRuntimeReady, deps.siteTitleReady]);
  const pluginId = "preflight-notes", digest = "a".repeat(64);
  const workspace = deps.agentPluginLayout.forWorkspace(deps.workspaceId);
  const packageDir = path.join(workspace.pluginPackagesDir({ pluginId }), digest);
  await mkdir(path.join(packageDir, "skills", pluginId), { recursive: true });
  await writeFile(path.join(packageDir, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" }));
  const guidance = `---\nname: ${pluginId}\ndescription: Notes\n---\nPINNED_BEGIN\n${"Full guidance. ".repeat(700)}\nPINNED_END`;
  await writeFile(path.join(packageDir, "skills", pluginId, "SKILL.md"), guidance);
  await writeFile(path.join(workspace.root, "activations.json"), JSON.stringify({ schemaVersion: 1, plugins: { [pluginId]: { enabled: true, origin: "bundled", updatedAt: "2026-10-18T00:00:00.000Z", updatedBy: "fixture" } } }));
  await writeFile(path.join(workspace.root, "bundled-digests.json"), JSON.stringify({ schemaVersion: 1, plugins: { [pluginId]: { archiveDigest: digest } } }));
  const expected = await resolveAgentPluginRefs([pluginId], workspace, 'inject');
  assert.equal(expected.ok, true);
  if (!expected.ok) throw new Error("fixture guidance unavailable");
  assert.ok(expected.promptPrefix.includes(guidance));
  const principalId = await deps.ownerPrincipalId, conversationId = "pinned-pointer-chat", runId = "pinned-pointer-run";
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: principalId }).create({ id: conversationId });
  await deps.chatRunLedger.durable!.accept({ conversationId, messageId: "pinned-pointer-answer", runId, principalId, workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: JSON.stringify({ prompt: "Read notes", pluginRefIds: [pluginId] }) } }, {});
  const app = express();
  createAssistantByokModule(deps).registerToolExecRoutes({ router: app });
  const baseUrl = await startTestServer(app, t);
  const response = await fetch(`${baseUrl}/internal/agent-plugin-preflight`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ensureToolExecToken({}, {})}` }, body: JSON.stringify({ runId }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { prefix: expected.promptPrefix, refusalPrefix: "", pluginIds: [pluginId] });
});
