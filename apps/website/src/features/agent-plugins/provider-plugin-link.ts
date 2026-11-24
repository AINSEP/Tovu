import { agentPluginActivations } from "./activation-effects.js";
import { listInstalledPlugins, preferBundledAgentPluginDigests, readBundledAgentPluginDigests, readTrustedPluginFile } from "./lifecycle.js";

/**
 * @file This host's bindings for `@jini-ai/agent-plugins/site/provider-plugin-link` (one vendor, one
 * plugin, owner 2026-10-25): the lifecycle owner's activation and catalog calls, the log sink for a
 * face that could not follow, and the linked-face refusal, whose copy names this product's real switch.
 */

/** The lifecycle owner's calls `bindProviderFacePorts` injects, so faces share its activation queue. */
export const providerFaceLifecycle = {
  activations: agentPluginActivations,
  catalog: { list: listInstalledPlugins, bundled: readBundledAgentPluginDigests, preferBundled: preferBundledAgentPluginDigests, read: readTrustedPluginFile },
};

/** `followProviderActivations`' `warn` sink: the same `[agent-plugins]` server log line as before the move. */
export function warnProviderFace(message: string): void {
  console.warn(`[agent-plugins] ${message}`);
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
