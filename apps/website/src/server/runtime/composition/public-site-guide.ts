import { publicCapabilityCard, VISITOR_REPLY_GUIDANCE } from "#src/assistant/site/capability-card";
import type { SiteGuideEngine } from "#src/features/site-guide/index";
import { resolveSiteGuideEngine } from "./site-guide.js";
import { readSiteGuideInput, searchGuide } from "./site-guide-tools.js";

/** Public wrapper uses the SAME Jini shell with only an anonymous capability card. No private
 * site facts or plugin lifecycle enter this factory. The optional registry adapter still enforces
 * anonymous caller class before invoking it.
 * @returns A public-safe overview/explain invocation, reporting hidden topics as unavailable.
 * @complexity O(1), one fixed card; no database/config/network effects.
 * @example runPublicSiteGuide({ input: { operation: 'overview' } });
 */
export async function runPublicSiteGuide({ input }: { input: unknown }, options: { engine?: SiteGuideEngine; availableTools?: readonly string[] } = {}): Promise<unknown> {
  const parsed = readSiteGuideInput({ input });
  const engine = options.engine ?? resolveSiteGuideEngine({});
  const service = engine.createSiteGuide({
    builtInTopics: [effectivePublicCard({ availableTools: options.availableTools })], authorize: async () => false,
    loadContributions: async () => ({ items: [], refusals: [] }),
    facts: { read: async () => ({ content: { status: "ok", data: { visibility: "published-only", administration: false } } }) },
  });
  const caller = { principalId: "anonymous-visitor" };
  if (parsed.operation === "search") return searchGuide({ guide: service, caller, topic: parsed.topic! });
  return service.run({ caller, operation: parsed.operation, topic: parsed.topic });
}

/** Keep tool ids out of visitor prose, and derive all advertised actions from effective policy.
 * The default preserves standalone guide callers; the visitor registry always supplies a list.
 * @complexity O(1) for six reviewed CMS capabilities.
 */
function effectivePublicCard({ availableTools }: { availableTools?: readonly string[] }, _options = {}): typeof publicCapabilityCard {
  if (availableTools === undefined) return publicCapabilityCard;
  const labels: Readonly<Record<string, string>> = {
    search_published_entries: "Search published entries", get_published_entry: "Read a published entry",
    list_categories: "List public categories", navigate_to_entry: "Propose navigation to a public entry",
    scroll_to_entry: "Scroll to a public entry", highlight_entry: "Highlight a public entry",
  };
  const actions = Object.entries(labels).filter(([id]) => availableTools.includes(id)).map(([, label]) => label);
  // Preserve today's model-facing card byte-for-byte when the default CMS grants all remain.
  if (actions.length === Object.keys(labels).length) return publicCapabilityCard;
  return { ...publicCapabilityCard, summary: actions.length ? actions.join("; ") + "." : "No content actions are available.",
    explanation: "Currently available: " + (actions.join("; ") || "none") + ". Drafts, private configuration and administrator tools are unavailable. Ask the site operator to plan or build features requiring those permissions. " + VISITOR_REPLY_GUIDANCE,
    pointers: actions.map(label => ({ label, permissions: [] })),
  };
}
