import type { Clock } from "@jini-ai/core/primitives";
/** The host is the only cross-family composition point. Bind the existing lifecycle owners;
 * discovery is metadata-only and fresh on each call so disable/uninstall cannot leave stale grants. */
import path from 'node:path';
import { withFileLock } from '@jini-ai/platform/fs/file-lock';
import { readPluginIdentity } from '@jini-ai/core/plugin-directory';
import type { InstalledAgentPlugin } from '@jini-ai/agent-plugins/lifecycle';
import type { PluginActivationRepoPort } from '@jini-ai/plugins/host';
import type { PluginDiscoveryRecord } from '@jini-ai/plugins/host/node';
import type { AgentPluginHostCapability, PluginHostPort } from '#src/contracts/headless/index';
import { listInstalledPlugins, preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from '#src/features/agent-plugins/lifecycle';
import { readInstalledAgentPluginIdentity } from '#src/features/agent-plugins/identity';
import { agentPluginActivations } from '#src/features/agent-plugins/activation-effects';
import { setAgentPluginEnabled } from '#src/features/agent-plugins/set-enabled';
import { runAgentPluginUninstall, type AgentPluginUninstallToolDeps } from '#src/features/agent-plugins/uninstall-tool';
import { provisionAgentPluginMcpServers, resolveAgentPluginMcpServers } from '#src/features/agent-plugins/federate-mcp';
import { grantDeclaredToolsToSignedInRows } from '#src/features/agent-plugins/grant-signed-in-defaults';
import { agentPluginMcpPortsOf, withAgentPluginMcpPorts } from '#src/features/agent-plugins/mcp-host-bindings';
import { createPluginHost, type PluginHostMessages } from './portable-plugin-host.js';

/** Tovu's product copy for the portable host: these texts name Tovu's enable tool. Bytes unchanged. */
const tovuPluginHostMessages: PluginHostMessages = {
  provisioningFailed: ({ pluginId, failed }) => `Plugin '${pluginId}' could not create these connections: ${failed.map(failure => `${failure.serverKey}: ${failure.reason}`).join('; ')}. Request plugins_set_enabled again to retry.`,
  approvedSnapshotMissing: () => 'The approved access snapshot is missing. Request plugins_set_enabled again. Nothing was provisioned or granted.',
  approvedLoadFailed: ({ detail }) => `The plugin is on, but its approved connections could not be loaded. Request plugins_set_enabled again to retry. Details: ${detail}`,
};

export interface TovuPluginHostDeps extends AgentPluginUninstallToolDeps {
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  readonly pluginActivationRepo: PluginActivationRepoPort;
  readonly clock: Clock;
  readonly mcp: import("#src/features/agent-plugins/service-ports").AgentPluginMcpPort & import("#src/features/agent-plugins/service-ports").AgentPluginMcpContext;
  readonly listInstalledAgentPlugins?: typeof listInstalledPlugins;
  readonly setAgentPluginEnabled?: typeof setAgentPluginEnabled;
  readonly assertAgentPluginActivationsWritable?: typeof agentPluginActivations.assertAgentPluginActivationsWritable;
}

/** Bind both plugin families to one workspace. Read manifests through the same installed-package
 * index; the extra manifest read bridges existing compiled lifecycle versions until Jini builds.
 * @throws Unreadable activation (fail closed).
 * Unreadable/invalid or ambiguous manifest metadata is omitted with a warning. Admission retains
 * every valid revision identity, including revisions omitted from lookup, to prevent takeovers.
 * @complexity O(p log p) per lookup, plus existing discovery/activation I/O for p installs.
 */
export function createTovuPluginHost(
  { deps }: { deps: TovuPluginHostDeps },
  optional: {
    readAgentManifest?: (required: { plugin: InstalledAgentPlugin }, optional?: Record<string, never>) => Promise<Readonly<Record<string, unknown>>>;
    resolveEnabled?: (required: { workspaceRoot: string; pluginId: string }, optional?: Record<string, never>) => Promise<boolean>;
    warn?: (message: string) => void;
    resolveMcpServers?: typeof resolveAgentPluginMcpServers;
    provisionMcpServers?: typeof provisionAgentPluginMcpServers;
  } = {},
): PluginHostPort {
  const resolveWorkspaceRoot = () => deps.agentPluginLayout.forWorkspace(deps.workspaceId).root;
  const listInstalled = async () => (deps.listInstalledAgentPlugins ?? listInstalledPlugins)(resolveWorkspaceRoot());
  const warn = optional.warn ?? ((message: string) => console.warn(`[plugins] ${message}`));
  const readAgentIdentity = optional.readAgentManifest
    ? async ({ plugin }: { plugin: InstalledAgentPlugin }) => readPluginIdentity({ manifest: await optional.readAgentManifest!({ plugin }), name: plugin.pluginId, namespace: 'tovu' })
    : readInstalledAgentPluginIdentity;

  // Thin Tovu binder: every runtime owner, path, namespace and product text is bound here; the
  // decisions live in `portable-plugin-host.ts`. The projection pair is resolved once per binding:
  // preview, provisioning grant and status share it (legacy no-ports fallback stays Tovu-only).
  return createPluginHost<Parameters<AgentPluginHostCapability['uninstall']>[0]>({ deps: {
    workspaceId: deps.workspaceId, agentPluginLayout: deps.agentPluginLayout, clock: deps.clock, namespace: 'tovu',
    discoverPlugins: deps.discoverPlugins,
    getActivation: input => deps.pluginActivationRepo.getActivation(input),
    lifecycle: {
      listInstalled,
      preferInstalled: async ({ installed }) => preferBundledAgentPluginDigests([...installed], await readBundledAgentPluginDigests(resolveWorkspaceRoot())),
      readIdentity: readAgentIdentity,
      isEnabled: async ({ pluginId }) => {
        const workspaceRoot = resolveWorkspaceRoot();
        if (optional.resolveEnabled) return optional.resolveEnabled({ workspaceRoot, pluginId });
        return (await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId })).verdict === 'active';
      },
      inactivePluginIds: async () => {
        const activations = await agentPluginActivations.readAgentPluginActivations({ workspaceRoot: resolveWorkspaceRoot() });
        return new Set(Object.entries(activations.plugins).filter(([, activation]) => !activation.enabled).map(([id]) => id));
      },
      assertWritable: async () => (deps.assertAgentPluginActivationsWritable ?? agentPluginActivations.assertAgentPluginActivationsWritable)({ workspaceRoot: resolveWorkspaceRoot() }),
      setEnabled: async input => {
        const result = await (deps.setAgentPluginEnabled ?? (input => setAgentPluginEnabled(input, { notifyRosterChanged: options => deps.mcp.notifyRosterChanged(options ?? {}) })))({ ...input, agentPluginLayout: deps.agentPluginLayout });
        if (!result.enabled && deps.setAgentPluginEnabled) await deps.mcp.notifyRosterChanged({ lowered: { pluginIds: [input.pluginId] } }, {});
        return result;
      },
      uninstall: input => runAgentPluginUninstall({ routeDeps: deps, surfaces: input.surfaces, ctx: input.ctx, pluginId: input.pluginId }, input.executionOptions),
    },
    withLock: ({ run }) => withFileLock({ lockPath: path.join(deps.agentPluginLayout.root, '.publisher-identity.lock'), run }, { createParent: true }),
    // Production ports already carry their pair (same instance passes through); only a legacy port
    // without projections gets Tovu's canonical pair here, never inside the portable bodies.
    mcp: withAgentPluginMcpPorts(deps.mcp), mcpPorts: agentPluginMcpPortsOf(deps.mcp),
    grantSignedInDefaults: grantDeclaredToolsToSignedInRows,
    warn, messages: tovuPluginHostMessages,
  } }, {
    ...(optional.resolveMcpServers ? { resolveMcpServers: optional.resolveMcpServers } : {}),
    ...(optional.provisionMcpServers ? { provisionMcpServers: optional.provisionMcpServers } : {}),
  });
}
