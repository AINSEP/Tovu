/** Tovu catalogs, cards and host effects bind the portable @jini-ai/plugins/host/tools lifecycle. */
import { pluginManagementToolIds } from './plugin-tool-ids.js';
import type { Tracker } from '@jini-ai/diagnostics/observability';
import type { PluginExportCatalogPort } from '../../contracts/headless/plugin-export-catalog.js';
import type { OperatorLocaleDeps, PluginHostPort, AgentPluginLayout, AgentPluginUninstallToolDeps, SetAgentPluginEnabledInput } from '../../contracts/headless/index.js';
import type { Clock } from '@jini-ai/core/primitives';
import type { OutboxPort } from '@jini-ai/cms/core';
import type { AuthorizeFn, ChangeSetRepoPort } from '../../contracts/core/commands/index.js';
import type { RememberedApprovalPort, ToolContributor, ToolRegistration } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { PluginActivationRepoPort, PluginConflict, RemovePluginFn } from '@jini-ai/plugins/host';
import type { PluginDiscoveryRecord, PluginInstallerPort } from '@jini-ai/plugins/host/node';
import type { InstalledAgentPlugin, SetAgentPluginEnabledResult } from '@jini-ai/agent-plugins/lifecycle';
import type { PluginProviderFacesPort } from './service-ports.js';
import { buildPluginManagementRegistrations, pluginManagementDerivedRiskFor, pluginApprovalIdentity as portableApprovalIdentity } from '@jini-ai/plugins/host/tools';
import { bindPluginApprovalIdentity, bindPluginManagementTools } from './host-tool-binding.js';
import type { PluginFamily } from './agent-tools.js';
export { describeEnableApproval, type EnableConfirmationSubject } from './enable-confirmation-ui.js';


/** Host dependency slice kept structural so tool wiring does not import the server RouteDeps composition root. */
export interface PluginsToolDeps extends OperatorLocaleDeps {
  readonly tracker?: Tracker;
  readonly pluginExports?: PluginExportCatalogPort;
  readonly providerFaces: PluginProviderFacesPort;
  readonly notifyRosterChanged: import("../../contracts/core/tool-access-change.js").NotifyToolAccessChanged;
  readonly pluginSource?: import('@jini-ai/plugins/host/node').PluginSourcePort;
  readonly pluginSourcePolicy?: import('@jini-ai/plugins/host').PluginSourcePolicyPort;
  readonly pluginHost?: PluginHostPort;
  readonly agentPluginLayout: AgentPluginLayout;
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: Clock;
  idGen: { newId(): string };
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  pluginActivationRepo: PluginActivationRepoPort;
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  /** Uses the existing activation owner; injection lets callers model lock failures without module replacement. */
  assertAgentPluginActivationsWritable?: (required: { workspaceRoot: string }) => Promise<void>;
  /** Bind the same lifecycle owner with host effects; no module replacement is needed for failures. */
  setAgentPluginEnabled?: (required: SetAgentPluginEnabledInput) => Promise<SetAgentPluginEnabledResult>;
  listInstalledAgentPlugins?: (workspaceRoot: string) => Promise<readonly InstalledAgentPlugin[]>;
  /** Bound to the existing remembered-approval store; only enable escalations get reusable keys. */
  nativeApprovalMemory?: RememberedApprovalPort;
  uninstallAgentPlugin?: AgentPluginUninstallToolDeps["uninstallAgentPlugin"];
  onPluginEnabled: (pluginId: string) => Promise<void>;
  onPluginDisabled: (pluginId: string) => void;
  /** 2026-10-04 — see `routes/types.ts`'s `PluginRuntimeDeps.listPluginConflicts`. */
  listPluginConflicts?: () => Promise<ReadonlyMap<string, readonly PluginConflict[]>>;
  removePlugin: RemovePluginFn;
  /** The admin Install Plugin routes' installer; absent when the site has no plugin install dir.
   *  Read by `install-tool.ts`'s `plugins_install`, not by this file's tools. */
  pluginInstaller?: PluginInstallerPort;
}
export const pluginsDerivedRisk = pluginManagementDerivedRiskFor({ toolIds: pluginManagementToolIds });
export function buildPluginsRegistrations(routeDeps: PluginsToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return buildPluginManagementRegistrations(bindPluginManagementTools({ deps: routeDeps, surfaces }));
}
export function pluginApprovalIdentity(required: { deps: PluginsToolDeps; request: { family: PluginFamily; pluginId: string } }, _optional = {}) {
  return portableApprovalIdentity({ deps: bindPluginApprovalIdentity({ deps: required.deps }), request: required.request });
}


/** Contributes through the manifest so importing this host binding does not register tools as a side effect. */
export function contributePluginsTools(
  required: { createPluginHost?: (required: { deps: PluginsToolDeps }) => PluginHostPort } = {},
  _optional: Record<string, never> = {},
): ToolContributor<PluginsToolDeps, AssistantSurfaceDeps> {
  return { domain: "plugins", build: (deps, surfaces) => buildPluginsRegistrations({
    ...deps, pluginHost: deps.pluginHost ?? required.createPluginHost?.({ deps }),
  }, surfaces), risk: pluginsDerivedRisk };
}
