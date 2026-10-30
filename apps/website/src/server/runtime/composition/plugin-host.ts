/** The host is the only cross-family composition point. Bind the existing lifecycle owners;
 * discovery is metadata-only and fresh on each call so disable/uninstall cannot leave stale grants. */
import path from 'node:path';
import { redactSecrets } from '@jini-ai/core';
import { withFileLock } from '@jini-ai/platform/fs/file-lock';
import { createPluginLookup, readPluginIdentity, assertPluginIdentityAvailable, type PluginProvider } from '@jini-ai/core/plugin-directory';
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
import type { Clock } from '@jini-ai/core/primitives';
import type { ExternalMcpStoreDeps } from '#src/assistant/index';

export interface TovuPluginHostDeps extends AgentPluginUninstallToolDeps {
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  readonly pluginActivationRepo: PluginActivationRepoPort;
  readonly clock: Clock;
  readonly externalMcpServerRepo: ExternalMcpStoreDeps['repo'];
  readonly siteAssistantSecretSealer: ExternalMcpStoreDeps['sealer'];
  readonly siteAssistantSecretKeyring: ExternalMcpStoreDeps['keyring'];
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

  const listSiteProviders = async ({ forAdmission }: { forAdmission: boolean }, _options = {}): Promise<PluginProvider[]> => {
    const providers: PluginProvider[] = [];
    for (const record of await deps.discoverPlugins()) {
      if (record.status !== 'valid' || !record.manifest) {
        warn(`Plugin '${record.id}': invalid installed manifest omitted from metadata lookup.`);
        continue;
      }
      let parsed: ReturnType<typeof readPluginIdentity> | undefined;
      try { parsed = readPluginIdentity({ manifest: record.manifest as unknown as Readonly<Record<string, unknown>>, name: record.id, namespace: 'tovu' }); }
      catch { warn(`Plugin '${record.id}': installed identity manifest is unreadable or invalid; omitted from metadata lookup.`); }
      if (parsed) {
        const { warnings, ...identity } = parsed;
        warnings.forEach(warn);
        const activation = forAdmission ? null : await deps.pluginActivationRepo.getActivation({ workspaceId: deps.workspaceId, pluginId: record.id });
        providers.push({ ...identity, version: record.version, enabled: activation?.enabled === true, family: 'site-runtime', localId: record.id });
      }
    }
    return providers;
  };

