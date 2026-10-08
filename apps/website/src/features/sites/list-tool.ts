import { toolMetadata } from '../../contracts/core/tool-metadata/sites.js';
import { buildDomainRegistrations, indexCatalogById, type DerivedRiskByToolId, type ToolRegistration, type AgentToolDefinition } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { includeServingSite, listSitesForBinding, readPersistedActiveSite, isSiteSwitcherEnabled, switcherBaseForBinding, type ListSitesOptional, type SiteBinding, type SiteListEntry } from "#src/platform/site-dir/index";

/** The boot binding is supplied by composition, never re-derived from current environment. */
export interface Deps { workspaceId: string; authorize: AuthorizeFn; siteBinding: SiteBinding; listSites?: (optional?: ListSitesOptional) => readonly SiteListEntry[]; readPersistedActiveSite?: (optional?: { cwd?: string }) => string | null; isSiteSwitcherEnabled?: () => boolean; }

/** Catalog for the admin service exposed through this standalone contributor. */
export const catalog: AgentToolDefinition[] = [{
  name: "sites_list",
  description: "Lists local client sites on this computer and the site currently serving. Call before sites_duplicate_site to find a source name, or to distinguish the running site from a queued switch for next restart. Returns {sites, currentSite, persistedSiteName, switchingEnabled}; includes the served directory even when unregistered. Read-only and available when site switching is disabled. Does not create, switch or duplicate sites.",
  sideEffects: "none",
  authorization: { permission: "system.read" },
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
}];
/** Independently derived from the service calls below. */
export const derivedRisk: DerivedRiskByToolId = new Map([
  // listSites + includeServingSite + readPersistedActiveSite + capability flag: reads only.
  ["sites_list", "none"],
]);
/**
 * Builds the handler with injectable admin-service dependencies.
 * @param deps - Workspace, authorization and service ports.
 * @returns One registration; readOnly follows the independently checked risk.
 * @throws Authorization and service failures propagate; absence is returned as a read model.
 * @complexity O(1) wiring; handler cost follows the wrapped service.
 */
export function buildRegistrations(deps: Deps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "sites-list", catalogModule: "features/sites/list-tool.ts",
    catalog: indexCatalogById({ catalog }), derivedRisk,
    handlers: { sites_list: async ctx => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "system.read" }, { entityType: "site-registry" });
      // Rooted at the served binding, never `process.cwd()` — see `switcherBaseForBinding`'s doc.
      const binding = deps.siteBinding;
      const switcherBase = switcherBaseForBinding(binding);
      const sites = includeServingSite({ sites: listSitesForBinding({ binding }, { listSites: deps.listSites }), binding });
      const serving = sites.find(site => site.dir === binding.dir);
      return { switchingEnabled: (deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabled)(), sites,
        currentSite: { ...binding, listed: serving?.registration === "registered" },
        persistedSiteName: switcherBase === null ? null : (deps.readPersistedActiveSite ?? readPersistedActiveSite)({ cwd: switcherBase }) };
    } },
  });
}
/** Installs this distinct domain without replacing its existing sibling tools. */
export function contributeSitesListTools(): ToolContributor {
  return { domain: "sites-list", build: buildRegistrations, risk: derivedRisk };
}
