import { toolMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type DerivedRiskByToolId, type ToolRegistration, type AgentToolDefinition } from "@jini-ai/core";
import { requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import type { DiscoveredTheme } from "./theme.js";
import { setThemePagePublished, ThemePagePublicationError } from "./page-publication.js";
import { ThemePathError } from "./theme-files.js";

/** Same service dependencies as the admin page-publication route. */
export interface Deps { workspaceId: string; authorize: AuthorizeFn; themes: DiscoveredTheme[]; themesDir: string; }
export const catalog: AgentToolDefinition[] = [{
  name: "theme_set_page_published",
  description: "Publishes or unpublishes one standalone page in a static theme, such as about or pricing. Call to show or hide that theme page on the live site. Returns {page, published, publishedPages}. Reversible: set published to the opposite value to undo. Does not publish CMS posts, push content to a remote site, switch the active theme, or publish index/404/template shells. Missing themes, non-static tiers and ineligible pages are refused.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: "theme.set" },
  inputSchema: { type: "object", additionalProperties: false, required: ["themeId", "page", "published"], properties: {
    themeId: { type: "string", minLength: 1 }, page: { type: "string", minLength: 1, description: "Standalone page id, without .html, for example about." }, published: { type: "boolean" },
  } },
}];
export const derivedRisk: DerivedRiskByToolId = new Map([
  // setThemePagePublished -> writeThemeFile(theme.json) + reload live themes: durable file write.
  ["theme_set_page_published", "mutates-durable-state"],
]);

/**
 * Wires the shared page-publication service after authorization and shape validation.
 * @param deps - Workspace, permission checker and theme service dependencies.
 * @returns One reversible mutation registration.
 * @throws ToolInputError for expected refusals; unexpected service faults propagate.
 * @complexity O(1) wiring; execution follows setThemePagePublished.
 */
export function buildRegistrations(deps: Deps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "theme-set-page-published", catalogModule: "features/theme/page-publish-tool.ts", catalog: indexCatalogById({ catalog: catalog }), derivedRisk,
    handlers: { theme_set_page_published: async ctx => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "theme.set" }, { entityType: "presentation" });
      const input = requireInputRecord({ input: ctx.input });
      if (typeof input.themeId !== "string" || input.themeId.trim() === "") throw new ToolInputError({ message: "themeId must be a non-empty string." });
      if (typeof input.page !== "string" || input.page.trim() === "") throw new ToolInputError({ message: "page must be a non-empty string." });
      if (typeof input.published !== "boolean") throw new ToolInputError({ message: "published must be a boolean." });
      try {
        return setThemePagePublished(deps, { themeId: input.themeId, page: input.page, published: input.published });
      } catch (error) {
        if (error instanceof ThemePagePublicationError || error instanceof ThemePathError) throw new ToolInputError({ message: error.message });
        throw error;
      }
    } },
  });
}

/** Contributes its own domain, preserving the theme file-operation tools. */
export function contributeThemeSetPagePublishedTools(): ToolContributor {
  return { domain: "theme-set-page-published", build: buildRegistrations, risk: derivedRisk };
}