  const resolveAgentProviders = async ({ agentProviders, workspaceRoot }: {
    agentProviders: Map<string, PluginProvider[]>; workspaceRoot: string;
  }, _options = {}): Promise<PluginProvider[]> => {
    const providers: PluginProvider[] = [];
    for (const [pluginId, revisions] of agentProviders) {
      // Multiple digests are revisions of one install, not duplicate provider registrations.
      // Without a recorded winner the existing lifecycle refuses to guess; discovery follows it
      // by omitting this plugin, while unrelated lookup and installation remain available.
      if (revisions.length !== 1) {
        const declaredIds = new Set(revisions.map(provider => provider.id).filter(id => id !== `unknown/${pluginId}`));
        warn(`Plugin '${pluginId}': ${declaredIds.size > 1 ? 'conflicting publisher identities' : 'ambiguous installed revisions'}; omitted from metadata lookup.`);
        continue;
      }
      let enabled: boolean;
      if (optional.resolveEnabled) enabled = await optional.resolveEnabled({ workspaceRoot, pluginId });
      else {
        const activation = await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId });
        enabled = activation.verdict === 'active';
      }
      providers.push({ ...revisions[0]!, enabled });
    }
    return providers;
  };

  const listAgentProviders = async ({ workspaceRoot, forAdmission }: {
    workspaceRoot: string; forAdmission: boolean;
  }, _options = {}): Promise<PluginProvider[]> => {
    const providers: PluginProvider[] = [];
    const agentProviders = new Map<string, PluginProvider[]>();
    // A legacy revision may acquire its first publisher identity at upgrade; old frozen
    // digests can remain present from older installs until successful publication prunes them.
    // Reuse that owner's selection; metadata lookup must not invent a newest-version policy.
    const installed = await listInstalled();
    const preferred = forAdmission ? installed : preferBundledAgentPluginDigests(installed, await readBundledAgentPluginDigests(workspaceRoot));
    const preferredKeys = new Set(preferred.map(plugin => `${plugin.pluginId}:${plugin.archiveDigest}`));
    for (const plugin of installed) {
      let parsed: ReturnType<typeof readPluginIdentity>;
      try { parsed = await readAgentIdentity({ plugin }); }
      catch { warn(`Plugin '${plugin.pluginId}': installed identity manifest is unreadable or invalid; omitted from metadata lookup.`); continue; }
      const { warnings, ...identity } = parsed;
      warnings.forEach(warn);
      const provider: PluginProvider = { ...identity, version: plugin.version ?? null, enabled: false, family: 'agent-plugin', localId: plugin.pluginId };
      if (forAdmission) providers.push(provider);
      else {
        if (preferredKeys.has(`${plugin.pluginId}:${plugin.archiveDigest}`)) {
          const revisions = agentProviders.get(plugin.pluginId) ?? [];
          revisions.push(provider);
          agentProviders.set(plugin.pluginId, revisions);
        }
      }
    }
    return providers.concat(await resolveAgentProviders({ agentProviders, workspaceRoot }));
  };

  const listProviders = async ({ forAdmission = false }: { forAdmission?: boolean } = {}, _options = {}) => {
    const workspaceRoot = resolveWorkspaceRoot();
    const providers = await listSiteProviders({ forAdmission });
    return providers.concat(await listAgentProviders({ workspaceRoot, forAdmission }));
  };
  const lookup = createPluginLookup({ listPlugins: listProviders }, { warn });

  const agentPlugins: AgentPluginHostCapability = {
    listInstalled,
    assertWritable: async () => (deps.assertAgentPluginActivationsWritable ?? agentPluginActivations.assertAgentPluginActivationsWritable)({ workspaceRoot: resolveWorkspaceRoot() }),
    setEnabled: async (input: Parameters<AgentPluginHostCapability["setEnabled"]>[0]) => (deps.setAgentPluginEnabled ?? setAgentPluginEnabled)({ ...input, agentPluginLayout: deps.agentPluginLayout }),
    /** Provisioning must use the same two owners as the admin toggle. A failed connection never
     * rolls back a successful activation; report fixed diagnostics without credential material. */
    provisionMcp: async ({ pluginId, principalId }: { pluginId: string; principalId: string }) => {
      try {
        const servers = await (optional.resolveMcpServers ?? resolveAgentPluginMcpServers)({ agentPluginLayout: deps.agentPluginLayout, workspaceId: deps.workspaceId, pluginId });
        const result = await (optional.provisionMcpServers ?? provisionAgentPluginMcpServers)({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock }, { workspaceId: deps.workspaceId, pluginId, servers, principalId });
        for (const failure of result.failed) {
          warn(redactSecrets({ input: `Plugin '${pluginId}': MCP provisioning for server '${failure.serverKey}' failed — ${failure.reason}` }));
        }
      } catch (error) {
        warn(redactSecrets({ input: `Plugin '${pluginId}': MCP provisioning could not run — ${error instanceof Error ? error.message : String(error)}` }));
      }
    },
    uninstall: async (input: Parameters<AgentPluginHostCapability["uninstall"]>[0]) => runAgentPluginUninstall(deps, input.surfaces, input.ctx, input.pluginId, input.executionOptions),
  };
  return {
    ...lookup,
    withInstallIdentity: ({ candidate, run }) => withFileLock({
      lockPath: path.join(deps.agentPluginLayout.root, '.publisher-identity.lock'),
      run: async () => { assertPluginIdentityAvailable({ candidate, installed: await listProviders({ forAdmission: true }) }); return run(); },
    }, { createParent: true }),
    getHostCapability: ({ capability }) => capability === 'agent-plugin-lifecycle' ? agentPlugins : undefined };
}
