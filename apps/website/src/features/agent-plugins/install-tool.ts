import { createAgentPluginUpdateEffects, requireUpdateMcpDeps, type UpdateMcpDeps } from "./update-effects.js";
import { AgentPluginUpdateError, AgentPluginHostIncompatibleError, isAgentPluginName, type UpdateAgentPluginRequired } from "@jini-ai/agent-plugins/lifecycle";
import { toolMetadata } from '../../contracts/core/tool-metadata/agent-plugins.js';
import { createHash } from "node:crypto";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolRegistration, type ToolExecutionContext } from "@jini-ai/core";
import { FolderZipError } from "@jini-ai/agent-plugins/folder-zip";
import { zipLocalFolder } from "@jini-ai/agent-plugins/folder-zip/node";
import type { ToolContributor } from "@jini-ai/core";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { PLUGIN_INSTALL_SOURCE_SCHEMA, type InstallAttachmentReader, type PluginInstallSourcePort } from "../../contracts/headless/index.js";
import { AgentPluginInstallError, listInstalledPlugins, maxAgentPluginInstallArchiveBytes, seedBundledAgentPlugins } from "./lifecycle.js";
import { AgentPluginUploadError, UPLOADED_AGENT_PLUGIN_TRUST_WARNING, previewUploadedAgentPlugin, installUploadedAgentPlugin } from "./install-upload.js";
import type { AgentPluginLayout } from "./layout.js";
import { agentPluginActivations } from "./activation-effects.js";
import { bundledAgentPluginsSourceRoot, listBundledAgentPluginServers } from "./new-site-agent-plugin-tokens.js";

/** The assistant uses the same uploaded-package service as the Agent Plugins admin add tab.
 * No opt-in for this family: only bundled digests may run code. Preview verifies the full archive,
 * install verifies the pinned bytes again, and every fresh/replacement install remains disabled. */
