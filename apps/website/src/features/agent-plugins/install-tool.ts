import { createHash } from "node:crypto";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor } from "#src/assistant/index";
import type { PluginsToolDeps } from "../plugin-runtime/tool-registrations.js";
import { PLUGIN_INSTALL_SOURCE_SCHEMA, readPluginInstallRequest, readPluginInstallArchive, type InstallAttachmentReader } from "../plugin-runtime/install-source.js";
import { AgentPluginInstallError, maxAgentPluginInstallArchiveBytes } from "./install.js";
import { AgentPluginUploadError, previewUploadedAgentPlugin, installUploadedAgentPlugin } from "./install-upload.js";
import type { AgentPluginLayout } from "./layout.js";
import { resolveAgentPluginLayout } from "./layout.js";
import { agentPluginActivations } from "./activation-effects.js";

/** The assistant uses the same uploaded-package service as the Agent Plugins admin add tab.
 * No opt-in for this family: only bundled digests may run code. Preview verifies the full archive,
 * install verifies the pinned bytes again, and every fresh/replacement install remains disabled. */
export type AgentPluginsInstallToolDeps = Pick<PluginsToolDeps, "workspaceId" | "authorize"> & {
  readonly readInstallAttachment?: InstallAttachmentReader;
  readonly layout?: AgentPluginLayout;
};

export const AGENT_PLUGINS_INSTALL_TOOL_ID = "agent_plugins_install";
export const catalog: AgentToolDefinition[] = [{
  name: AGENT_PLUGINS_INSTALL_TOOL_ID,
  description: "Installs an AGENT plugin (plugin.json) from a chat ZIP source.attachmentRef (get it from chat_list_pending_attachments) or a local absolute ZIP source.path. " +
    "Use for uploaded Agent Plugin packages; folders chosen in admin are uploaded as ZIPs. Previews the full package before installing; " +
    "the result carries the unverified-publisher trust warning. Installed OFF. replace:true replaces the same plugin ID's disabled operator-installed version, preserving memory. " +
    "Bundled or enabled versions cannot be replaced. Enable afterwards with plugins_set_enabled (family 'agent-plugin'). Does not install site plugins, themes or standalone skills.",
  sideEffects: "mutates-durable-state", authorization: { permission: "admin.plugins.enable" },
  inputSchema: { type: "object", additionalProperties: false, required: ["source"], properties: {
    source: { ...PLUGIN_INSTALL_SOURCE_SCHEMA, properties: { ...PLUGIN_INSTALL_SOURCE_SCHEMA.properties, kind: { type: "string", enum: ["zip"] } } },
    replace: { type: "boolean", description: "Explicitly replace the same plugin id. Default false." },
  } },
}];
export const derivedRisk: DerivedRiskByToolId = new Map([[AGENT_PLUGINS_INSTALL_TOOL_ID, "mutates-durable-state"]]);

export function buildRegistrations(deps: AgentPluginsInstallToolDeps, _optional: Record<string, never> = {}): ToolRegistration[] {
  return buildDomainRegistrations({ domain: "agent-plugins-install", catalogModule: "features/agent-plugins/install-tool.ts", catalog: indexCatalogById({ catalog }), derivedRisk,
    handlers: { [AGENT_PLUGINS_INSTALL_TOOL_ID]: async ctx => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "admin.plugins.enable" }, { entityType: "plugin" });
      const request = readPluginInstallRequest({ input: ctx.input });
      if (request.kind !== "zip") throw new ToolInputError({ message: "Agent Plugin source must be a ZIP path or attachmentRef. Upload a chosen folder as a ZIP." });
      const archive = await readPluginInstallArchive({ request, ownerId: ctx.principal.id, runId: ctx.run.id, maxBytes: maxAgentPluginInstallArchiveBytes() }, { ...(deps.readInstallAttachment ? { readAttachment: deps.readInstallAttachment } : {}) });
      const required = { archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), workspaceId: deps.workspaceId, actor: ctx.principal.id, replace: request.replace };
      const optional = deps.layout ? { layout: deps.layout } : {};
      try {
        const preview = await previewUploadedAgentPlugin(required, optional);
        const result = await installUploadedAgentPlugin({ ...required, expectedSha256: preview.digest }, optional);
        // Identical bytes are a no-op, including activation. Do not falsely report OFF for a
        // package the operator already enabled; malformed activation remains explicitly unknown.
        const verdict = result.alreadyInstalled
          ? (await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot: (deps.layout ?? resolveAgentPluginLayout()).forWorkspace(deps.workspaceId).root, pluginId: result.plugin.pluginId })).verdict
          : "inactive";
        return { installed: true, enabled: verdict === "undetermined" ? null : verdict === "active", alreadyInstalled: result.alreadyInstalled,
          plugin: { id: result.plugin.pluginId, ...(result.plugin.version ? { version: result.plugin.version } : {}), ...(result.upgradeFrom ? { upgradeFrom: result.upgradeFrom } : {}) },
          warning: preview.warning,
          note: result.alreadyInstalled ? "These exact bytes are already installed; activation was not changed." : "Installed OFF. Enable with plugins_set_enabled (family 'agent-plugin') if requested.",
        };
      } catch (error) {
        if (error instanceof AgentPluginInstallError || error instanceof AgentPluginUploadError) throw new ToolInputError({ message: `${error.code}: ${error.message}` });
        throw error;
      }
    } },
  });
}

export function contributeAgentPluginsInstallTools(
  required: { readInstallAttachment?: InstallAttachmentReader } = {},
  _optional: Record<string, never> = {},
): ToolContributor {
  return { domain: "agent-plugins-install", build: deps => buildRegistrations({ ...deps, ...required }), risk: derivedRisk };
}
