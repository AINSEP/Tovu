import { toolMetadata } from '../../contracts/core/tool-metadata/analytics.js';
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule } from "@jini-ai/core/model-facing-tool-errors";
import { withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { AnalyticsSinkPort, NormalizedHit } from "./index.js";
import { analyticsAgentToolCatalog } from "./agent-tools.js";

export interface AnalyticsToolDeps { authorize: AuthorizeFn; workspaceId: string; analyticsSink: AnalyticsSinkPort }
export const analyticsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> analyticsSink.list({limit}) only; summary is an in-memory reduction.
  ["analytics_list_recent_hits", "none"],
]);

/** An explicit allowlist matching the admin route: no visitorHash, session or eventProps. O(1). */
function safeHit(hit: NormalizedHit) {
  return { occurredAt: hit.occurredAt, kind: hit.kind, path: hit.path, referrerHost: hit.referrerHost, deviceClass: hit.deviceClass, browserFamily: hit.browserFamily, eventName: hit.eventName };
}

/** Counts keys including null (direct referrers); stable count/name order, bounded to ten. O(n log n). */
function topTen(values: Array<string | null>) {
  const counts = new Map<string | null, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([a, ac], [b, bc]) => bc - ac || (a ?? "").localeCompare(b ?? "")).slice(0, 10);
}

/** Returns a bounded recent window and optional summary of that exact filtered window.
 * @throws {ToolInputError} For invalid options or denied analytics.read; sink failures propagate.
 * @example buildAnalyticsRegistrations(deps)[0].handler(ctx)
 * @complexity O(limit log limit) time, O(limit) space, limit <= 500; one sink read.
 */
export function buildAnalyticsRegistrations(deps: AnalyticsToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "analytics", catalogModule: "features/analytics/agent-tools.ts", catalog: indexCatalogById({ catalog: analyticsAgentToolCatalog }), derivedRisk: analyticsDerivedRisk, handlers: withModelFacingErrors({ handlers: {
    analytics_list_recent_hits: async ctx => {
      const input = requireInputRecord({ input: ctx.input });
      const requested = input.limit === undefined ? 100 : input.limit;
      if (typeof requested !== "number" || !Number.isFinite(requested) || !Number.isInteger(requested)) throw new ToolInputError({ message: "analytics_list_recent_hits: limit must be a finite integer." });
      if (input.path !== undefined && typeof input.path !== "string") throw new ToolInputError({ message: "analytics_list_recent_hits: path must be a string." });
      if (input.summarize !== undefined && typeof input.summarize !== "boolean") throw new ToolInputError({ message: "analytics_list_recent_hits: summarize must be a boolean." });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "analytics.read" }, { entityType: "analytics-hit" });
      const window = await deps.analyticsSink.list({ limit: Math.max(1, Math.min(500, requested)) });
      const hits = window.filter(hit => input.path === undefined || hit.path === input.path).map(safeHit);
      if (!input.summarize) return { hits };
      const byDeviceClass = new Map<string, number>();
      for (const hit of hits) byDeviceClass.set(hit.deviceClass, (byDeviceClass.get(hit.deviceClass) ?? 0) + 1);
      return { hits, summary: {
        hits: hits.length,
        byPath: topTen(hits.map(hit => hit.path)).map(([path, hits]) => ({ path, hits })),
        byReferrerHost: topTen(hits.map(hit => hit.referrerHost)).map(([referrerHost, hits]) => ({ referrerHost, hits })),
        byDeviceClass: Object.fromEntries(byDeviceClass),
      } };
    },
  }, rules: [forbiddenRule({ domainPrefix: "ANALYTICS", error: ForbiddenError })] }) });
}

/** Contributes only the analytics read domain. */
export function contributeAnalyticsTools(): ToolContributor {
  return { domain: "analytics", build: buildAnalyticsRegistrations, risk: analyticsDerivedRisk };
}
