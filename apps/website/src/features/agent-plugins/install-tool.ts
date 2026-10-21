import { createAgentPluginUpdateEffects, type UpdateMcpDeps } from "./update-effects.js";
import { AgentPluginUpdateError, AgentPluginHostIncompatibleError, type UpdateAgentPluginRequired } from "@jini-ai/agent-plugins/lifecycle";
import { toolMetadata } from '../../contracts/core/tool-metadata/agent-plugins.js';
import { createHash } from "node:crypto";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolRegistration, type ToolExecutionContext } from "@jini-ai/core";
import { FolderZipError } from "@jini-ai/agent-plugins/folder-zip";
import { zipLocalFolder } from "@jini-ai/agent-plugins/folder-zip/node";
import type { ToolContributor } from "#src/assistant/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { PLUGIN_INSTALL_SOURCE_SCHEMA, readPluginInstallRequest, readPluginInstallArchive, type InstallAttachmentReader } from "../../contracts/headless/plugin-install-source.js";
import { AgentPluginInstallError, listInstalledPlugins, maxAgentPluginInstallArchiveBytes, seedBundledAgentPlugins } from "./lifecycle.js";
import { AgentPluginUploadError, previewUploadedAgentPlugin, installUploadedAgentPlugin } from "./install-upload.js";
import type { AgentPluginLayout } from "./layout.js";
import { agentPluginActivations } from "./activation-effects.js";
import { bundledAgentPluginsSourceRoot, listBundledAgentPluginServers } from "./new-site-agent-plugin-tokens.js";

/** The assistant uses the same uploaded-package service as the Agent Plugins admin add tab.
 * No opt-in for this family: only bundled digests may run code. Preview verifies the full archive,
 * install verifies the pinned bytes again, and every fresh/replacement install remains disabled. */
export type AgentPluginsInstallToolDeps = {
  readonly snapshotAgentPluginSettings?: UpdateAgentPluginRequired["snapshotSettings"];
  readonly pluginHost?: import("../../contracts/headless/plugin-host.js").PluginHostPort;
  readonly workspaceId: string;
  readonly authorize: AuthorizeFn;
  readonly readInstallAttachment?: InstallAttachmentReader;
  readonly agentPluginLayout: AgentPluginLayout;
  readonly bundledAgentPluginsSourceRoot?: string;
} & Partial<UpdateMcpDeps>;

export const AGENT_PLUGINS_UPDATE_TOOL_ID = "agent_plugins_update";
export const AGENT_PLUGINS_INSTALL_TOOL_ID = "agent_plugins_install";
export const catalog: AgentToolDefinition[] = [{
  name: AGENT_PLUGINS_INSTALL_TOOL_ID,
  description: "Installs an AGENT plugin (plugin.json). Choose one source: kind:'zip' with attachmentRef (from chat_list_pending_attachments) or an absolute path; " +
    "kind:'folder' with a local absolute path (packed like an admin folder upload); or kind:'bundled' with bundledId (a plugin shipped with Tovu, e.g. ui-ux-design): no file, never search the disk for it. " +
    "ZIPs and folders preview the full package before installing and carry the unverified-publisher trust warning. Installed OFF. An already installed bundled id is a no-op. " +
    "replace:true replaces the same plugin ID's disabled operator-installed version, preserving memory. " +
    "Bundled or enabled versions cannot be replaced. Enable afterwards with plugins_set_enabled (family 'agent-plugin'). Does not install site plugins, themes or standalone skills.",
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
}];
catalog.push({ ...catalog[0]!, name: AGENT_PLUGINS_UPDATE_TOOL_ID,
  description: "Explicitly update an operator-installed Agent Plugin from a supplied zip/folder candidate. Preserves enabled state and memory; refuses downgrades and bundled packages. Requires the current archiveDigest from the plugin list. In-flight MCP calls may fail; running chats retain captured guidance. Rollback does not revert state written by the candidate.",
  inputSchema: { type: "object", additionalProperties: false, required: ["source", "pluginId", "expectedOldDigest"], properties: {
    source: PLUGIN_INSTALL_SOURCE_SCHEMA,
    pluginId: { type: "string", minLength: 1, maxLength: 64 },
    expectedOldDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
  } },
});
export const derivedRisk: DerivedRiskByToolId = new Map([[AGENT_PLUGINS_INSTALL_TOOL_ID, "mutates-durable-state"], [AGENT_PLUGINS_UPDATE_TOOL_ID, "mutates-durable-state"]]);

