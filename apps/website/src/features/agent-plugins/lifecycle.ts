/** Tovu host binding for the single Jini lifecycle owner. Only ABI translation and product policy
 * live here; extraction, containment, trust, digest selection, activation and rollback stay in Jini.
 */
import path from "node:path";
import {
  createAgentPluginLifecycle,
  type AgentPluginLifecycleOptional,
  type AgentPluginArchiveEntry as JiniArchiveEntry,
  type AgentPluginArchiveReaderPort as JiniArchiveReader,
  type AgentPluginLayoutPort,
  type InstallAgentPluginRequired as JiniInstallRequired,
  type UninstallAgentPluginRequired as JiniUninstallRequired,
  type SeedBundledAgentPluginsRequired as JiniSeedRequired,
  type RetireBundledAgentPluginsRequired as JiniRetireRequired,
  type TrustedPluginPackagesQuery as JiniTrustedQuery,
  type TrustedPluginPackage,
  type AgentPluginDeliveryMode,
  type PluginContributionDefinition,
  type LoadPluginContributionsOptional,
  type FilesystemPort,
} from "@jini-ai/agent-plugins/lifecycle";
import { createNodeAgentPluginEffects } from "@jini-ai/agent-plugins/lifecycle/node";
import type { AgentPluginLayout, AgentPluginWorkspaceLayout } from "./layout.js";
import { migrateSiteAgentPluginLayouts } from "./memory.js";
import { carryDeployDisabled, carryCloudflareActivation } from "./deploy-split-activation.js";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, RETIRED_BUNDLED_AGENT_PLUGINS, formatPluginToolPointer } from "./bundled-catalog.js";
import {
  readSupersessions, supersededDescriptorRefusal, supersededPackageRefusal, createBundledSourceManifestReader,
  defaultBundledSourceRoot, type SupersessionManifestsPort,
} from "./supersession.js";

export {
  AgentPluginInstallError, AgentPluginNotFoundError, AgentPluginNotUninstallableError,
  AgentPluginChangedSincePreviewError, PackagePathViolation, BUNDLED_DIGESTS_FILENAME,
  defineExecutablePluginContribution, defineProviderContribution, contributeProviders,
} from "@jini-ai/agent-plugins/lifecycle";
export type {
  AgentPluginInstallErrorCode, InstalledAgentPluginSkill, InstalledAgentPlugin,
  InstallAgentPluginOptional, UninstallAgentPluginOptional, UninstallAgentPluginResult,
  AgentPluginUninstallPreview, StagedTree, SeededAgentPluginOutcome, SeedBundledAgentPluginsResult,
  RetiredAgentPluginOutcome, RetiredAgentPluginSuccessorOutcome, RetireBundledAgentPluginsOptional,
  BundledAgentPluginDigests, SeededBundledAgentPluginDigest, InstalledDigestIdentity,
  PackedAgentPluginArchive, AgentPluginSearchSkill, AgentPluginSearchCandidate, AgentPluginSearchMatch,
  TrustedPluginPackage, TrustedPluginVerdict, AgentPluginDeliveryMode, ResolveAgentPluginRefsResult,
  PluginContributionDefinition,
} from "@jini-ai/agent-plugins/lifecycle";
export { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, RETIRED_BUNDLED_AGENT_PLUGINS } from "./bundled-catalog.js";

/** Compatibility with the host's positional archive ABI; the owner receives object arguments. */
export type AgentPluginArchiveEntry = Exclude<JiniArchiveEntry, { readonly kind: "file" }> |
  (Omit<Extract<JiniArchiveEntry, { readonly kind: "file" }>, "openReadStream"> & { readonly openReadStream: () => AsyncIterable<Uint8Array> });
/** Entries remain a pure function of archive bytes: metadata and extraction iterate twice. */
export interface AgentPluginArchiveReaderPort {
  entries(archive: Uint8Array): AsyncIterable<AgentPluginArchiveEntry>;
}
export type InstallAgentPluginRequired = Omit<JiniInstallRequired, "layout" | "archiveReader"> & { readonly layout: AgentPluginLayout; readonly archiveReader: AgentPluginArchiveReaderPort };
export type UninstallAgentPluginRequired = Omit<JiniUninstallRequired, "layout"> & { readonly layout: AgentPluginLayout };
export type SeedBundledAgentPluginsRequired = Omit<JiniSeedRequired, "layout"> & { readonly layout: AgentPluginLayout };
export type RetireBundledAgentPluginsRequired = Omit<JiniRetireRequired, "layout"> & { readonly layout: AgentPluginLayout };
export type TrustedPluginPackagesQuery = Omit<JiniTrustedQuery, "onInactive"> & { readonly onInactive?: (plugin: TrustedPluginPackage) => Promise<void> };

