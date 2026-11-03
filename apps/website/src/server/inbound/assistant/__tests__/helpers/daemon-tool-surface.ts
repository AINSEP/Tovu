import assert from "node:assert/strict";
import { createToolRegistry, type ToolRegistry } from "@jini-ai/core";

import { createAssistantByokModule } from "#src/server/runtime/composition/modules/assistant-byok";
import { createDaemonSiteTools } from "../../agent-daemon-site-tools.js";
import { daemonInitializer, evaluateDaemonExpression } from "./daemon-source.js";

/** Build the actual daemon adapter over the real server composition. Only HTTP transport is
 * injected: the daemon must discover server-owned descriptors without registering handlers.
 * Return a detached descriptor view and dispose the principal's native search index immediately.
 */
export async function buildDaemonToolSurface(routeDeps: Parameters<typeof createAssistantByokModule>[0]): Promise<Pick<ToolRegistry, "list" | "has">> {
  const server = createAssistantByokModule(routeDeps);
  await server.toolSurface.ready;
  const registry = createToolRegistry({});
  const host = evaluateDaemonExpression<ReturnType<typeof createDaemonSiteTools>>(daemonInitializer("siteTools"), {
    routeDeps, registry, env: { TOVU_SITE_LISTENER_ORIGIN: "https://fixture.invalid" }, siteToolToken: "fixture",
    createDaemonSiteTools: (required: Parameters<typeof createDaemonSiteTools>[0]) => createDaemonSiteTools(required, {
      fetch: async url => {
        assert.equal(new URL(String(url)).pathname, "/internal/tool-catalog");
        return Response.json({ tools: await server.toolSurface.daemonCalls.listToolsFor({ principalId: "catalog-fixture" }) });
      },
    }),
  });
  await host.start({ runId: "catalog-fixture", principalId: "catalog-fixture" });
  try {
    const tools = host.withRun({ runId: "catalog-fixture", fn: () => host.registry.list({}) });
    assert.deepEqual(registry.list({}), [], "remote descriptors must never become executable registrations");
    return { list: () => tools, has: ({ toolId }) => tools.some(tool => tool.id === toolId) };
  } finally { host.finish({ runId: "catalog-fixture" }); }
}