export function buildRegistrations(deps: AgentPluginsInstallToolDeps, _optional: Record<string, never> = {}): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "agent-plugins-install", catalogModule: "features/agent-plugins/install-tool.ts", catalog: indexCatalogById({ catalog }), derivedRisk,
    handlers: {
      [AGENT_PLUGINS_INSTALL_TOOL_ID]: ctx => runInstallTool({ deps, ctx, operation: "install" }),
      [AGENT_PLUGINS_UPDATE_TOOL_ID]: ctx => runInstallTool({ deps, ctx, operation: "update" }),
    },
  });
}

async function runInstallTool({ deps, ctx, operation }: { deps: AgentPluginsInstallToolDeps; ctx: ToolExecutionContext; operation: "install" | "update" }, _optional = {}) {
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "admin.plugins.enable" }, { entityType: "plugin" });
  const input = requireInputRecord({ input: ctx.input });
  const source = input.source as Record<string, unknown> | undefined;
  if (operation === "update") {
    const pluginId = requireString({ input, key: "pluginId" });
    const expectedOldDigest = requireString({ input, key: "expectedOldDigest" });
    if (!/^[a-f0-9]{64}$/.test(expectedOldDigest)) throw new ToolInputError({ message: "expectedOldDigest must be a SHA-256 digest." });
    return installArchivePlugin({ deps, ctx }, { update: { pluginId, expectedOldDigest } });
  }
  if (source?.kind === "bundled") return installBundledPlugin({ input, deps });
  if (source && Object.hasOwn(source, "bundledId")) throw new ToolInputError({ message: "source.bundledId requires kind 'bundled' and cannot be combined with a path or attachmentRef." });
  return installArchivePlugin({ deps, ctx });
}

function updateMcpEffects({ deps, actor }: { deps: AgentPluginsInstallToolDeps; actor: string }, _optional = {}) {
  const { agentPluginLayout, workspaceId, clock, externalMcpServerRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring } = deps;
  if (!clock || !externalMcpServerRepo || !siteAssistantSecretSealer || !siteAssistantSecretKeyring) throw new ToolInputError({ message: "Plugin update MCP effects are unavailable." });
  return createAgentPluginUpdateEffects({ actor, deps: { agentPluginLayout, workspaceId, clock, externalMcpServerRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring } });
}

async function installArchivePlugin(
  { deps, ctx }: { deps: AgentPluginsInstallToolDeps; ctx: ToolExecutionContext },
  options: { update?: { pluginId: string; expectedOldDigest: string } } = {},
) {
  const request = readPluginInstallRequest({ input: ctx.input });
  try {
    const archive = request.kind === "folder"
      ? await zipLocalFolder({ path: request.path!, maxBytes: maxAgentPluginInstallArchiveBytes() })
      : await readPluginInstallArchive({ request, ownerId: ctx.principal.id, runId: ctx.run.id, maxBytes: maxAgentPluginInstallArchiveBytes() }, { ...(deps.readInstallAttachment ? { readAttachment: deps.readInstallAttachment } : {}) });
    const required = { archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), workspaceId: deps.workspaceId, actor: ctx.principal.id, replace: request.replace, ...(options.update ? { update: options.update } : {}) };
    const optional = { layout: deps.agentPluginLayout, ...(deps.pluginHost ? { pluginHost: deps.pluginHost } : {}),
      ...(options.update ? { snapshotSettings: deps.snapshotAgentPluginSettings, mcpProvisioning: updateMcpEffects({ deps, actor: ctx.principal.id }) } : {}) };
    if (options.update) {
      const result = await installUploadedAgentPlugin(required, optional);
      return { updated: true, enabled: result.enabled, warnings: result.warnings ?? [], plugin: { id: result.plugin.pluginId, version: result.plugin.version }, note: "Memory is kept. Rollback restores package bytes, not state written by the candidate. Running chats retain captured guidance; in-flight MCP calls may fail." };
    }
    const preview = await previewUploadedAgentPlugin(required, optional);
    const result = await installUploadedAgentPlugin({ ...required, expectedSha256: preview.digest }, optional);
    // Identical bytes are a no-op, including activation. Do not falsely report OFF for a
    // package the operator already enabled; malformed activation remains explicitly unknown.
    const verdict = result.alreadyInstalled
      ? (await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot: deps.agentPluginLayout.forWorkspace(deps.workspaceId).root, pluginId: result.plugin.pluginId })).verdict
      : "inactive";
    return uploadedInstallResult({ result, verdict, warning: preview.warning });
  } catch (error) {
    if (error instanceof AgentPluginUpdateError || error instanceof AgentPluginHostIncompatibleError) throw new ToolInputError({ message: `${error.code}: ${error.message}` });
    if (error instanceof FolderZipError) throw new ToolInputError({ message: error.message });
    if (error instanceof AgentPluginInstallError || error instanceof AgentPluginUploadError) throw new ToolInputError({ message: `${error.code}: ${error.message}` });
    throw error;
  }
}

