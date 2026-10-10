import { publicCapabilityCard } from "#src/assistant/site/capability-card";
import type { SiteGuideEngine } from "#src/features/site-guide/index";
import { resolveSiteGuideEngine } from "./site-guide.js";
import { readSiteGuideInput } from "./site-guide-tools.js";

/** Public wrapper uses the SAME Jini shell with only an anonymous capability card. No private
 * site facts or plugin lifecycle enter this factory. The optional registry adapter still enforces
 * anonymous caller class before invoking it.
 * @returns A public-safe overview/explain invocation, reporting hidden topics as unavailable.
 * @complexity O(1), one fixed card; no database/config/network effects.
 * @example runPublicSiteGuide({ input: { operation: 'overview' } });
 */
export async function runPublicSiteGuide({ input }: { input: unknown }, options: { engine?: SiteGuideEngine } = {}): Promise<unknown> {
  const parsed = readSiteGuideInput({ input });
  const engine = options.engine ?? resolveSiteGuideEngine({});
  const service = engine.createSiteGuide({
    builtInTopics: [publicCapabilityCard], authorize: async () => false,
    loadContributions: async () => ({ items: [], refusals: [] }),
    facts: { read: async () => ({ content: { status: "ok", data: { visibility: "published-only", administration: false } } }) },
  });
  return service.run({ caller: { principalId: "anonymous-visitor" }, ...parsed });
}