/** Preserve the host's validated workspace layout and convert only its method call shapes. */
function ownerLayout(layout: AgentPluginLayout): AgentPluginLayoutPort {
  return { root: layout.root, forWorkspace: ({ workspaceId }) => {
    const workspace = layout.forWorkspace(workspaceId);
    return { ...workspace, pluginDataDir: ({ pluginId }) => workspace.pluginDataDir(pluginId) };
  } };
}
function hostLayout(layout: AgentPluginLayoutPort): AgentPluginLayout {
  return { root: layout.root, workspacesDir: path.join(layout.root, "ws"), forWorkspace: workspaceId => {
    const workspace = layout.forWorkspace({ workspaceId });
    return { ...workspace, pluginDataDir: pluginId => workspace.pluginDataDir({ pluginId }) };
  } };
}
function ownerReader(reader: AgentPluginArchiveReaderPort): JiniArchiveReader {
  return { async *entries({ archive }) {
    for await (const entry of reader.entries(archive)) {
      yield entry.kind === "file" ? { ...entry, openReadStream: (_input = {}) => entry.openReadStream() } : entry;
    }
  } };
}

/** Reads the delivery mode for this process. An unset or unrecognised value is inject — an A/B
 * affordance must never change production behaviour by typo. */
export function resolveAgentPluginDeliveryMode(env: { readonly TOVU_AGENT_PLUGIN_DELIVERY?: string | undefined } = process.env): AgentPluginDeliveryMode {
  return env.TOVU_AGENT_PLUGIN_DELIVERY === "pointer" ? "pointer" : "inject";
}

/** Bind once per host; DI permits real-filesystem failure tests without replacing modules.
 * Network installation and MCP provisioning have separate host owners and are not used by this
 * binding. Refuse those unbound capabilities rather than bypassing their guards.
 * @complexity O(1) composition. All operations delegate to the lifecycle owner. */
