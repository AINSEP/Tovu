import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { toolMetadata } from "#src/contracts/core/tool-metadata/site-guide";
import type { ToolContributor } from "#src/assistant/index";
import { createTovuSiteGuide, type TovuSiteGuideDeps } from "./site-guide.js";
import type { SiteGuideEngine } from "#src/features/site-guide/index";

export const SITE_GUIDE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["operation"],
  properties: {
    operation: { type: "string", enum: ["overview", "explain"], description: "overview lists topics; explain describes one topic." },
    topic: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$", description: "For explain only: an id returned by overview." },
  },
} as const;
const catalog = indexCatalogById({ catalog: [{
  name: "site_guide",
  description: "Explains how THIS site works. Call overview before planning or building, then explain with a topic id. Returns permission-filtered capability cards, live facts, workflows and tool/doc pointers. Read only; it neither builds the site nor replaces search_tools for callable actions. Hidden topics are unavailable; failed fact reads mean unknown, not disabled. Core topics remain available with the guide plugin disabled.",
  sideEffects: "none" as const, authorization: { permission: "admin.assistant.use" }, inputSchema: SITE_GUIDE_SCHEMA,
}] });
export const siteGuideDerivedRisk: DerivedRiskByToolId = new Map([["site_guide", "none"]]);

/** Validate the two tool modes, preserving the generic service's hidden-topic error contract. */
export function readSiteGuideInput({ input }: { input: unknown }, _options: Record<string, never> = {}): { operation: "overview" | "explain"; topic?: string } {
  const record = requireInputRecord({ input });
  if (Object.keys(record).some(key => key !== "operation" && key !== "topic")) throw new ToolInputError({ message: "site_guide accepts only operation and topic." });
  if (record.operation !== "overview" && record.operation !== "explain") throw new ToolInputError({ message: "site_guide: operation must be overview or explain." });
  if (record.operation === "overview") {
    if (record.topic !== undefined) throw new ToolInputError({ message: "site_guide: topic is only accepted with operation explain." });
    return { operation: "overview" };
  }
  if (typeof record.topic !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(record.topic)) throw new ToolInputError({ message: "site_guide: explain requires a topic id from overview." });
  return { operation: "explain", topic: record.topic };
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
    handlers: { site_guide: async ctx => {
      const parsed = readSiteGuideInput({ input: ctx.input });
      // Same assistant-use floor as the discovery catalog, followed by per-topic domain gates.
      const decision = await deps.authorize({ principalId: ctx.principal.id, workspaceId: deps.workspaceId, permission: "admin.assistant.use" });
      if (!decision.allowed) throw new ToolInputError({ message: "site_guide: this caller may not use the admin assistant." });
      try {
        return await createTovuSiteGuide({ deps }, options).run({ caller: { principalId: ctx.principal.id }, ...parsed });
      } catch (error) {
        if (error instanceof Error && error.name === "SiteGuideInputError") throw new ToolInputError({ message: error.message });
        throw error;
      }
    } },
  });
}

/** Shared by every admin CLI vendor and BYOK through the existing first-party manifest. */
export function contributeSiteGuideTools(_input: Record<string, never>, options: { engine?: SiteGuideEngine } = {}): ToolContributor {
  return { domain: "site-guide", risk: siteGuideDerivedRisk, build: deps => buildSiteGuideRegistrations({ deps }, options) };
}
