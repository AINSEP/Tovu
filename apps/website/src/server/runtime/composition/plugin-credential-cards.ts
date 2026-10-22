import { type LoadPluginContributions, createTovuAgentPluginLifecycle } from '#src/features/agent-plugins/lifecycle';
import { credentialCardsContribution, mergePluginCredentialCards } from '#src/features/agent-plugins/credential-cards';
import type { AgentPluginLayout } from '#src/features/agent-plugins/layout';
import type { LoadPluginCredentialCards } from '#src/features/custom-credentials/plugin-credential-card';

/** Bind generic manifests beside the existing mail loader without replacing its catalog or copy.
 * Jini supplies active-package trust and contained reads. Each lookup is fresh. @complexity O(p+c).
 */
export function createPluginCredentialCardsLoader({ agentPluginLayout, loadMailCards }: { agentPluginLayout: AgentPluginLayout; loadMailCards: LoadPluginCredentialCards }, options: { loadContributions?: LoadPluginContributions; onRefusal?: (refusal: string) => void } = {}): LoadPluginCredentialCards {
  return async workspaceId => {
    const mailCards = await loadMailCards(workspaceId);
    // Tool catalogs can be built before a site is bound; only a lookup needs the fixed layout.
    const loadContributions = options.loadContributions ?? createTovuAgentPluginLifecycle({ layout: agentPluginLayout }).loadPluginContributions;
    const result = await loadContributions({ workspaceId, definition: credentialCardsContribution }, { requireActive: true, orderByPluginId: true });
    for (const refusal of result.refusals) (options.onRefusal ?? (message => console.warn(`[plugin-credential-cards] ${message}`)))(refusal);
    return mergePluginCredentialCards({ mailCards, manifestCards: result.items });
  };
}