function uploadedInstallResult(
  { result, verdict, warning }: { result: Awaited<ReturnType<typeof installUploadedAgentPlugin>>; verdict: Awaited<ReturnType<typeof agentPluginActivations.resolveAgentPluginActivation>>["verdict"]; warning: string },
  _optional: Record<string, never> = {},
) {
  return { installed: true, enabled: verdict === "undetermined" ? null : verdict === "active", alreadyInstalled: result.alreadyInstalled,
    plugin: { id: result.plugin.pluginId, ...(result.plugin.version ? { version: result.plugin.version } : {}), ...(result.upgradeFrom ? { upgradeFrom: result.upgradeFrom } : {}) },
    warning,
    note: result.alreadyInstalled ? "These exact bytes are already installed; activation was not changed." : "Installed OFF. Enable with plugins_set_enabled (family 'agent-plugin') if requested.",
  };
}

/** Bundled plugins are seeded into every workspace at boot, so this normally finds the plugin
 * installed and only reports its state. When it is missing (its boot seed failed), it re-runs that
 * same idempotent boot seeder rather than a second install path, so provenance, digests and default
 * activation stay the seeder's. An operator-installed namesake is never given bundled trust.
 * @throws {ToolInputError} Unknown id, a namesake from another source, or a failed seed.
 */
async function installBundledPlugin(
  { input, deps }: { input: Record<string, unknown>; deps: AgentPluginsInstallToolDeps },
  _optional: Record<string, never> = {},
) {
  const id = readBundledPluginId({ input });
  const sourceRoot = deps.bundledAgentPluginsSourceRoot ?? bundledAgentPluginsSourceRoot();
  const bundledIds = (await listBundledAgentPluginServers(sourceRoot)).map(plugin => plugin.pluginId).sort();
  if (!bundledIds.includes(id)) throw new ToolInputError({ message: `Unknown bundled plugin id '${id}'. Bundled ids: ${bundledIds.join(", ")}.` });
  const workspaceRoot = deps.agentPluginLayout.forWorkspace(deps.workspaceId).root;
  const existing = (await listInstalledPlugins(workspaceRoot)).some(plugin => plugin.pluginId === id);
  if (existing && !await agentPluginActivations.isAgentPluginRecordedAsBundled({ workspaceRoot, pluginId: id })) {
    throw new ToolInputError({ message: `Plugin id '${id}' is already installed from another source; bundled plugins cannot replace it.` });
  }
  if (!existing) {
    await seedMissingBundledPlugin({ deps, sourceRoot, id });
  }
  const { verdict } = await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId: id });
  return { installed: true, alreadyInstalled: existing, enabled: verdict === "undetermined" ? null : verdict === "active", plugin: { id },
    note: existing ? `Bundled plugin '${id}' is already installed; activation was not changed.`
      : verdict === "active" ? "Installed ON (seeded enabled by default)." : "Installed OFF. Enable with plugins_set_enabled (family 'agent-plugin') if requested.",
  };
}

export function contributeAgentPluginsInstallTools(
  required: { readInstallAttachment?: InstallAttachmentReader } = {},
  _optional: Record<string, never> = {},
): ToolContributor {
  return { domain: "agent-plugins-install", build: deps => buildRegistrations({ ...deps, ...required }), risk: derivedRisk };
}

function readBundledPluginId({ input }: { input: Record<string, unknown> }, _optional: Record<string, never> = {}): string {
  const source = input.source as Record<string, unknown>;
  const id = source.bundledId;
  if (typeof id !== "string" || Object.keys(source).some(key => key !== "kind" && key !== "bundledId")) {
    throw new ToolInputError({ message: "Bundled source requires only kind:'bundled' and a bundledId; no path or attachmentRef." });
  }
  if (input.replace === true) throw new ToolInputError({ message: "Bundled plugins cannot be replaced." });
  return id;
}

async function seedMissingBundledPlugin(
  { deps, sourceRoot, id }: { deps: AgentPluginsInstallToolDeps; sourceRoot: string; id: string },
  _optional: Record<string, never> = {},
) {
  const outcome = (await seedBundledAgentPlugins({ layout: deps.agentPluginLayout, workspaceId: deps.workspaceId, sourceRoot })).outcomes.find(plugin => plugin.pluginId === id);
  if (outcome?.status !== "seeded") throw new ToolInputError({ message: `Bundled plugin '${id}' could not be installed: ${outcome?.status === "failed" ? outcome.reason : "bundled package unavailable"}` });
}
