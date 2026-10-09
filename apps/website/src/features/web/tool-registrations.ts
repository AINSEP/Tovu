import { toolMetadata } from '../../contracts/core/tool-metadata/web.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { createSystemClock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { createRateLimiter, type RateLimitProfile } from "../../contracts/core/rate-limit/rate-limit.js";
import { WEB_READ_PERMISSION, webAgentToolCatalog } from "./agent-tools.js";
import { fetchWebPage, readWebFetchInput, type WebFetchPorts } from "./web-page.js";

/**
 * @file Maps the `web` catalog onto {@link fetchWebPage}. Every catalog entry is wired, so a future
 * entry without a handler fails the build. The handler gates on the same permission the catalog
 * declares (one evaluator, at the handler, per ADR-021 §2).
 */

const DOMAIN = "web";
const CATALOG_BY_ID = indexCatalogById({ catalog: webAgentToolCatalog });

/** This layer's own risk classification, cross-checked against the catalog's `sideEffects`. */
export const webDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> fetchWebPage(): one guarded, credential-free GET (plus followed redirects); writes nothing.
  ["web_fetch_page", "none"],
]);

/**
 * Politeness toward the TARGET site, counted per workspace and host: an import that walks a whole
 * sitemap stays well under it, while a looping agent cannot hammer someone else's server.
 */
export const WEB_FETCH_PER_HOST: RateLimitProfile = { windowSeconds: 60, max: 30, burst: 0 };

export interface WebToolDeps { workspaceId: string; authorize: AuthorizeFn }

export function buildWebRegistrations(routeDeps: WebToolDeps, ports: WebFetchPorts): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    web_fetch_page: async ctx => {
      const input = readWebFetchInput(requireInputRecord({ input: ctx.input }));
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: WEB_READ_PERMISSION }, { entityType: "web-page" });
      return fetchWebPage({ input, ports, rateLimitScope: routeDeps.workspaceId }, { signal: ctx.signal });
    },
  };
  return buildDomainRegistrations({ metadata: toolMetadata, domain: DOMAIN, catalogModule: "features/web/agent-tools.ts", catalog: CATALOG_BY_ID, handlers, derivedRisk: webDerivedRisk });
}

/**
 * Contributes the `web` tools — called once by `tool-catalog-manifest.ts`'s
 * `installFirstPartyToolContributors()`, which owns the guarded client (`WEB_FETCH_EGRESS_POLICY`).
 * One limiter per contributor, so the daemon and BYOK surfaces in one process share the budget.
 * @param required.httpClient - Guarded egress client; never a raw transport.
 * @param required.htmlToMarkdown - The HTML -> Markdown converter.
 * @param optional.rateLimiter - Defaults to an in-memory {@link WEB_FETCH_PER_HOST} limiter.
 */
export function contributeWebTools(
  { httpClient, htmlToMarkdown }: Pick<WebFetchPorts, "httpClient" | "htmlToMarkdown">,
  { rateLimiter, observeFetch, nowMs }: Partial<Pick<WebFetchPorts, "rateLimiter" | "observeFetch" | "nowMs">> = {},
): ToolContributor {
  const clock = createSystemClock();
  const ports: WebFetchPorts = {
    httpClient, htmlToMarkdown,
    nowMs: nowMs ?? (() => clock.nowMs()),
    rateLimiter: rateLimiter ?? createRateLimiter({ profile: WEB_FETCH_PER_HOST, clock }),
    observeFetch: observeFetch ?? (event => console.info(JSON.stringify({ timestamp: new Date().toISOString(), level: "info", service: "web", message: "web_fetch_page", context: event }))),
  };
  return { domain: DOMAIN, build: deps => buildWebRegistrations(deps, ports), risk: webDerivedRisk };
}
