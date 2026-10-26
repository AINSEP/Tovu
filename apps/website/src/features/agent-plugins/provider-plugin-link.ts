import type { PluginActivationRecord, PluginActivationRepoPort } from "@jini-ai/plugins/host";

import { agentPluginActivations } from "./activation-effects.js";
import { readProviderPluginLink } from "./identity.js";
import { listInstalledPlugins, preferBundledAgentPluginDigests, readBundledAgentPluginDigests, readTrustedPluginFile } from "./lifecycle.js";

/**
 * @file One vendor, one plugin (owner 2026-10-25): a provider plugin (the Plugins screen, its Settings
 * card, the code that sends events) and the agent plugin that is its assistant face (the chat key card
 * and know-how) are switched by ONE switch — the provider plugin's. The agent plugin declares the link
 * in its own manifest (`extensions.tovu.providerPlugin`, read by `identity.ts`); core names no vendor.
 *
 * Why the face follows rather than both toggling each other: the provider plugin's activation row is
 * already the durable, permission-gated, approval-recorded decision (`setPluginEnabled`), and its
 * enable path carries capability approvals the agent-plugin switch has no business re-implementing.
 * So the provider row is the one source of truth; the face's activation record is a mirror of it:
 * - every write of the provider row (admin switch, `plugins_set_enabled`, reload, quarantine, rollback,
 *   uninstall) goes through the activation repo, which {@link followProviderActivations} wraps;
 * - boot runs {@link syncProviderFaces} after seeding, which also absorbs faces seeded inactive and any
 *   mirror write that failed;
 * - switching the face on its own is refused ({@link AgentPluginLinkedError}) and names the real switch.
 */

/** Recorded as the face's `updatedBy`, so an audit shows the provider plugin decided it. */
export const PROVIDER_LINK_ACTOR = "system:provider-plugin";

/** The face activation calls this module makes, bound to one workspace. */
export interface ProviderFacePorts {
  /** Installed agent plugins that declare a provider plugin: agent plugin id → provider plugin id. */
  readonly links: (required: Record<string, never>) => Promise<ReadonlyMap<string, string>>;
  /** Read canonical state and compare/write within the activation owner's serialized operation. */
  readonly reconcileFace: (required: { readonly pluginId: string; readonly resolveEnabled: () => Promise<boolean> }) => Promise<boolean>;
  readonly isFaceActive: (required: { readonly pluginId: string }) => Promise<boolean>;
  readonly setFace: (required: { readonly pluginId: string; readonly enabled: boolean }) => Promise<void>;
}

/** A linked face was switched on its own. Nothing was written. */
export class AgentPluginLinkedError extends Error {
  readonly code = "AGENT_PLUGIN_LINKED";
  readonly providerPluginId: string;
  constructor({ pluginId, providerPluginId }: { pluginId: string; providerPluginId: string }) {
    super(`'${pluginId}' is part of the '${providerPluginId}' plugin and turns on and off with it. ` +
      `Switch '${providerPluginId}' instead: Add-Ons → Plugins, or plugins_set_enabled with family 'site-runtime' and pluginId '${providerPluginId}'.`);
    this.providerPluginId = providerPluginId;
  }
}

/**
 * Brings each linked face in line with its provider plugin's enabled state; only differing faces are
 * written. `providerId` limits it to one provider's faces.
 * @returns The face ids it switched. @complexity O(l) links, one activation read each.
 */
export async function syncProviderFaces(
  { ports, providerEnabled }: { ports: ProviderFacePorts; providerEnabled: (required: { readonly pluginId: string }) => Promise<boolean> },
  optional: { readonly providerId?: string } = {},
): Promise<readonly string[]> {
  const switched: string[] = [];
  for (const [face, provider] of await ports.links({})) {
    if (optional.providerId !== undefined && provider !== optional.providerId) continue;
    if (await ports.reconcileFace({ pluginId: face, resolveEnabled: () => providerEnabled({ pluginId: provider }) })) switched.push(face);
  }
  return switched;
}

/**
 * The provider activation repo, with every write of THIS workspace's rows mirrored onto the linked
 * faces. A mirror failure is logged, never thrown: the provider decision already stands, and the next
 * boot's {@link syncProviderFaces} repairs the face.
 * @complexity As the wrapped write, plus {@link syncProviderFaces} for that one provider.
 */
