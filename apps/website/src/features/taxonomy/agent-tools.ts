/**
 * @file The Taxonomy agent-tool catalog — re-exported from `@jini-ai/cms/taxonomy`.
 *
 * A static, in-process description of every agent-callable tool this domain exposes. It ported
 * unchanged: the catalog is data plus its own local type definitions, naming no host module.
 *
 * The package barrel prefixes the three shared type names (`AgentToolDefinition` and friends) with
 * `Taxonomy` so several domains can export a catalog surface from one package without colliding.
 * They are aliased back here so this host's existing imports keep working.
 *
 * `taxonomy_execute_merge_term` is wired behind a human confirm in chat (2026-09-24) — see the
 * package copy's own header and `tool-registrations.ts`.
 */
import { type AgentToolDefinition as TaxonomyAgentToolDefinition } from "@jini-ai/core";
import { taxonomyAgentToolCatalog as sharedCatalog } from "@jini-ai/cms/taxonomy";

/** Extends the shared write catalog locally; no new contributor replaces the taxonomy domain. */
export const taxonomyAgentToolCatalog: TaxonomyAgentToolDefinition[] = [...sharedCatalog, {
  name: "taxonomy_get_assigned_terms",
  description: "Reads which tags, categories or taxonomy terms are assigned to a post, page or live collection entry. Use to show the tags on this post or categories on this page before changing them. Returns {contentType, contentId, terms:[{termId,name,slug,taxonomyId,taxonomyName}]} sorted by taxonomy then term name; untagged content returns an empty terms array. Slugs are derived from term names, since terms have no stored slug. Does not change assignments. Requires admin.taxonomy.manage and the content's edit permission; unknown content types are refused. Use taxonomy_list for all available terms, taxonomy_assign_terms to add them.",
  sideEffects: "none",
  authorization: { permission: "admin.taxonomy.manage" },
  inputSchema: { type: "object", additionalProperties: false, required: ["contentType", "contentId"], properties: {
    contentType: ((sharedCatalog.find(tool => tool.name === "taxonomy_assign_terms")!.inputSchema!.properties) as Record<string, unknown>).contentType,
    contentId: { type: "string", minLength: 1 },
  } },
}];

export type { AgentToolDefinition, AgentToolSideEffect, AgentToolActorClassRule } from "@jini-ai/core";
