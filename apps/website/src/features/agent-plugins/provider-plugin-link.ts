import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PluginActivationRecord, PluginActivationRepoPort } from "@jini-ai/plugins/host";

import { agentPluginActivations } from "./activation-effects.js";
import { readProviderPluginLink } from "./identity.js";
import { listInstalledPlugins } from "./lifecycle.js";

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
    const enabled = await providerEnabled({ pluginId: provider });
    if (await ports.isFaceActive({ pluginId: face }) === enabled) continue;
    await ports.setFace({ pluginId: face, enabled });
    switched.push(face);
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
  const mirror = async ({ row, enabled }: { row: { workspaceId: string; pluginId: string }; enabled: boolean }) => {
    if (row.workspaceId !== workspaceId) return;
    try { await syncProviderFaces({ ports, providerEnabled: async () => enabled }, { providerId: row.pluginId }); }
    catch (error) { (optional.warn ?? console.warn)(`[agent-plugins] the assistant face of '${row.pluginId}' could not follow it; the next start retries: ${error instanceof Error ? error.message : String(error)}`); }
  };
  return {
    getActivation: (required, opts) => repo.getActivation(required, opts),
    listAll: (required, opts) => repo.listAll(required, opts),
    save: async (record: PluginActivationRecord, opts) => { await repo.save(record, opts); await mirror({ row: record, enabled: record.enabled }); },
    deleteActivation: async (required, opts) => { await repo.deleteActivation(required, opts); await mirror({ row: required, enabled: false }); },
  };
}

/** The provider plugin `pluginId` is the face of, or undefined when it declares none. @complexity As `links`. */
export async function linkedProviderOf({ ports, pluginId }: { ports: Pick<ProviderFacePorts, "links">; pluginId: string }): Promise<string | undefined> {
  return (await ports.links({})).get(pluginId);
}

/**
 * Production ports over one workspace's installed agent plugins and activation record. The root is
 * resolved per call, so binding before a site is chosen is safe. An unreadable manifest links nothing.
 * @complexity `links`: one manifest read per installed revision.
 */
export function bindProviderFacePorts({ workspaceRoot }: { workspaceRoot: () => string }, optional: { readonly readText?: (filePath: string) => Promise<string> } = {}): ProviderFacePorts {
  const readText = optional.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const linkOf = async (packageRoot: string) => {
    try { return readProviderPluginLink({ manifest: JSON.parse(await readText(path.join(packageRoot, "plugin.json"))) }); }
    catch { return undefined; }
  };
  return {
    links: async () => {
      const links = new Map<string, string>();
      for (const plugin of await listInstalledPlugins(workspaceRoot())) {
        const provider = links.has(plugin.pluginId) ? undefined : await linkOf(plugin.packageRoot);
        if (provider !== undefined) links.set(plugin.pluginId, provider);
      }
      return links;
    },
    isFaceActive: async ({ pluginId }) => agentPluginActivations.isAgentPluginActive({
      activations: await agentPluginActivations.readAgentPluginActivations({ workspaceRoot: workspaceRoot() }), pluginId }),
    setFace: async ({ pluginId, enabled }) => {
      await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: workspaceRoot(), pluginId, enabled, actor: PROVIDER_LINK_ACTOR });
    },
  };
}