export type AgentPluginsInstallToolDeps = {
  readonly pluginInstallSource: PluginInstallSourcePort;
  readonly snapshotAgentPluginSettings?: UpdateAgentPluginRequired["snapshotSettings"];
  readonly pluginHost?: import("../../contracts/headless/index.js").PluginHostPort;
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
    "replace:true replaces the same plugin ID's disabled operator-installed version, preserving memory; older versions are refused (no downgrades). " +
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
catalog.push({
  name: AGENT_PLUGINS_UPDATE_TOOL_ID,
  description: "Explicitly updates an operator-installed AGENT plugin to a newer package of the SAME plugin id. Source: kind:'zip' with attachmentRef (from chat_list_pending_attachments) or an absolute path, or kind:'folder' with a local absolute path. " +
    "expectedOldDigest is the installed archiveDigest from plugins_list (family 'agent-plugin'); if the plugin changed since, nothing happens. Keeps its enabled state and memory. " +
    "Refuses bundled plugins, downgrades and another plugin's package. Running chats keep the guidance they already loaded; MCP calls in progress may fail. A failed update restores the previous package, not state the new version wrote.",
  sideEffects: "mutates-durable-state", authorization: { permission: "admin.plugins.enable" },
  inputSchema: { type: "object", additionalProperties: false, required: ["source", "pluginId", "expectedOldDigest"], properties: {
    source: PLUGIN_INSTALL_SOURCE_SCHEMA,
    pluginId: { type: "string", minLength: 1, maxLength: 64, description: "The installed Agent Plugin id to update." },
    expectedOldDigest: { type: "string", pattern: "^[a-f0-9]{64}$", description: "The installed archiveDigest the update replaces." },
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
  if (operation === "update") return updateArchivePlugin({ deps, ctx, update: readUpdateTarget({ input }) });
  const source = input.source as Record<string, unknown> | undefined;
  if (source?.kind === "bundled") return installBundledPlugin({ input, deps });
  if (source && Object.hasOwn(source, "bundledId")) throw new ToolInputError({ message: "source.bundledId requires kind 'bundled' and cannot be combined with a path or attachmentRef." });
  return installArchivePlugin({ deps, ctx });
}

/** The update's target, checked before any file is read. @complexity O(1). */
function readUpdateTarget({ input }: { input: Record<string, unknown> }, _optional: Record<string, never> = {}) {
  const pluginId = requireString({ input, key: "pluginId" });
  // Jini's manifest grammar, checked before the id names anything on disk.
  if (!isAgentPluginName({ value: pluginId })) throw new ToolInputError({ message: "pluginId is not a valid Agent Plugin id." });
  const expectedOldDigest = requireString({ input, key: "expectedOldDigest" });
  if (!/^[a-f0-9]{64}$/.test(expectedOldDigest)) throw new ToolInputError({ message: "expectedOldDigest must be the installed archiveDigest (lowercase hex SHA-256)." });
  return { pluginId, expectedOldDigest };
}

/** The MCP effects an update re-provisions through. Missing deps are a host wiring fault, so this
 *  throws a plain error (redacted to the model), not a caller-input error. @complexity O(1). */
function updateMcpEffects({ deps, actor }: { deps: AgentPluginsInstallToolDeps; actor: string }, _optional = {}) {
  return createAgentPluginUpdateEffects({ actor, deps: requireUpdateMcpDeps({ deps }) });
}

/** The candidate's bytes from a folder, a local zip or a chat attachment, size-capped before reading. */
async function readToolArchive({ deps, ctx }: { deps: AgentPluginsInstallToolDeps; ctx: ToolExecutionContext }, _optional = {}) {
  const request = deps.pluginInstallSource.readRequest({ input: ctx.input });
  const archive = request.kind === "folder"
    ? await zipLocalFolder({ path: request.path!, maxBytes: maxAgentPluginInstallArchiveBytes() })
    : await deps.pluginInstallSource.readArchive({ request, ownerId: ctx.principal.id, runId: ctx.run.id, maxBytes: maxAgentPluginInstallArchiveBytes() }, { ...(deps.readInstallAttachment ? { readAttachment: deps.readInstallAttachment } : {}) });
  return { request, archive, expectedSha256: createHash("sha256").update(archive).digest("hex") };
}

/** Every named lifecycle refusal is a result the model can act on; anything else stays redacted. */
function toToolInputError(error: unknown): unknown {
  if (error instanceof FolderZipError) return new ToolInputError({ message: error.message });
  const named = error instanceof AgentPluginUpdateError || error instanceof AgentPluginHostIncompatibleError || error instanceof AgentPluginInstallError || error instanceof AgentPluginUploadError;
  return named ? new ToolInputError({ message: `${error.code}: ${error.message}` }) : error;
}

/** The same transaction as the admin Update button (`installUploadedAgentPlugin({ update })`). */
async function updateArchivePlugin(
  { deps, ctx, update }: { deps: AgentPluginsInstallToolDeps; ctx: ToolExecutionContext; update: { pluginId: string; expectedOldDigest: string } },
  _optional: Record<string, never> = {},
) {
  try {
    const { archive, expectedSha256 } = await readToolArchive({ deps, ctx });
    const result = await installUploadedAgentPlugin({ archive, expectedSha256, workspaceId: deps.workspaceId, actor: ctx.principal.id, update }, {
      layout: deps.agentPluginLayout, ...(deps.pluginHost ? { pluginHost: deps.pluginHost } : {}),
      ...(deps.snapshotAgentPluginSettings ? { snapshotSettings: deps.snapshotAgentPluginSettings } : {}),
      mcpProvisioning: updateMcpEffects({ deps, actor: ctx.principal.id }),
    });
    // No preview here: its replace checks refuse an enabled plugin, which an update keeps enabled.
    // The trust warning is the same static text install's preview carries, minus "stays OFF".
    // `enabled`/`warnings` are always present on the update path (`UpdatedUploadedAgentPlugin`: the
    // lifecycle owner's `updateAgentPlugin` result carries both), so no `null`/`[]` fallback is needed.
    return { updated: !result.alreadyInstalled, alreadyInstalled: result.alreadyInstalled, enabled: result.enabled, warnings: result.warnings,
      plugin: { id: result.plugin.pluginId, ...(result.plugin.version ? { version: result.plugin.version } : {}) },
      warning: UPLOADED_AGENT_PLUGIN_TRUST_WARNING,
      note: result.alreadyInstalled ? "These exact bytes are already installed; nothing changed."
        : "Updated. Memory is kept. Running chats keep the guidance they already loaded; MCP calls in progress may fail." };
  } catch (error) {
    throw toToolInputError(error);
  }
}

async function installArchivePlugin(
  { deps, ctx }: { deps: AgentPluginsInstallToolDeps; ctx: ToolExecutionContext },
  _optional: Record<string, never> = {},
) {
  try {
    const { request, archive, expectedSha256 } = await readToolArchive({ deps, ctx });
    const required = { archive, expectedSha256, workspaceId: deps.workspaceId, actor: ctx.principal.id, replace: request.replace };
    const optional = { layout: deps.agentPluginLayout, ...(deps.pluginHost ? { pluginHost: deps.pluginHost } : {}) };
    const preview = await previewUploadedAgentPlugin(required, optional);
    const result = await installUploadedAgentPlugin({ ...required, expectedSha256: preview.digest }, optional);
    // Identical bytes are a no-op, including activation. Do not falsely report OFF for a
    // package the operator already enabled; malformed activation remains explicitly unknown.
    const verdict = result.alreadyInstalled
      ? (await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot: deps.agentPluginLayout.forWorkspace(deps.workspaceId).root, pluginId: result.plugin.pluginId })).verdict
      : "inactive";
    return uploadedInstallResult({ result, verdict, warning: preview.warning });
  } catch (error) {
    throw toToolInputError(error);
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
  const installedNote = verdict === "active" ? "Installed ON (seeded enabled by default)." : "Installed OFF. Enable with plugins_set_enabled (family 'agent-plugin') if requested.";
  return { installed: true, alreadyInstalled: existing, enabled: verdict === "undetermined" ? null : verdict === "active", plugin: { id },
    note: existing ? `Bundled plugin '${id}' is already installed; activation was not changed.`
      : installedNote,
  };
}

export function contributeAgentPluginsInstallTools(
  required: Pick<AgentPluginsInstallToolDeps, "readInstallAttachment" | "pluginInstallSource">,
  _optional: Record<string, never> = {},
): ToolContributor<Omit<AgentPluginsInstallToolDeps, "pluginInstallSource">, unknown> {
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