export function createTovuAgentPluginLifecycle(required: { layout: AgentPluginLayout }, optional: { readonly filesystem?: FilesystemPort; readonly identityAdmission?: AgentPluginLifecycleOptional["identityAdmission"]; readonly mcpProvisioning?: import("@jini-ai/agent-plugins/lifecycle").AgentPluginMcpProvisioningPort; readonly supersessionManifests?: SupersessionManifestsPort } = {}) {
  const unbound = async (): Promise<never> => { throw new Error("This lifecycle binding does not provide network installation or MCP provisioning"); };
  const policy: AgentPluginLifecycleOptional = {
    ...(optional.identityAdmission ? { identityAdmission: optional.identityAdmission } : {}),
    onEvent: ({ event, message }) => console.warn(event.startsWith("migration") ? `[agent-plugins:${event}] ${message}` : message),
    // Layout first, then the deploy split's carry of an operator's "Deploy Online off" — before the
    // seeder switches the new host plugins on (`deploy-split-activation.ts`). `owner` is bound below;
    // this runs only at seed time, after it exists.
    migrateBeforeSeed: async ({ layout, workspaceId }) => {
      const migration = await migrateSiteAgentPluginLayouts({ layout: hostLayout(layout), workspaceId });
      if (migration.complete) {
        const required = { workspaceRoot: layout.forWorkspace({ workspaceId }).root, activations: owner };
        await carryCloudflareActivation(required);
        await carryDeployDisabled(required);
      }
      return migration;
    },
    formatBundledUninstallRecovery: ({ pluginId }) => `used, disable it instead: call plugins_set_enabled with family 'agent-plugin', pluginId '${pluginId}', ` +
      "enabled false (disabling needs no confirmation), or turn it off from the Agent Plugins admin screen.",
  };
  const owner = createAgentPluginLifecycle({
    ...createNodeAgentPluginEffects({}, optional),
    // Boot chooses the site root before binding this owner; requests keep that same layout.
    layout: ownerLayout(required.layout),
    productName: "Tovu", extensionNamespace: "tovu", bundledArchiveMagic: "TOVUPKG1\n",
    seededEnabledPluginIds: BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED,
    retiredBundledPlugins: RETIRED_BUNDLED_AGENT_PLUGINS,
    deliveryMode: resolveAgentPluginDeliveryMode(), formatPluginToolPointer,
    fetch: unbound, outboundGuard: { assertAllowed: unbound },
    mcpProvisioning: optional.mcpProvisioning ?? { provision: unbound, setEnabled: unbound, remove: unbound, notifyRosterChanged: unbound },
  }, policy);
  const manifests: SupersessionManifestsPort = optional.supersessionManifests ?? {
    readInstalled: ({ plugin }) => owner.readTrustedPluginFile({ plugin, filename: "plugin.json" }),
    readBundledSource: createBundledSourceManifestReader({ sourceRoot: () => defaultBundledSourceRoot({ env: process.env }) }),
  };
  return {
    ...owner,
    // Select the trusted replacement at the contribution owner BEFORE duplicate-id validation.
    // A failed retirement may leave both packages on disk; a disabled successor must stay disabled.
    // What a replacement supersedes is declared by that plugin (`supersession.ts`), never named here.
    loadPluginContributions: async <D, T>(input: { readonly workspaceId: string; readonly definition: PluginContributionDefinition<D, T> }, options: LoadPluginContributionsOptional = {}) => {
      const verdicts = await owner.findTrustedPluginPackages({ workspaceId: input.workspaceId, filename: input.definition.filename,
        contribution: input.definition.contribution, requireActive: false });
      const supersessions = await readSupersessions({ verdicts, manifests });
      const definition = { ...input.definition, load: async (context: Parameters<typeof input.definition.load>[0]) =>
        supersededDescriptorRefusal({ supersessions, pluginId: context.plugin.pluginId, descriptor: context.descriptor }) ?? input.definition.load(context) };
      return owner.loadPluginContributions({ ...input, definition }, { ...options, packageRefusal: ({ plugin }) =>
        supersededPackageRefusal({ supersessions, pluginId: plugin.pluginId }) ?? options.packageRefusal?.({ plugin }) });
    },
    installAgentPlugin: (input: InstallAgentPluginRequired, options: Parameters<typeof owner.installAgentPlugin>[1] = {}) => owner.installAgentPlugin({ ...input, layout: ownerLayout(input.layout), archiveReader: ownerReader(input.archiveReader) }, options),
    updateAgentPlugin: (input: Omit<import("@jini-ai/agent-plugins/lifecycle").UpdateAgentPluginRequired, "layout" | "archiveReader"> & { layout: AgentPluginLayout; archiveReader: AgentPluginArchiveReaderPort }) => owner.updateAgentPlugin({ ...input, layout: ownerLayout(input.layout), archiveReader: ownerReader(input.archiveReader) }),
    uninstallAgentPlugin: (input: UninstallAgentPluginRequired, options: Parameters<typeof owner.uninstallAgentPlugin>[1] = {}) => owner.uninstallAgentPlugin({ ...input, layout: ownerLayout(input.layout) }, options),
    previewAgentPluginUninstall: (input: UninstallAgentPluginRequired) => owner.previewAgentPluginUninstall({ ...input, layout: ownerLayout(input.layout) }),
    seedBundledAgentPlugins: (input: SeedBundledAgentPluginsRequired) => owner.seedBundledAgentPlugins({ ...input, layout: ownerLayout(input.layout) }),
    retireBundledAgentPlugins: (input: RetireBundledAgentPluginsRequired, options: Parameters<typeof owner.retireBundledAgentPlugins>[1] = {}) => owner.retireBundledAgentPlugins({ ...input, layout: ownerLayout(input.layout) }, options),
    resolveAgentPluginRefs: (pluginRefIds: readonly string[], workspaceLayout: Pick<AgentPluginWorkspaceLayout, "packages" | "root">, deliveryMode = resolveAgentPluginDeliveryMode()) => owner.resolveAgentPluginRefs({ pluginRefIds, workspaceLayout }, { deliveryMode }),
    listInstalledPlugins: (workspaceRoot: string) => owner.listInstalledPlugins({ workspaceRoot }),
    isInstalledDigestPresent: (packagesDir: string, archiveDigest: string) => owner.isInstalledDigestPresent({ packagesDir, archiveDigest }),
    indexInstalledRoot: (packageRoot: string, archiveDigest: string) => owner.indexInstalledRoot({ packageRoot, archiveDigest }),
    maxAgentPluginInstallArchiveBytes: () => owner.maxAgentPluginInstallArchiveBytes({}),
    normalizePackageEntryPath: (rawEntryPath: string) => owner.normalizePackageEntryPath({ rawEntryPath }),
    assertContainedOnDisk: (packageRoot: string, entryPath: string) => owner.assertContainedOnDisk({ packageRoot, entryPath }),
    readBundledAgentPluginDigests: (workspaceRoot: string) => owner.readBundledAgentPluginDigests({ workspaceRoot }),
    normalizeBundledDigests: (value: unknown) => owner.normalizeBundledDigests({ value }),
    preferBundledAgentPluginDigests: <T extends { readonly pluginId: string; readonly archiveDigest: string }>(installed: readonly T[], bundled: Parameters<typeof owner.preferBundledAgentPluginDigests>[0]['bundled']) => owner.preferBundledAgentPluginDigests({ installed, bundled }),
    recordBundledAgentPluginDigests: (input: Parameters<typeof owner.recordBundledAgentPluginDigests>[0] & { readonly now?: () => Date }) => owner.recordBundledAgentPluginDigests(input, input.now ? { now: input.now } : {}),
    rankInstalledAgentPlugins: (query: string, candidates: Parameters<typeof owner.rankInstalledAgentPlugins>[0]['candidates'], limit: number, optional: { automatic?: boolean } = {}) => owner.rankInstalledAgentPlugins({ query, candidates, limit }, optional),
    packAgentPluginDirectory: (sourceDir: string) => owner.packAgentPluginDirectory({ sourceDir }),
    createBundledSourceArchiveReader: (): AgentPluginArchiveReaderPort => {
      const reader = owner.createBundledSourceArchiveReader({});
      return { async *entries(archive) {
        for await (const entry of reader.entries({ archive })) yield entry.kind === "file" ? { ...entry, openReadStream: () => entry.openReadStream({}) } : entry;
      } };
    },
    findTrustedPluginPackages: ({ onInactive, ...input }: TrustedPluginPackagesQuery) => owner.findTrustedPluginPackages(input, onInactive ? { onInactive: ({ plugin }) => onInactive(plugin) } : {}),
    readTrustedPluginFile: (plugin: TrustedPluginPackage, filename: string) => owner.readTrustedPluginFile({ plugin, filename }),
    importContainedModule: (plugin: TrustedPluginPackage, modulePath: string) => owner.importContainedModule({ plugin, modulePath }),
  };
}

