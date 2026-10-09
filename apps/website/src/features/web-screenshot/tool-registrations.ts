import { toolMetadata } from "../../contracts/core/tool-metadata/web-screenshot.js";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { WEB_SCREENSHOT_PERMISSION, webScreenshotAgentToolCatalog } from "./agent-tools.js";
import { createWebScreenshotService, readWebScreenshotInput, WEB_SCREENSHOT_TOOL_ID, type OpenOwnSite, type SaveCaptureFiles, type WebScreenshotPorts, type WebScreenshotService } from "./web-screenshot.js";

/**
 * @file Maps the `web-screenshot` catalog onto {@link createWebScreenshotService}. The handler gates
 * on the same permission the catalog declares (one evaluator, at the handler, per ADR-021 §2).
 *
 * One service per contributor, so the daemon and BYOK surfaces in one process share one browser and
 * one queue. The own-site opener needs the booted site's deps, so the host passes a factory that
 * turns `routeDeps` into one (`openLoopbackSiteServer` over `RouteDeps.createSiteApp`).
 */

const DOMAIN = "web-screenshot";
const CATALOG_BY_ID = indexCatalogById({ catalog: webScreenshotAgentToolCatalog });

export const webScreenshotDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> one headless page load whose every request goes through the egress guard (or this site's own
  // per-call loopback render), plus an image encode. Writes nothing to the site: the only write is
  // the capture JPEGs into `<siteDir>/.captures/` (agent artifacts, see capture-files.ts).
  [WEB_SCREENSHOT_TOOL_ID, "none"],
]);

export interface WebScreenshotToolDeps { workspaceId: string; authorize: AuthorizeFn }

export function buildWebScreenshotRegistrations(
  { routeDeps, service }: { routeDeps: WebScreenshotToolDeps; service: WebScreenshotService },
  { openOwnSite, saveCaptureFiles }: { openOwnSite?: OpenOwnSite; saveCaptureFiles?: SaveCaptureFiles } = {},
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [WEB_SCREENSHOT_TOOL_ID]: async (ctx) => {
      const input = readWebScreenshotInput(requireInputRecord({ input: ctx.input }));
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: WEB_SCREENSHOT_PERMISSION }, { entityType: "web-page" });
      return service.screenshot({ input, ...(openOwnSite ? { openOwnSite } : {}), ...(saveCaptureFiles ? { saveCaptureFiles } : {}) }, ctx.signal ? { signal: ctx.signal } : {});
    },
  };
  return buildDomainRegistrations({ metadata: toolMetadata, domain: DOMAIN, catalogModule: "features/web-screenshot/agent-tools.ts", catalog: CATALOG_BY_ID, handlers, derivedRisk: webScreenshotDerivedRisk });
}

/**
 * Contributes `web_screenshot_page` — called once by `tool-catalog-manifest.ts`'s
 * `installFirstPartyToolContributors()`, which owns the guarded client and the Playwright adapter.
 * Nothing launches at registration; Chromium starts on the first call.
 * @param required.ports - Capture adapter, tile encoder, clock and optional observer.
 * @param optional.openOwnSiteFor - Builds the own-site opener from the booted site's deps; omitted, `sitePath` is refused.
 * @param optional.saveCaptureFilesFor - Builds the capture writer for the booted site's folder; omitted, captures are not saved.
 */
export function contributeWebScreenshotTools(
  { ports }: { ports: WebScreenshotPorts },
  { openOwnSiteFor, saveCaptureFilesFor }: {
    openOwnSiteFor?: (routeDeps: Parameters<ToolContributor["build"]>[0]) => OpenOwnSite;
    saveCaptureFilesFor?: (routeDeps: Parameters<ToolContributor["build"]>[0]) => SaveCaptureFiles;
  } = {},
): ToolContributor {
  const service = createWebScreenshotService({ ports });
  return {
    domain: DOMAIN,
    build: (routeDeps) => buildWebScreenshotRegistrations({ routeDeps, service }, {
      ...(openOwnSiteFor ? { openOwnSite: openOwnSiteFor(routeDeps) } : {}),
      ...(saveCaptureFilesFor ? { saveCaptureFiles: saveCaptureFilesFor(routeDeps) } : {}),
    }),
    risk: webScreenshotDerivedRisk,
  };
}
