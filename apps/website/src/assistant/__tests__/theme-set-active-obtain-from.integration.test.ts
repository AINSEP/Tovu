import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry, type ToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";
import { buildToolIndex, handleToolCall, type McpToolDef } from "@jini-ai/mcp";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { buildSetActiveThemeRegistrations, type SetActiveThemeToolDeps } from "#src/features/theme/set-active-theme-tool";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/** `theme_set_active` called without `themeId`, on both paths a model can take. Only the schema and the handler's own
 * refusal are read: no theme is looked up before the id is required. */
const MISSING_THEME_ID = "'themeId' (non-empty string) is required";

function buildRegistry(): ToolRegistry {
  const deps: SetActiveThemeToolDeps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: createFakeClock({ startIso: "2026-11-18T01:00:00.000Z" }),
    themes: [],
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [] }),
  };
  const registry = createToolRegistry({});
  for (const registration of buildSetActiveThemeRegistrations(deps)) registry.register(registration);
  // The lister `themeId` points at is registered by the content-read tool: a read-only stand-in of it.
  registry.register({ descriptor: { id: "content_read.theme", readOnly: true }, policy: { authorize: () => "allow" }, handler: async () => ({ themes: [] }) });
  return registry;
}

test("theme_set_active without themeId, through the gateway that holds the registry, says which tool lists themes", async () => {
  const registry = buildRegistry();
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });

  const result = await delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: "tu-1", toolId: "theme_set_active", input: {} },
    deps: { lifecycle, toolExecutor: createToolExecutor({ registry }), resolvePrincipal: () => ({ id: "principal-1" }), toolRegistry: registry },
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.error?.message, `${MISSING_THEME_ID} List valid values for \`themeId\` with content_read.theme.`);
});

test("theme_set_active without themeId, as a typed MCP tool, says which tool lists themes between the instruction and the contract", async () => {
  const registry = buildRegistry();
  const tools: McpToolDef[] = registry.list({}).map(descriptor => ({ name: descriptor.id, description: descriptor.description ?? descriptor.id,
    inputSchema: descriptor.inputSchema as McpToolDef["inputSchema"], handler: () => "ran" }));
  const schema = tools.find(({ name }) => name === "theme_set_active")?.inputSchema;

  const result = await handleToolCall({ name: "theme_set_active", tools: buildToolIndex({ tools }), ctx: { baseUrl: "http://daemon", fetchImpl: fetch, diagnosticToolIds: registry.list({}).map(({ id }) => id) } }, { rawArgs: {} });

  assert.deepEqual(result.content, [{ type: "text", text: `invalid arguments for theme_set_active: supply required argument \`themeId\`; list valid values with content_read.theme; Input schema: ${JSON.stringify(schema)}` }]);
});