/** Compatibility exports below accept explicit roots/layouts. Site-dependent operations must use
 * a lifecycle bound at boot; importing this module must never select a site from process state. */
export const unboundSiteAgentPluginLayout: AgentPluginLayout = {
  root: "", workspacesDir: "",
  forWorkspace() { throw new Error("Agent Plugin layout must be supplied by the booted site binding"); },
};
const explicitRootLifecycle = createTovuAgentPluginLifecycle({ layout: unboundSiteAgentPluginLayout });
export const {
  installAgentPlugin, uninstallAgentPlugin, previewAgentPluginUninstall, stageForRemoval,
  restoreStagedTrees, removeFrozenPackageTree, seedBundledAgentPlugins, retireBundledAgentPlugins,
  resolveAgentPluginRefs, listInstalledPlugins, isInstalledDigestPresent, indexInstalledRoot,
  maxAgentPluginInstallArchiveBytes, normalizePackageEntryPath, assertContainedOnDisk,
  readBundledAgentPluginDigests, normalizeBundledDigests, preferBundledAgentPluginDigests,
  recordBundledAgentPluginDigests, removeBundledAgentPluginDigest, rankInstalledAgentPlugins,
  packAgentPluginDirectory, createBundledSourceArchiveReader,
  readTrustedPluginFile, importContainedModule, loadPluginContributionsFromSource,
  readInstalledSkillFile,
} = explicitRootLifecycle;

/** This boot's lifecycle owner; installed contributions always use its fixed site layout. */
export type TovuAgentPluginLifecycle = ReturnType<typeof createTovuAgentPluginLifecycle>;
export type LoadPluginContributions = TovuAgentPluginLifecycle["loadPluginContributions"];

/** Compatibility activation effects take explicit workspace roots and cannot discover a site. */
export const explicitRootAgentPluginActivations = {
  setAgentPluginActivation: explicitRootLifecycle.setAgentPluginActivation,
  recordBundledAgentPluginIfAbsent: explicitRootLifecycle.recordBundledAgentPluginIfAbsent,
  enableBundledAgentPluginUnlessOperatorDisabled: explicitRootLifecycle.enableBundledAgentPluginUnlessOperatorDisabled,
  deleteAgentPluginActivation: explicitRootLifecycle.deleteAgentPluginActivation,
  isAgentPluginActive: explicitRootLifecycle.isAgentPluginActive,
  filterActiveAgentPlugins: explicitRootLifecycle.filterActiveAgentPlugins,
  readAgentPluginActivations: explicitRootLifecycle.readAgentPluginActivations,
  assertAgentPluginActivationsWritable: explicitRootLifecycle.assertAgentPluginActivationsWritable,
  isAgentPluginRecordedAsBundled: explicitRootLifecycle.isAgentPluginRecordedAsBundled,
  resolveAgentPluginActivation: explicitRootLifecycle.resolveAgentPluginActivation,
  normalizeActivations: explicitRootLifecycle.normalizeActivations,
};
