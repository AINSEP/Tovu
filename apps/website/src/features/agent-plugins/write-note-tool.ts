import { DEFAULT_PLUGIN_MEMORY_LIMITS } from "@jini-ai/agent-plugins/persistent-state";
import { normalizePackageEntryPath } from "./package-paths.js";
import { memoryText } from "./memory-i18n.js";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { requireInputRecord, requireString, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler } from "@jini-ai/core";
import { requireHumanConfirm } from "../../contracts/core/human-confirm.js";
import { pluginMemory } from "./memory.js";
import { resolveAgentPluginLayout, type AgentPluginLayout } from "./layout.js";
import { resolveOperatorLocale, type OperatorLocaleDeps } from "./operator-locale.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";
import type { AgentPluginAccessTokenToolDeps } from "./access-token-tool.js";
import type { AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";

export const WRITE_PLUGIN_NOTE = "agent_plugin_write_note";
export const pluginNoteCatalog: AgentToolDefinition[] = [{ name: WRITE_PLUGIN_NOTE,
  description: "Save the user's explicitly requested project note for an installed Agent Plugin. Shows the proposed note for human confirmation; never call to store plugin-discovered facts (use that plugin's learned memory tool).",
  sideEffects: "mutates-durable-state", authorization: { permission: "admin.plugins.enable" },
  inputSchema: { type: "object", additionalProperties: false, required: ["pluginId", "entryPath", "text"],
    properties: { pluginId: { type: "string" }, entryPath: { type: "string" }, text: { type: "string", maxLength: 16384 } } },
}];
export const pluginNoteRisk: DerivedRiskByToolId = new Map([[WRITE_PLUGIN_NOTE, "mutates-durable-state"]]);
/**
 * The confirmed note-saving handler. The dialog copy is in the operator's admin language.
 * @param required.deps Workspace, authorization and the settings ledger the operator's locale is read from.
 * @param required.surfaces The held-open confirmation exchange store.
 * @param options.layout Agent Plugins filesystem layout; defaults to this instance's, resolved per call.
 * @complexity O(p) for p installed plugins (listed twice: before and after confirmation).
 */
export function pluginNoteHandler(
  required: { deps: Pick<AgentPluginAccessTokenToolDeps, "workspaceId" | "authorize"> & OperatorLocaleDeps; surfaces: AssistantSurfaceDeps },
  options: { layout?: AgentPluginLayout } = {},
): ToolHandler {
  return async (ctx, optional) => {
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
    const locale = await resolveOperatorLocale({ deps: required.deps, workspaceId, principalId: ctx.principal.id });
    const copy = (key: string) => memoryText({ key, locale });
    const confirmation = await requireHumanConfirm({ ctx, surfaces: required.surfaces,
      spec: { toolId: WRITE_PLUGIN_NOTE, errorCode: "PLUGIN_NOTE", title: copy("Save plugin note?"),
        details: [{ label: "Plugin", value: pluginId }, { label: copy("File"), value: entryPath }, { label: copy("Note"), value: text }], confirmLabel: copy("Save note") },
    }, optional);
    if (!confirmation.confirmed) return { saved: false, reason: confirmation.reason };
    if (!(await installed())) throw new Error("Plugin was uninstalled while the note was being confirmed");
    return { saved: true, ...await pluginMemory({ workspaceId, pluginId }, { layout }).writeNote({ entryPath, text }) };
  };
}
