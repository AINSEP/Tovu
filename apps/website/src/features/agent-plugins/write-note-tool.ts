import { DEFAULT_PLUGIN_MEMORY_LIMITS } from "@jini-ai/agent-plugins/persistent-state";
import { normalizePackageEntryPath } from "./lifecycle.js";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { requireInputRecord, requireString, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler } from "@jini-ai/core";
import { pluginMemory } from "./memory.js";
import { resolveAgentPluginLayout, type AgentPluginLayout } from "./layout.js";
import { type OperatorLocaleDeps } from "./operator-locale.js";
import { listInstalledPlugins } from "./lifecycle.js";
import type { AgentPluginAccessTokenToolDeps } from "./access-token-tool.js";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";

export const WRITE_PLUGIN_NOTE = "agent_plugin_write_note";
export const pluginNoteCatalog: AgentToolDefinition[] = [{ name: WRITE_PLUGIN_NOTE,
  description: "Save the user's explicitly requested project note for an installed Agent Plugin. Writes the note directly; never call to store plugin-discovered facts (use that plugin's learned memory tool).",
  sideEffects: "mutates-durable-state", authorization: { permission: "admin.plugins.enable" },
  inputSchema: { type: "object", additionalProperties: false, required: ["pluginId", "entryPath", "text"],
    properties: { pluginId: { type: "string" }, entryPath: { type: "string" }, text: { type: "string", maxLength: 16384 } } },
}];
export const pluginNoteRisk: DerivedRiskByToolId = new Map([[WRITE_PLUGIN_NOTE, "mutates-durable-state"]]);
/**
 * The note-saving handler. Notes are context, never a permission grant.
 * @param required.deps Workspace, authorization and the settings ledger the operator's locale is read from.
 * @param required.surfaces Retained host contributor transport ABI; notes need no approval.
 * @param options.layout Agent Plugins filesystem layout; defaults to this instance's, resolved per call.
 * @complexity O(p) for p installed plugins.
 */
export function pluginNoteHandler(
  required: { deps: Pick<AgentPluginAccessTokenToolDeps, "workspaceId" | "authorize"> & OperatorLocaleDeps; surfaces: AssistantSurfaceDeps },
  options: { layout?: AgentPluginLayout } = {},
): ToolHandler {
  return async (ctx) => {
    ctx = { ...ctx, input: structuredClone(ctx.input), principal: { ...ctx.principal }, run: { ...ctx.run } };
    const input = requireInputRecord({ input: ctx.input });
    if (Object.keys(input).some(key => !["pluginId", "entryPath", "text"].includes(key))) throw new Error("Unexpected note field");
    const pluginId = requireString({ input, key: "pluginId" });
    const entryPath = requireString({ input, key: "entryPath" });
    const text = requireString({ input, key: "text" });
    normalizePackageEntryPath(entryPath);
    if (Buffer.byteLength(text, "utf8") > DEFAULT_PLUGIN_MEMORY_LIMITS.notes || text.includes("\0")) throw new Error("Note is not valid bounded UTF-8 text");
    const workspaceId = required.deps.workspaceId;
    await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: required.deps.authorize }), workspaceId,
      principalId: ctx.principal.id, permission: "admin.plugins.enable" }, { entityType: "agent-plugin", entityId: pluginId });
    const layout = options.layout ?? resolveAgentPluginLayout();
    const installed = async () => (await listInstalledPlugins(layout.forWorkspace(workspaceId).root)).some(plugin => plugin.pluginId === pluginId);
    if (!(await installed())) throw new Error("Agent Plugin is not installed");
    if (ctx.signal.aborted) return { saved: false, reason: "abandoned" };
    return { saved: true, ...await pluginMemory({ workspaceId, pluginId }, { layout }).writeNote({ entryPath, text }) };
  };
}
