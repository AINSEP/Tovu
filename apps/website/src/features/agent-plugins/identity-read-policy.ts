import type { AgentPluginIdentityReadOptions } from "@jini-ai/agent-plugins/manifest";

/**
 * Tovu's one read policy for agent-plugin manifests published before the portable `extensions.jini`
 * key: installed N-1 packages still carry `extensions.tovu`. Jini reads canonical-only unless a host
 * supplies this descriptor, so every Tovu entry that reads plugin metadata (lifecycle, host tools,
 * credential cards, provider faces, Soon lock, supersession, host signals — including the desktop
 * preboot path) passes this same constant. Side-effect free: the desktop shell imports it directly.
 * The warning bytes are the ones Jini shipped before the policy moved to the host.
 */
export const TOVU_AGENT_PLUGIN_IDENTITY_READ: Required<Pick<AgentPluginIdentityReadOptions, "legacyIdentity">> = {
  legacyIdentity: {
    namespace: "tovu",
    warning: "Legacy extensions.tovu agent-plugin metadata is deprecated; compatibility is retained through at least 2027-05-06. Portable packages use extensions.jini and unprefixed MCP metadata.",
  },
};
