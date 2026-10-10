import type { LoadPluginContributions, PluginContributionDefinition } from "#src/features/agent-plugins/lifecycle";
import type { CapabilityCard, SiteGuideEngine } from "./contracts.js";

export const SITE_GUIDE_FILENAME = "tovu-site-guide.json";

/** New data-only extension point over the existing activation/digest/containment owner.
 * Plugins supply text; they receive no registries, authorization effects, or host code handles.
 * @returns Fresh contributions. Missing files are ignored by lifecycle discovery; refusals remain
 * host diagnostics, never raw model-visible loader errors.
 * @complexity O(p + t) active trusted packages and bounded parsed topics.
 * @example loadSiteGuideContributions({ workspaceId, loadContributions, engine });
 */
export async function loadSiteGuideContributions(input: {
  workspaceId: string; loadContributions: LoadPluginContributions; engine: SiteGuideEngine;
}, _options: Record<string, never> = {}) {
  const definition: PluginContributionDefinition<CapabilityCard, { pluginId: string; topic: CapabilityCard }> = {
    filename: SITE_GUIDE_FILENAME, contribution: "site guide topics", kind: "data",
    parse: input.engine.parseGuideTopics,
    load: ({ plugin, descriptor }) => ({ pluginId: plugin.pluginId, topic: descriptor }),
  };
  const result = await input.loadContributions({ workspaceId: input.workspaceId, definition }, { requireActive: true, orderByPluginId: true });
  const groups = new Map<string, CapabilityCard[]>();
  for (const item of result.items) {
    const topics = groups.get(item.pluginId) ?? [];
    topics.push(item.topic);
    groups.set(item.pluginId, topics);
  }
  return { items: [...groups].map(([pluginId, topics]) => ({ pluginId, topics })), refusals: result.refusals };
}
