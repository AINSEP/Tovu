import express from "express";
import type { TestContext } from "node:test";
import { createToolRegistry, type ToolRegistration } from "@jini-ai/core";
import { createToolExecutor, type PrepareToolGuidance } from "@jini-ai/daemon";
import { createRouteDeps } from "../../app.js";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { createDaemonSiteTools } from "#src/server/inbound/assistant/agent-daemon-site-tools";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAssistantToolExecRoutes } from "../assistant-tool-exec.js";

/** Real live-run RPC and daemon client; callers supply only the plugin owner and its log sink. */
export async function pluginPreflightFixture({ t, context, plugins, tools = [], prepareGuidance }: {
  t: TestContext; context: { principalId: string; conversationId: string; prompt: string } & Record<string, unknown>;
  plugins: NonNullable<Parameters<typeof registerAssistantToolExecRoutes>[0]["plugins"]>;
  tools?: readonly ToolRegistration[]; prepareGuidance?: PrepareToolGuidance;
}, _options = {}) {
  const deps = createRouteDeps();
  const runId = "daemon-test-run";
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: context.principalId }).create({ id: context.conversationId });
  await deps.chatRunLedger.durable!.accept({ conversationId: context.conversationId, messageId: "plugin-answer", runId, principalId: context.principalId,
    workspaceId: deps.workspaceId, now: Date.now(), request: { contextRef: JSON.stringify(context) } }, {});
  const registry = createToolRegistry({});
  for (const tool of tools) registry.register(tool);
  const app = express();
  registerAssistantToolExecRoutes({ router: app, runStore: deps.chatRunLedger.durable, workspaceId: deps.workspaceId, plugins,
    toolSurface: { daemonCalls: { executor: createToolExecutor({ registry }, { prepareGuidance }), listToolsFor: () => registry.list({}) } } });
  const baseUrl = await startTestServer(app, t);
  const host = createDaemonSiteTools({ baseUrl, token: ensureToolExecToken({}, {}), localRegistry: { list: () => [] }, contextFor: () => ({}) });
  t.after(() => host.finish({ runId }));
  return host;
}
