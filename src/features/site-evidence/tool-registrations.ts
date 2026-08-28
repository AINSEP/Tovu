import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type UUID,
} from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { OriginNotVerifiedError, type OriginRegistryPort } from "../../origin/index.js";
import { siteEvidenceAgentToolCatalog, SITE_EVIDENCE_TOOL_ID, type AgentToolDefinition } from "./agent-tools.js";
import type { SiteEvidenceBrowserFactory } from "./browser-port.js";
import { collectPageEvidence, SITE_EVIDENCE_LIMITS } from "./collect-page-evidence.js";
import { openPlaywrightSiteEvidenceBrowser } from "./playwright-browser.js";

/**
 * @file Wires `site_collect_page_evidence` into the assistant's tool catalog, through the same
 * `buildDomainRegistrations` gate and the same `registerToolContributor` seam every other
 * first-party domain uses.
 *
 * **Authorization.** `content.read`, checked inline. The tool reads this workspace's own published
 * pages, which is exactly what that permission already governs for `content_post_list`/`pages_read_html`
 * — a principal who may read the site's content may read the site's rendered content. Stated plainly
 * rather than implied: this tool ALSO returns response headers and attempted-request hosts, which is
 * slightly wider than page bodies. That is a deliberate call, not an oversight — those facts are
 * observable by anyone who can open the site in a browser, so gating them behind an operator-level
 * permission would restrict something the public can already see while leaving the page body (the
 * genuinely privileged part on an unpublished draft) at `content.read` anyway.
 *
 * **Why the browser factory is optional in the deps.** `RouteDeps` has no browser field and should
 * not grow one: a headless browser is not a route dependency, it is an on-demand subprocess this one
 * tool launches per call and closes in a `finally`. Defaulting to
 * {@link openPlaywrightSiteEvidenceBrowser} keeps `SiteEvidenceToolDeps` structurally satisfied by
 * the existing `RouteDeps` with no composition-root change, while the optional field is the seam a
 * test substitutes a fake through. No browser is launched at registration time — only inside a
 * handler call.
 */

const siteEvidenceDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> collectPageEvidence(): one origin lookup + up to 5 GET page loads. Writes nothing, anywhere.
  [SITE_EVIDENCE_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = indexCatalogById(siteEvidenceAgentToolCatalog);

export interface SiteEvidenceToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  originRegistry: OriginRegistryPort;
  /** Test seam. Absent in production, where {@link openPlaywrightSiteEvidenceBrowser} is used. */
  siteEvidenceBrowser?: SiteEvidenceBrowserFactory;
}

/**
 * Reads and validates the tool's `paths` argument.
 *
 * Kept separate from the handler so the argument rules are directly assertable without a browser,
 * an origin registry, or a principal. Rejects a non-array or an array containing a non-string
 * outright — those are caller bugs a model can fix on its next turn, and reporting them as
 * per-path `skipped` entries would bury the shape error inside a result that otherwise looks like a
 * successful run.
 *
 * @throws {Error} If `paths` is missing, not an array, empty, or contains a non-string.
 * @complexity O(n) in the array's length.
 */
export function readPathsArgument(input: Readonly<Record<string, unknown>>): readonly string[] {
  const raw = input.paths;
  if (!Array.isArray(raw)) {
    throw new Error("'paths' is required and must be an array of site-relative path strings, e.g. ['/', '/legal/privacy']");
  }
  if (raw.length === 0) {
    throw new Error("'paths' must contain at least one site-relative path");
  }
  const paths: string[] = [];
  for (const [index, value] of raw.entries()) {
    if (typeof value !== "string") {
      throw new Error(`'paths[${index}]' must be a string, got ${typeof value}`);
    }
    paths.push(value);
  }
  return paths;
}

/**
 * Reads the optional `consentAcceptSelector` and `collectAccessibility` arguments.
 *
 * @throws {Error} If either is present with the wrong type.
 * @complexity O(1).
 */
export function readOptionalEvidenceArguments(input: Readonly<Record<string, unknown>>): {
  readonly consentAcceptSelector?: string;
  readonly collectAccessibility?: boolean;
} {
  const selector = input.consentAcceptSelector;
  if (selector !== undefined && typeof selector !== "string") {
    throw new Error("'consentAcceptSelector' must be a CSS selector string when provided");
  }
  const collectAccessibility = input.collectAccessibility;
  if (collectAccessibility !== undefined && typeof collectAccessibility !== "boolean") {
    throw new Error("'collectAccessibility' must be a boolean when provided");
  }
  return {
    ...(typeof selector === "string" && selector.trim().length > 0 ? { consentAcceptSelector: selector.trim() } : {}),
    ...(typeof collectAccessibility === "boolean" ? { collectAccessibility } : {}),
  };
}

export function buildSiteEvidenceRegistrations(routeDeps: SiteEvidenceToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [SITE_EVIDENCE_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "content.read",
        entityType: "post",
      });

      const paths = readPathsArgument(input);
      const optional = readOptionalEvidenceArguments(input);

      try {
        return await collectPageEvidence(
          {
            workspaceId: routeDeps.workspaceId as UUID,
            originRegistry: routeDeps.originRegistry,
            openBrowser: routeDeps.siteEvidenceBrowser ?? openPlaywrightSiteEvidenceBrowser,
          },
          { paths, ...optional },
        );
      } catch (error) {
        if (error instanceof OriginNotVerifiedError) {
          // Returned as model-facing data rather than thrown: this is an operator configuration gap
          // the model can report and route around, not a bug. Guessing an origin from a request
          // host is what ADR-040 F2 exists to forbid, so there is no fallback to offer — only an
          // accurate explanation of why nothing could be observed.
          return {
            collected: false,
            reason:
              "This workspace has no verified canonical origin registered, so there is no site origin to " +
              "load pages from. Rendered-page evidence cannot be collected here. Report this as " +
              "'cannot-determine' and ask the operator to register the site's public origin.",
            limits: SITE_EVIDENCE_LIMITS,
          };
        }
        throw error;
      }
    },
  };

  return buildDomainRegistrations({
    domain: "site-evidence",
    catalogModule: "features/site-evidence/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, AgentToolDefinition>,
    handlers,
    derivedRisk: siteEvidenceDerivedRisk,
  });
}

export { siteEvidenceDerivedRisk };

/**
 * Contributes the site-evidence tool to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 */
export function contributeSiteEvidenceTools(): ToolContributor {
  return { domain: "site-evidence", build: buildSiteEvidenceRegistrations, risk: siteEvidenceDerivedRisk };
}
