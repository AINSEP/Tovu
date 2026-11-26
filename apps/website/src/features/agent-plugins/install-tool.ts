import { createAgentPluginUpdateEffects } from "./update-effects.js";
import { requireUpdateMcpDeps } from '@jini-ai/agent-plugins/site/update-effects';
import { bindAgentPluginsInstallTools, AGENT_PLUGINS_INSTALL_TOOL_ID, AGENT_PLUGINS_UPDATE_TOOL_ID } from '@jini-ai/agent-plugins/site/install-tool';
import { agentPluginsToolMetadata as toolMetadata } from '../../contracts/core/tool-metadata/index.js';
import { createHash } from "node:crypto";
import type { AgentToolDefinition } from "@jini-ai/core";
import { zipLocalFolder } from "@jini-ai/agent-plugins/folder-zip/node";
import { PLUGIN_INSTALL_SOURCE_SCHEMA } from "../../contracts/headless/plugin-install-source.js";
import { listInstalledPlugins, maxAgentPluginInstallArchiveBytes, preferBundledAgentPluginDigests, readBundledAgentPluginDigests, seedBundledAgentPlugins } from "./lifecycle.js";
import { previewUploadedAgentPlugin, installUploadedAgentPlugin } from "./install-upload.js";
import { agentPluginActivations } from "./activation-effects.js";
import { listBundledAgentPluginServers } from "./new-site-agent-plugin-tokens.js";
import { customizeAgentPluginCatalog } from './customize-tool.js';
import { prepareCustomizedAgentPluginArchive } from '@jini-ai/agent-plugins/site/customize-tool';
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "./identity-read-policy.js";

export const catalog: AgentToolDefinition[] = [{
  name: AGENT_PLUGINS_INSTALL_TOOL_ID,
  description: "Installs an AGENT plugin (plugin.json). Choose one source: kind:'zip' with attachmentRef (from chat_list_pending_attachments) or an absolute path; " +
    "kind:'folder' with a local absolute path (packed like an admin folder upload); or kind:'bundled' with bundledId (a plugin shipped with Tovu, e.g. ui-ux-design): no file, never search the disk for it. " +
    "ZIPs and folders preview the full package before installing and carry the unverified-publisher trust warning. Installed OFF. An already installed bundled id is a no-op. " +
    "replace:true replaces the same plugin ID's disabled operator-installed version, preserving memory; older versions are refused (no downgrades). " +
    "Bundled or enabled versions cannot be replaced. For owner-requested bundled edits use agent_plugins_customize to create an edited site copy automatically, never ask for manual copying. Enable afterwards with plugins_set_enabled (family 'agent-plugin'). Does not install site plugins, themes or standalone skills.",
  sideEffects: "mutates-durable-state", authorization: { permission: "admin.plugins.enable" },
  inputSchema: { type: "object", additionalProperties: false, required: ["source"], properties: {
    source: { ...PLUGIN_INSTALL_SOURCE_SCHEMA,
      oneOf: [
        { required: ["path"], properties: { kind: { type: "string", enum: ["zip", "folder"] } }, not: { anyOf: [{ required: ["attachmentRef"] }, { required: ["bundledId"] }] } },
        { required: ["attachmentRef"], properties: { kind: { const: "zip" } }, not: { anyOf: [{ required: ["path"] }, { required: ["bundledId"] }] } },
        { required: ["bundledId"], properties: { kind: { const: "bundled" } }, not: { anyOf: [{ required: ["path"] }, { required: ["attachmentRef"] }] } },
      ],
      properties: { ...PLUGIN_INSTALL_SOURCE_SCHEMA.properties, kind: { type: "string", enum: ["zip", "folder", "bundled"] },
        bundledId: { type: "string", minLength: 1, maxLength: 64, description: "Id of a plugin shipped with Tovu (plugins_list shows installed ones). Only with kind:'bundled'; no path or attachmentRef." },
      },
    },
    replace: { type: "boolean", description: "Explicitly replace the same plugin id. Default false." },
  } },
}, {
  name: AGENT_PLUGINS_UPDATE_TOOL_ID,
  description: "Explicitly updates an operator-installed AGENT plugin to a newer package of the SAME plugin id. Source: kind:'zip' with attachmentRef (from chat_list_pending_attachments) or an absolute path, or kind:'folder' with a local absolute path. " +
    "expectedOldDigest is the installed archiveDigest from plugins_list (family 'agent-plugin'); if the plugin changed since, nothing happens. Keeps its enabled state and memory. " +
    "Refuses bundled plugins, downgrades and another plugin's package. For bundled edits use agent_plugins_customize, which saves an edited site copy under a new id. Running chats keep the guidance they already loaded; MCP calls in progress may fail. A failed update restores the previous package, not state the new version wrote.",
  sideEffects: "mutates-durable-state", authorization: { permission: "admin.plugins.enable" },
  inputSchema: { type: "object", additionalProperties: false, required: ["source", "pluginId", "expectedOldDigest"], properties: {
    source: PLUGIN_INSTALL_SOURCE_SCHEMA,
    pluginId: { type: "string", minLength: 1, maxLength: 64, description: "The installed Agent Plugin id to update." },
    expectedOldDigest: { type: "string", pattern: "^[a-f0-9]{64}$", description: "The installed archiveDigest the update replaces." },
  } },
}, customizeAgentPluginCatalog];

/** The assistant uses the same uploaded-package service as the Agent Plugins admin add tab.
 * Customization prepares a new package and enters this same install flow, without replacement.
 * No opt-in for this family: only bundled digests may run code. Preview verifies the full archive,
 * install verifies the pinned bytes again, and every fresh/replacement install remains disabled. */
export const { buildRegistrations, contributeAgentPluginsInstallTools } = bindAgentPluginsInstallTools({
  catalog,
  catalogModule: "features/agent-plugins/install-tool.ts",
  toolMetadata,
  installPermission: "admin.plugins.enable",
  zipLocalFolder,
  maxAgentPluginInstallArchiveBytes,
  listInstalledPlugins,
  seedBundledAgentPlugins,
  listBundledAgentPluginServers,
  agentPluginActivations: {
    resolveAgentPluginActivation: required => agentPluginActivations.resolveAgentPluginActivation(required),
    isAgentPluginRecordedAsBundled: required => agentPluginActivations.isAgentPluginRecordedAsBundled(required),
  },
  sha256: archive => createHash("sha256").update(archive).digest("hex"),
  installUploadedAgentPlugin,
  previewUploadedAgentPlugin,
  /** The MCP effects an update re-provisions through. Missing deps are a host wiring fault, so this
   *  throws a plain error (redacted to the model), not a caller-input error. @complexity O(1). */
  updateMcpEffects: ({ deps, actor }) => createAgentPluginUpdateEffects({ actor, deps: requireUpdateMcpDeps({ deps }) }),
  prepareCustomizedAgentPluginArchive: ({ deps, ctx }) => prepareCustomizedAgentPluginArchive({ deps, ctx, lifecycle: { listInstalledPlugins, readBundledAgentPluginDigests, preferBundledAgentPluginDigests, maxAgentPluginInstallArchiveBytes } }, TOVU_AGENT_PLUGIN_IDENTITY_READ),
});
