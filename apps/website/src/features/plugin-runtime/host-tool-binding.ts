import { pluginManagementToolIds, pluginSourceToolIds } from './plugin-tool-ids.js';
/** Host catalogs, canonical command/fingerprint owners, approval transport and telemetry. */
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { approvalToolHandler, notConfirmedResult, type HumanConfirmSpec } from '../../contracts/core/human-confirm.js';
import { federatedToolApprovalFingerprint } from '@jini-ai/mcp/federation';
import { executeCommand } from '../../contracts/core/commands/index.js';
import { ToolAccessLoweringError } from '../../contracts/core/tool-access-change.js';
import { toolMetadata } from '../../contracts/core/tool-metadata/plugin-runtime.js';
import { pluginAgentToolCatalog, PLUGINS_SET_ENABLED_TOOL_ID } from './agent-tools.js';
import { describeUninstallApproval } from './uninstall-confirmation-ui.js';
import { describeEnableApproval } from './enable-confirmation-ui.js';
import { pluginSourceAgentToolCatalog } from './source-tool-catalog.js';
import { pluginToolMessages } from './plugin-tool-messages.js';
import { lowerPluginToolAccess } from './lower-tool-access.js';
import { bindAgentPluginIdentity, bindAgentPluginTools } from './agent-plugin-tool-binding.js';
import type { PluginsToolDeps } from './tool-registrations.js';
import type { PluginApprovalPort, PluginManagementToolsRequired, PluginSourceToolsRequired } from '@jini-ai/plugins/host/tools';
function approvals(surfaces: AssistantSurfaceDeps): PluginApprovalPort<HumanConfirmSpec> {
  return { handler: (steps, options) => approvalToolHandler({ surfaces, ...steps }, options), notConfirmed: notConfirmedResult };
}
type SetEnabledPrepared = { request?: { family?: string; pluginId?: string; enabled?: boolean }; refusal?: { reason?: string } };

/** A "Soon" Agent Plugin is locked off (`agent-plugins/soon-lock.ts`, owner 2026-11-10). Jini's
 *  `plugins_set_enabled` has no not-ready pre-flight, so this wraps its prepare step: after Jini's own
 *  parse, authorize and pre-flight, an Agent Plugin enable that is unrefused (or refused only as a
 *  linked face) becomes a not-ready refusal, so the dialog is skipped and nothing is written. A
 *  write-time Soon error is not classified: this pre-flight leaves it to a race only.
 *  @complexity As `describeNotReady`: one listing plus one manifest read per installed revision. */
function refuseNotReadyBeforeConfirm(port: PluginApprovalPort<HumanConfirmSpec>, { providerFaces }: Pick<PluginsToolDeps, 'providerFaces'>): PluginApprovalPort<HumanConfirmSpec> {
  return { ...port, handler: (steps, options) => port.handler({ ...steps, prepare: async (required, prepareOptions) => {
    const prepared = await steps.prepare(required, prepareOptions);
    const { request, refusal } = (prepared as unknown as SetEnabledPrepared | undefined) ?? {};
    if (request?.family !== 'agent-plugin' || request.enabled !== true || request.pluginId === undefined) return prepared;
    if (refusal !== undefined && refusal.reason !== 'linked') return prepared;
    const notReady = await providerFaces.describeNotReady?.({ pluginId: request.pluginId });
    if (notReady === undefined) return prepared;
    return { ...prepared, refusal: { changed: false, cancelled: false, family: request.family, pluginId: request.pluginId, restartRequired: false,
      reason: 'not-ready', code: notReady.code,
      note: `Nothing changed. ${notReady.message} Don't offer another way to turn it on or use it; you may say it's coming soon.` } };
  } }, options) };
}