export function followProviderActivations(
  { repo, workspaceId, ports }: { repo: PluginActivationRepoPort; workspaceId: string; ports: ProviderFacePorts },
  optional: { readonly warn?: (message: string) => void } = {},
): PluginActivationRepoPort {
  const mirror = async ({ row }: { row: { workspaceId: string; pluginId: string } }) => {
    if (row.workspaceId !== workspaceId) return;
    try { await syncProviderFaces({ ports, providerEnabled: async ({ pluginId }) => (await repo.getActivation({ workspaceId, pluginId }))?.enabled ?? false }, { providerId: row.pluginId }); }
    catch (error) { (optional.warn ?? console.warn)(`[agent-plugins] the assistant face of '${row.pluginId}' could not follow it; the next start retries: ${error instanceof Error ? error.message : String(error)}`); }
  };
  return {
    getActivation: (required, opts) => repo.getActivation(required, opts),
    listAll: (required, opts) => repo.listAll(required, opts),
    save: async (record: PluginActivationRecord, opts) => { await repo.save(record, opts); await mirror({ row: record }); },
    deleteActivation: async (required, opts) => { await repo.deleteActivation(required, opts); await mirror({ row: required }); },
  };
}

/** The provider plugin `pluginId` is the face of, or undefined when it declares none. @complexity As `links`. */
export async function linkedProviderOf({ ports, pluginId }: { ports: Pick<ProviderFacePorts, "links">; pluginId: string }): Promise<string | undefined> {
  return (await ports.links({})).get(pluginId);
}

/**
 * Production ports over one workspace's installed agent plugins and activation record. The root is
 * resolved per call, so binding before a site is chosen is safe. An unreadable manifest links nothing.
 * @throws Unresolved multiple revisions refuse link discovery rather than picking a switch.
 * @complexity `links`: O(p) installed packages, one trusted manifest read per selected revision.
 */
export function bindProviderFacePorts({ workspaceRoot }: { workspaceRoot: () => string }, optional: {
  readonly catalog?: {
    list: typeof listInstalledPlugins;
    bundled: typeof readBundledAgentPluginDigests;
    read: typeof readTrustedPluginFile;
  };
} = {}): ProviderFacePorts {
  const catalog = optional.catalog ?? { list: listInstalledPlugins, bundled: readBundledAgentPluginDigests, read: readTrustedPluginFile };
  return {
    links: async () => {
      const root = workspaceRoot();
      const selected = preferBundledAgentPluginDigests(await catalog.list(root), await catalog.bundled(root));
      const counts = new Map<string, number>();
      for (const plugin of selected) counts.set(plugin.pluginId, (counts.get(plugin.pluginId) ?? 0) + 1);
      const links = new Map<string, string>();
      for (const plugin of selected) {
        // The lifecycle refuses ambiguous non-bundled revisions; none may decide a current switch.
        if (counts.get(plugin.pluginId) !== 1) throw new Error(`Agent Plugin '${plugin.pluginId}' matches ${counts.get(plugin.pluginId)} installed packages — refusing to guess which one to use`);
        try {
          const provider = readProviderPluginLink({ manifest: JSON.parse(await catalog.read(plugin, "plugin.json")) });
          if (provider !== undefined) links.set(plugin.pluginId, provider);
        } catch { /* An unreadable manifest links nothing. */ }
      }
      return links;
    },
    reconcileFace: ({ pluginId, resolveEnabled }) => agentPluginActivations.reconcileAgentPluginActivation({
      workspaceRoot: workspaceRoot(), pluginId, resolveEnabled, actor: PROVIDER_LINK_ACTOR }),
    isFaceActive: async ({ pluginId }) => agentPluginActivations.isAgentPluginActive({
      activations: await agentPluginActivations.readAgentPluginActivations({ workspaceRoot: workspaceRoot() }), pluginId }),
    setFace: async ({ pluginId, enabled }) => {
      await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: workspaceRoot(), pluginId, enabled, actor: PROVIDER_LINK_ACTOR });
    },
  };
}
