import { type LoadPluginContributions, createTovuAgentPluginLifecycle, type TrustedPluginPackage } from '#src/features/agent-plugins/lifecycle';
import { credentialCardsContribution, mergePluginCredentialCards } from '#src/features/agent-plugins/credential-cards';
import { parseDeployTargetsFile } from '#src/features/deployments/deploy-targets/registry';
import { parseSourceControlProvidersFile } from '#src/features/source-control/provider-registry';
import { parseMailAdaptersFile } from '#src/features/agent-plugins/mail-adapter-registry';
import type { AgentPluginLayout } from '#src/features/agent-plugins/layout';
import type { LoadPluginCredentialCards, PluginCredentialCard } from '#src/features/custom-credentials/plugin-credential-card';

type ReadFile = (required: { plugin: TrustedPluginPackage; filename: string }, optional?: Record<string, never>) => Promise<string>;
/** Read only descriptors contributed by the declaring package, through the lifecycle's contained port.
 * Missing or invalid descriptors grant no ownership; a parsed card may explicitly own its API label.
 * Cross-plugin label conflicts are refused by the existing merge. O(descriptors); no modules execute.
 */
async function ownsDestination({ plugin, card, readFile }: { plugin: TrustedPluginPackage; card: PluginCredentialCard; readFile: ReadFile }, _options = {}): Promise<boolean> {
  const identities = await readOwnedIdentities({ plugin, readFile });
  if (card.saveTarget !== undefined && !identities.has(card.saveTarget)) return false;
  if ((card.saveKind === undefined || card.saveKind === 'api') && card.ownedApiLabel === card.label) return true;
  const identity = card.saveKind === undefined || card.saveKind === 'api' ? card.label : card.saveTarget ?? card.providerId;
  return identities.has(identity);
}

/** Bind active trusted contributions once; lookups remain fresh for activation changes.
 * Ownership checks and duplicate refusals cannot change a domain store. O(plugins + cards).
 */
export function createPluginCredentialCardsLoader({ agentPluginLayout, loadMailCards }: { agentPluginLayout: AgentPluginLayout; loadMailCards: LoadPluginCredentialCards }, options: { loadContributions?: LoadPluginContributions; readFile?: ReadFile; onRefusal?: (refusal: string) => void } = {}): LoadPluginCredentialCards {
  const warn = options.onRefusal ?? (message => console.warn(`[plugin-credential-cards] ${message}`));
  let lifecycle: ReturnType<typeof createTovuAgentPluginLifecycle> | undefined;
  // Tool catalogs can be built before a site is bound; only a lookup needs the fixed layout.
  const owner = () => lifecycle ??= createTovuAgentPluginLifecycle({ layout: agentPluginLayout });
  const readFile: ReadFile = options.readFile ?? (({ plugin, filename }) => owner().readTrustedPluginFile(plugin, filename));
  const definition = { ...credentialCardsContribution, load: async ({ plugin, descriptor }: Parameters<typeof credentialCardsContribution.load>[0]) =>
    await ownsDestination({ plugin, card: descriptor, readFile }) ? { ...descriptor, pluginId: plugin.pluginId }
      : `credential card '${descriptor.providerId}' from '${plugin.pluginId}' was refused: destination is not owned by this plugin` };
  return async workspaceId => {
    const mailCards = await loadMailCards(workspaceId);
    try {
      const loadContributions = options.loadContributions ?? owner().loadPluginContributions;
      const result = await loadContributions({ workspaceId, definition }, { requireActive: true, orderByPluginId: true });
      for (const refusal of result.refusals) warn(refusal);
      return mergePluginCredentialCards({ mailCards, manifestCards: result.items }, { onRefusal: warn });
    } catch {
      warn('Optional manifest cards could not be loaded; retaining mail cards and domain defaults.');
      return mailCards;
    }
  };
}

/** Actual descriptors grant identity ownership; display text alone never does. O(descriptors). */
async function readOwnedIdentities({ plugin, readFile }: { plugin: TrustedPluginPackage; readFile: ReadFile }, _options = {}): Promise<Set<string>> {
  const identities = new Set([plugin.pluginId]);
  const sources = [
    { filename: 'tovu-deploy-targets.json', parse: parseDeployTargetsFile },
    { filename: 'tovu-source-control.json', parse: parseSourceControlProvidersFile },
    { filename: 'tovu-mail-adapters.json', parse: parseMailAdaptersFile },
  ];
  for (const source of sources) {
    try {
      const parsed = source.parse(await readFile({ plugin, filename: source.filename }));
      if (parsed.ok) for (const entry of parsed.descriptors) {
        identities.add(entry.id);
        if ('credentialLabel' in entry) identities.add(entry.credentialLabel);
      }
    } catch { /* Missing or broken descriptors grant no ownership. */ }
  }
  return identities;
}