export function bindPluginManagementTools({ deps, surfaces }: { deps: PluginsToolDeps; surfaces: AssistantSurfaceDeps }): PluginManagementToolsRequired<HumanConfirmSpec> {
  return {
    ...bindPluginApprovalIdentity({ deps }),
    registration: { domain: 'plugins', catalogModule: 'features/plugin-runtime/agent-tools.ts', catalog: pluginAgentToolCatalog, metadata: toolMetadata },
    workspaceId: deps.workspaceId, get authorize() { return deps.authorize; }, clock: deps.clock,
    permissions: { read: 'admin.plugins.read', enable: 'admin.plugins.enable' }, toolIds: pluginManagementToolIds,
    entityTypes: { plugin: 'plugin', agentPlugin: 'agent-plugin', activation: 'plugin-activation' }, actorPluginId: 'assistant',
    pluginActivationRepo: deps.pluginActivationRepo, listPluginConflicts: deps.listPluginConflicts,
    removePlugin: deps.removePlugin, pluginSource: deps.pluginSource, onPluginEnabled: deps.onPluginEnabled, onPluginDisabled: deps.onPluginDisabled,
    agentPlugins: bindAgentPluginTools({ deps, surfaces }), pluginExports: deps.pluginExports, providerFaces: deps.providerFaces,
    lowerToolAccess: input => lowerPluginToolAccess({ ...input, providerFaces: deps.providerFaces, notifyRosterChanged: deps.notifyRosterChanged }, {}),
    extraModelFacingErrors: [{ error: ToolAccessLoweringError, code: 'TOOL_ACCESS_STOP_FAILED', guidance: 'The OFF decision was saved. Report that stopping affected answers failed; do not claim cleanup succeeded.' }],
    executeCommand: input => executeCommand({ ...input, deps: { clock: deps.clock, idGen: deps.idGen, changeSets: deps.changeSets, outbox: deps.outbox, authorize: deps.authorize } }),
    approvals: refuseNotReadyBeforeConfirm(approvals(surfaces), deps), descriptions: { enable: describeEnableApproval, uninstall: describeUninstallApproval }, messages: pluginToolMessages,
    telemetry: { toggled: ({ principalId, pluginId, enabled }) => deps.tracker?.capture({ name: 'plugin_toggled', userId: principalId }, { properties: { pluginId, pluginKind: 'cms', enabled, source: 'assistant' } }) },
  };
}
export function bindPluginSourceTools({ deps, surfaces }: { deps: Pick<PluginsToolDeps, 'workspaceId' | 'authorize' | 'pluginSource'>; surfaces: AssistantSurfaceDeps }): PluginSourceToolsRequired<HumanConfirmSpec> {
  return { registration: { domain: 'plugin-source', catalogModule: 'features/plugin-runtime/source-tools.ts', catalog: pluginSourceAgentToolCatalog, metadata: toolMetadata },
    workspaceId: deps.workspaceId, get authorize() { return deps.authorize; }, toolIds: pluginSourceToolIds, enablePermission: 'admin.plugins.enable', entityType: 'plugin', pluginSource: deps.pluginSource,
    approvals: approvals(surfaces), describeDelete: ({ target }) => ({ toolId: 'plugin_source_delete', errorCode: 'PLUGIN_SOURCE_DELETE_CONFIRM', title: 'Permanently delete this draft file?', danger: true,
      details: [{ label: 'Plugin', value: target.id }, { label: 'Draft file', value: target.path }], confirmLabel: 'Delete', cancelLabel: 'Cancel' }) };
}

/** Bind only the identity reads needed by the compatibility helper; no confirmation transport. */
export function bindPluginApprovalIdentity({ deps }: { deps: PluginsToolDeps }, _optional: Record<string, never> = {}): Pick<PluginManagementToolsRequired<HumanConfirmSpec>, 'discoverPlugins' | 'approvalFingerprint'> & { agentPlugins: ReturnType<typeof bindAgentPluginIdentity> } {
  return {
    discoverPlugins: deps.discoverPlugins,
    agentPlugins: bindAgentPluginIdentity({ deps }),
    approvalFingerprint: ({ family, pluginId, revision, schema }) => federatedToolApprovalFingerprint({ fingerprintDomain: 'tovu.native-escalation.v1',
      identity: { connectionId: JSON.stringify([deps.workspaceId, family, pluginId]), remoteName: PLUGINS_SET_ENABLED_TOOL_ID,
        origin: { kind: 'roster', admissionRevision: revision }, declaredAnnotations: undefined, description: 'Enable this plugin identity', inputSchema: schema } }),
  };
}
