import { withToolMetadata, type ApprovalAnswer, type ToolExecutionContext, type ToolExecutionOptions, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildSearchToolRegistrations, derivedRisk, SEARCH_TOOL_DOMAIN, type SearchApprovalDescription } from "@jini-ai/search/tools";

import type { ToolContributor } from "#src/assistant/index";
import type { ChatDeleteSurfaceDeps } from "#src/contracts/core/chat-delete-grant";
import type { AuthorizeFn } from "#src/contracts/core/commands/index";
import { requireHumanConfirm, type HumanConfirmSpec } from "#src/contracts/core/human-confirm";
import { toolMetadata } from "#src/contracts/core/tool-metadata/search";
import type { SiteSearchRuntime } from "./modules/site-search.js";

/**
 * @file The admin assistant's site-search tools (lot S6): `@jini-ai/search/tools`' four
 * registrations (`search_query`, `search_status`, `search_reindex`, `search_set_provider`) bound to
 * this site's search runtime, Tovu's permission check and its held-open human-confirm card.
 *
 * Lives beside the other composition-owned contributors (`site-guide-tools.ts`,
 * `assistant-history-tools.ts`) because its whole job is binding: the runtime is built by
 * `modules/site-search.ts` and reaches here on `RouteDeps.siteSearch`. A composition without that
 * runtime (the in-memory roots) contributes no search tools rather than tools that always fail.
 *
 * The two writes ask the human through `requireHumanConfirm` — the same exchange, dialog and
 * fail-closed classification every confirmed tool uses — so each tool id is a literal here: the
 * MCP-UI allowlist scan (`mcp-ui-allowlist-completeness.test.ts`) resolves it, and the click is
 * admitted because both ids are `confirmation: 'plan'` in `contracts/core/tool-metadata/search.ts`.
 */

export const SEARCH_REINDEX_TOOL_ID = "search_reindex";
export const SEARCH_SET_PROVIDER_TOOL_ID = "search_set_provider";

/** The slice of the assistant's route deps these tools read. */
export interface SiteSearchToolHostDeps {
  readonly workspaceId: string;
  readonly authorize: AuthorizeFn;
  /** Built by `modules/site-search.ts`; absent in compositions without search. */
  readonly siteSearch?: SiteSearchRuntime;
}

/**
 * The confirmation card for one approval (everything except the tool id the caller pins).
 * @complexity O(1).
 */
export function searchApprovalDialog(required: { readonly description: SearchApprovalDescription }, _optional: Record<string, never> = {}): Omit<HumanConfirmSpec, "toolId"> {
  const { description } = required;
  const reindex = description.action === "reindex";
  return {
    errorCode: "SEARCH",
    title: reindex ? "Rebuild the site search index?" : "Switch the site search provider?",
    description: description.summary,
    details: [
      { label: "Provider", value: description.providerId },
      { label: "Current provider", value: description.fromProviderId ?? "none" },
      { label: "Site", value: description.siteId },
    ],
    warning: "Every public page and post is written to this provider. A hosted search service may charge for the writes. The current index keeps answering searches until the new one is complete.",
    confirmLabel: reindex ? "Rebuild index" : "Switch provider",
  };
}

/** Ask the human, under the calling tool's own id (each id literal, for the allowlist scan). */
function askSearchApproval(
  required: { ctx: ToolExecutionContext; surfaces: ChatDeleteSurfaceDeps; description: SearchApprovalDescription },
  optional: ToolExecutionOptions,
): Promise<ApprovalAnswer> {
  const { ctx, surfaces, description } = required;
  const dialog = searchApprovalDialog({ description });
  return description.action === "reindex"
    ? requireHumanConfirm({ ctx, surfaces, spec: { toolId: SEARCH_REINDEX_TOOL_ID, ...dialog } }, optional)
    : requireHumanConfirm({ ctx, surfaces, spec: { toolId: SEARCH_SET_PROVIDER_TOOL_ID, ...dialog } }, optional);
}

/**
 * The four search tool registrations for this site, carrying their reviewed metadata.
 * @param routeDeps - Site scope, authorization and the search runtime.
 * @param surfaces - The assistant's surface exchanges (the human-confirm transport).
 * @returns `[]` when this composition has no search runtime.
 * @complexity O(1) wiring.
 */
export function buildSiteSearchToolRegistrations(routeDeps: SiteSearchToolHostDeps, surfaces: ChatDeleteSurfaceDeps): ToolRegistration[] {
  const runtime = routeDeps.siteSearch;
  if (!runtime) return [];
  const registrations = buildSearchToolRegistrations({
    workspaceId: runtime.workspaceId, siteId: runtime.siteId,
    service: runtime.service, indexer: runtime.indexer, registry: runtime.registry,
    requirePermission: ({ principalId, permission }) => requireToolPermission(
      { authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId, permission },
      { entityType: "search" },
    ),
    askHuman: ({ ctx, description }, optional) => askSearchApproval({ ctx, surfaces, description }, optional),
    setProviderSetting: ({ principalId, providerId }) => runtime.writeProviderSetting({ principalId, providerId }),
  });
  return withToolMetadata({ registrations, metadata: toolMetadata });
}

/** The `search` domain contributor for `installFirstPartyToolContributors`. */
export function contributeSiteSearchTools(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): ToolContributor {
  return { domain: SEARCH_TOOL_DOMAIN, build: buildSiteSearchToolRegistrations, risk: derivedRisk };
}
