import { toolMetadata } from '../../contracts/core/tool-metadata/site-evidence.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
// `ToolInputError` specifically — see `features/post/tool-registrations.ts`'s identical import for
// why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather than
// redacting it into a message-stripped 500.
import { ToolInputError } from "@jini-ai/core";

import type { ToolContributor } from "#src/assistant/index";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { OriginNotVerifiedError, type OriginRegistryPort } from "@jini-ai/http-kit/verified-origin";
import { siteEvidenceAgentToolCatalog, SITE_EVIDENCE_TOOL_ID } from "./agent-tools.js";
import { SITE_EVIDENCE_LIMITS, type SiteEvidenceBrowserFactory } from "@jini-ai/diagnostics/web-evidence";
// Browser/privacy rationale: Jini/packages/diagnostics/src/web-evidence/browser-port.ts; serialized DOM rationale: page-structure-script.ts beside it.
import { collectPageEvidence } from "./collect-page-evidence.js";
import { openPlaywrightSiteEvidenceBrowser, type PlaywrightLike } from "@jini-ai/diagnostics/web-evidence/playwright";

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
 *
 * The browser seam for `site_collect_page_evidence`, plus the evidence shapes that cross it,
 * now owned by Jini diagnostics.
 *
 * ---------------------------------------------------------------------------
 * Why a port at all
 * ---------------------------------------------------------------------------
 * A headless browser is a heavyweight, optional, environment-dependent runtime dependency. Three
 * things follow, and the port is what makes all three cheap:
 *
 * 1. **It may be absent.** Tovu is self-hosted; an operator's image may not carry Chromium at all.
 *    `SiteEvidenceBrowserFactory` therefore returns a discriminated result rather than throwing, so
 *    "this deployment cannot observe rendered behaviour" is a first-class, reportable state instead
 *    of a stack trace. The skill's output contract requires it to say `cannot-determine` in exactly
 *    this case, which it can only do if the tool tells it plainly.
 * 2. **It must be testable without one.** Every bound, every same-origin refusal, every redaction
 *    rule in `collect-page-evidence.ts` is exercised against a fake implementing this interface.
 *    Nothing about those rules should require downloading a browser to assert.
 * 3. **Playwright is not the contract.** Jini's `playwright-browser.ts` is one adapter. This Tovu host wiring supplies the optional
 *    module loader, so swapping vendors does not change the collector or evidence contract.
 *
 * ---------------------------------------------------------------------------
 * What this port is NOT allowed to carry
 * ---------------------------------------------------------------------------
 * The evidence types below are the whole contract, and they are deliberately incapable of carrying
 * personal data out of a page:
 *
 * - A cookie's **value is not a field**. Names, domains, flags and the observation phase are; the
 *   value is not modelled, so an adapter has nothing to put it in and a report has nothing to leak.
 * - A request's **body is not a field**, and neither are its headers. Method, host, path, resource
 *   type, phase.
 * - A form control's **value is not a field**. Its selector, name, type, and whether it has an
 *   accessible label are.
 * - Page text is a bounded **excerpt**, capped by the collector, never the full document.
 *
 * This is the same "unrepresentability, not redaction" discipline `same-origin.ts` applies to the
 * URL: a field that does not exist cannot be forgotten in a redaction pass.
 */

const siteEvidenceDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> collectPageEvidence(): one origin lookup + up to 5 GET page loads. Writes nothing, anywhere.
  [SITE_EVIDENCE_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = indexCatalogById({ catalog: siteEvidenceAgentToolCatalog });

/** Resolve the optional browser module from Tovu, including when Jini is linked from another repo. */
const playwrightModuleLoader = {
  // A literal host import checks the native module against the structural port without a cast;
  // dynamic loading still lets Jini report a missing module or browser as unavailable evidence.
  load: async (_required: { moduleName: string }): Promise<PlaywrightLike> => {
    const { chromium } = await import("playwright");
    return {
      chromium: {
        launch: async (options) => {
          const { args, ...launchOptions } = options ?? {};
          const browser = await chromium.launch({ ...launchOptions, ...(args === undefined ? {} : { args: [...args] }) });
          return {
            newContext: async (contextOptions) => {
              const context = await browser.newContext(contextOptions);
              return {
                newPage: () => context.newPage(),
                // Playwright returns a Disposable; the evidence port only awaits registration.
                route: async (pattern, handler) => { await context.route(pattern, handler); },
                cookies: () => context.cookies(),
                close: () => context.close(),
              };
            },
            close: () => browser.close(),
          };
        },
      },
    };
  },
};

// `--no-sandbox` is required to launch Chromium as a non-root user inside a container without
// granting SYS_ADMIN. Acceptable here and only here: this browser opens exactly one origin —
// the operator's own site — never arbitrary attacker-chosen URLs, so the sandbox is not the
// boundary doing the security work; Jini's web-evidence/same-origin.ts is.
const TOVU_BROWSER_LAUNCH_OPTIONS = {
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
};

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
 * @throws {ToolInputError} If `paths` is missing, not an array, empty, or contains a non-string.
 * @complexity O(n) in the array's length.
 */
export function readPathsArgument(input: Readonly<Record<string, unknown>>): readonly string[] {
  const raw = input.paths;
  if (!Array.isArray(raw)) {
    throw new ToolInputError({ message: "'paths' is required and must be an array of site-relative path strings, e.g. ['/', '/legal/privacy']" });
  }
  if (raw.length === 0) {
    throw new ToolInputError({ message: "'paths' must contain at least one site-relative path" });
  }
  const paths: string[] = [];
  for (const [index, value] of raw.entries()) {
    if (typeof value !== "string") {
      throw new ToolInputError({ message: `'paths[${index}]' must be a string, got ${typeof value}` });
    }
    paths.push(value);
  }
  return paths;
}

/**
 * Reads the optional `consentAcceptSelector` and `collectAccessibility` arguments.
 *
 * @throws {ToolInputError} If either is present with the wrong type.
 * @complexity O(1).
 */
export function readOptionalEvidenceArguments(input: Readonly<Record<string, unknown>>): {
  readonly consentAcceptSelector?: string;
  readonly collectAccessibility?: boolean;
} {
  const selector = input.consentAcceptSelector;
  if (selector !== undefined && typeof selector !== "string") {
    throw new ToolInputError({ message: "'consentAcceptSelector' must be a CSS selector string when provided" });
  }
  const collectAccessibility = input.collectAccessibility;
  if (collectAccessibility !== undefined && typeof collectAccessibility !== "boolean") {
    throw new ToolInputError({ message: "'collectAccessibility' must be a boolean when provided" });
  }
  return {
    ...(typeof selector === "string" && selector.trim().length > 0 ? { consentAcceptSelector: selector.trim() } : {}),
    ...(typeof collectAccessibility === "boolean" ? { collectAccessibility } : {}),
  };
}

export function buildSiteEvidenceRegistrations(routeDeps: SiteEvidenceToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [SITE_EVIDENCE_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "content.read" }, { entityType: "post" });

      const paths = readPathsArgument(input);
      const optional = readOptionalEvidenceArguments(input);

      try {
        return await collectPageEvidence(
          {
            workspaceId: routeDeps.workspaceId,
            originRegistry: routeDeps.originRegistry,
            openBrowser: routeDeps.siteEvidenceBrowser ?? (required => openPlaywrightSiteEvidenceBrowser(required, {
              moduleLoader: playwrightModuleLoader,
              launchOptions: TOVU_BROWSER_LAUNCH_OPTIONS,
            })),
            paths,
          },
          optional,
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

  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "site-evidence",
    catalogModule: "features/site-evidence/agent-tools.ts",
    catalog: CATALOG_BY_ID,
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
