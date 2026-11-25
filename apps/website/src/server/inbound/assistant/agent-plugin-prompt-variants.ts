/** Pure assembly of the argv-fit prompt alternatives for one offered plugin guidance draft.
 * History, page context, attachments, the capability and refusal prefixes and explicit pins are in
 * every variant byte for byte; only the optional guidance differs. No lifecycle or filesystem work. */
import type { AgentPluginGuidanceOffer } from "@jini-ai/core/contracts/site/daemon";
import { assemblePromptWithPluginPrefix } from "./plugin-prompt-assembly.js";

export type PluginPromptVariant = { readonly id: "full" | "catalog" | "pointer" | "base"; readonly prompt: string };

/** The last optional fallback before the unmodified base: names paged discovery and the explicit loader. */
export const AGENT_PLUGIN_DISCOVERY_POINTER = "Agent Plugins may have guidance for this request. Find them with search_agent_plugin_local starting at offset: 0, follow the returned nextOffset to see more, and load one with load_agent_plugin({ pluginId }) before acting in its domain.";

/** Build `full`, `catalog`, `pointer`, `base` in the order the executor tries them. Pins stay ahead of
 * the optional text, as in one-shot preparation; nothing mandatory is trimmed to make optional text fit.
 * @param basePrompt The selected history with every mandatory decoration except the plugin prefix.
 * @complexity O(variants × prompt bytes).
 */
export function buildPluginPromptVariants({ basePrompt, offer, discoveryPointer }: { basePrompt: string; offer: AgentPluginGuidanceOffer; discoveryPointer: string }, { pinnedPrefix = "" }: { pinnedPrefix?: string } = {}): PluginPromptVariant[] {
  const withOptional = (optional: string) => assemblePromptWithPluginPrefix({ basePrompt, pluginPromptPrefix: [pinnedPrefix, optional].filter(Boolean).join("\n\n") });
  return [
    { id: "full", prompt: withOptional(offer.fullPrefix) },
    { id: "catalog", prompt: withOptional(offer.catalogPrefix) },
    { id: "pointer", prompt: withOptional(discoveryPointer) },
    { id: "base", prompt: withOptional("") },
  ];
}

/** Only `full` carries the offered sections; every fallback delivers none of them. O(sections). */
export function deliveredGuidanceIds({ offer, id }: { offer: AgentPluginGuidanceOffer; id: PluginPromptVariant["id"] }, _optional = {}): string[] {
  return id === "full" ? offer.fullSections.map(section => section.pluginId) : [];
}

/** The executor's selection callback. Prepared guidance is not delivered guidance: an offer only
 * becomes a recorded delivery when the executor has validated the variant it will really spawn,
 * and then only for the ids that variant carries. A rejected commit refuses the run before spawn.
 */
export function pluginPromptSelection({ offer, variants, commit }: {
  offer: AgentPluginGuidanceOffer; variants: readonly PluginPromptVariant[];
  commit: (required: { runId: string; offerId: string; deliveredIds: readonly string[] }, optional?: { signal?: AbortSignal | undefined }) => Promise<unknown>;
}, _optional = {}) {
  return {
    candidates: variants,
    onSelected: async ({ runId, id }: { runId: string; id: PluginPromptVariant["id"] }, { signal }: { signal?: AbortSignal } = {}): Promise<void> => {
      await commit({ runId, offerId: offer.offerId, deliveredIds: deliveredGuidanceIds({ offer, id }) }, signal ? { signal } : {});
    },
  };
}
