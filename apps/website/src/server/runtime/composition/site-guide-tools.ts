import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { toolMetadata } from "#src/contracts/core/tool-metadata/site-guide";
import type { ToolContributor } from "@jini-ai/core";
import { createTovuSiteGuide, type TovuSiteGuideDeps } from "./site-guide.js";
import type { SiteGuideEngine } from "#src/features/site-guide/index";

export const SITE_GUIDE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["operation"],
  properties: {
    operation: { type: "string", enum: ["overview", "explain", "search"], description: "overview lists topics; explain describes one topic; search finds visible topics by text." },
    topic: { type: "string", aliases: ["query"], minLength: 1, maxLength: 200, description: "For explain: a topic id from overview. For search: words to find in topic ids, titles and summaries. query is an alias." },
  },
} as const;
export const catalog = indexCatalogById({ catalog: [{
  name: "site_guide",
  description: "Explains how THIS site works. Call overview before planning or building, search with topic (or query) to find visible topics, then explain with a topic id. Returns permission-filtered capability cards, live facts, workflows and tool/doc pointers. Read only; it neither builds the site nor replaces search_tools for callable actions. Hidden topics are unavailable; failed fact reads mean unknown, not disabled. Core topics remain available with the guide plugin disabled.",
  sideEffects: "none" as const, authorization: { permission: "admin.assistant.use" }, inputSchema: SITE_GUIDE_SCHEMA,
}] });
export const siteGuideDerivedRisk: DerivedRiskByToolId = new Map([["site_guide", "none"]]);

/** Validate tool modes, preserving the generic service's hidden-topic error contract. */
export function readSiteGuideInput({ input }: { input: unknown }, _options: Record<string, never> = {}): { operation: "overview" | "explain" | "search"; topic?: string } {
  const record = requireInputRecord({ input });
  if (Object.keys(record).some(key => key !== "operation" && key !== "topic")) throw new ToolInputError({ message: "site_guide accepts only operation and topic." });
  if (record.operation !== "overview" && record.operation !== "explain" && record.operation !== "search") throw new ToolInputError({ message: "site_guide: operation must be overview, explain or search." });
  if (record.operation === "overview") {
    assertOverviewInput({ topic: record.topic });
    return { operation: "overview" };
  }
  if (record.operation === "search") {
    return { operation: "search", topic: readSearchTopic({ topic: record.topic }) };
  }
  if (typeof record.topic !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(record.topic)) throw new ToolInputError({ message: "site_guide: explain requires a topic id from overview." });
  return { operation: "explain", topic: record.topic };
}

/** Overview has no selector; fail before guide construction. O(1), no effects. */
function assertOverviewInput({ topic }: { topic: unknown }, _options = {}) {
  if (topic !== undefined) throw new ToolInputError({ message: "site_guide: topic is only accepted with operation explain or search." });
}

/** Bound search text independently of explain's topic-id contract. No effects; O(q) trim. */
function readSearchTopic({ topic }: { topic: unknown }, _options = {}): string {
  if (typeof topic !== "string" || !topic.trim() || topic.length > 200) throw new ToolInputError({ message: "site_guide: search requires topic (or query) with 1..200 characters." });
  return topic.trim();
}

/** Compatibility for the installed Jini version until declared schema aliases are published.
 * Read aliases from the schema so there is only one declaration; newer Jini consumes it first.
 * @complexity O(k) input copying; no I/O. Conflicting spellings are refused before authorization.
 */
function normalizeGuideInput({ input }: { input: Readonly<Record<string, unknown>> }, _options = {}) {
  const alias = SITE_GUIDE_SCHEMA.properties.topic.aliases.find(key => Object.hasOwn(input, key));
  if (!alias) return { input, notes: [] };
  if (Object.hasOwn(input, "topic")) throw new ToolInputError({ message: `Conflicting inputs '${alias}' and 'topic'. Send only 'topic'.` });
  const { [alias]: topic, ...rest } = input;
  return { input: { ...rest, topic }, notes: [`${alias}→topic`] };
}

/** Search only the permission-filtered overview; hidden topics and their facts are never read.
 * @complexity O(t*q) for bounded overview text t and at most 200 query characters q; no extra I/O.
 */
export async function searchGuide({ guide, caller, topic }: { guide: Pick<ReturnType<typeof createTovuSiteGuide>, "run">; caller: { principalId: string }; topic: string }, _options = {}) {
  const result = await guide.run({ caller, operation: "overview" }) as { topics: Array<{ id: string; title: string; summary: string }> };
  const words = topic.toLowerCase().split(/\s+/u);
  const topics = result.topics.filter(card => {
    const text = `${card.id} ${card.title} ${card.summary}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
  return { ...result, operation: "search", topics };
}

/** Compose a read-class tool over the host guide; caller identity comes only from execution ctx.
 * @returns One risk-cross-checked registration; direct approval and no mutation access.
 * @complexity O(1) registration. The guide owns permission filtering and fresh reads.
 * @example buildSiteGuideRegistrations({ deps }, { engine });
 */
export function buildSiteGuideRegistrations({ deps }: { deps: TovuSiteGuideDeps }, options: { engine?: SiteGuideEngine } = {}): ToolRegistration[] {
  return buildDomainRegistrations({
    domain: "site-guide", catalogModule: "server/runtime/composition/site-guide-tools.ts", catalog, derivedRisk: siteGuideDerivedRisk,
    metadata: toolMetadata,
    inputNormalizers: { site_guide: normalizeGuideInput },
    handlers: { site_guide: async ctx => {
      const parsed = readSiteGuideInput({ input: ctx.input });
      // Same assistant-use floor as the discovery catalog, followed by per-topic domain gates.
      const decision = await deps.authorize({ principalId: ctx.principal.id, workspaceId: deps.workspaceId, permission: "admin.assistant.use" });
      if (!decision.allowed) throw new ToolInputError({ message: "site_guide: this caller may not use the admin assistant." });
      try {
        const guide = createTovuSiteGuide({ deps }, options);
        const caller = { principalId: ctx.principal.id };
        if (parsed.operation === "search") return await searchGuide({ guide, caller, topic: parsed.topic! });
        return await guide.run({ caller, operation: parsed.operation, topic: parsed.topic });
      } catch (error) {
        if (error instanceof Error && error.name === "SiteGuideInputError") throw new ToolInputError({ message: error.message });
        throw error;
      }
    } },
  });
}

/** Shared by every admin CLI vendor and BYOK through the existing first-party manifest. */
export function contributeSiteGuideTools(_input: Record<string, never>, options: { engine?: SiteGuideEngine } = {}): ToolContributor<TovuSiteGuideDeps, unknown> {
  return { domain: "site-guide", risk: siteGuideDerivedRisk, build: deps => buildSiteGuideRegistrations({ deps }, options) };
}
