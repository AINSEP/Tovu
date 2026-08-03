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
 * `taxonomy_execute_merge_term` remains declared-but-unwired — see the package copy's own header
 * for the full merge safety analysis and why the exclusion is enforced twice over.
 */
export { taxonomyAgentToolCatalog } from "@jini-ai/cms/taxonomy";

export type {
  TaxonomyAgentToolDefinition as AgentToolDefinition,
  TaxonomyAgentToolSideEffect as AgentToolSideEffect,
  TaxonomyAgentToolActorClassRule as AgentToolActorClassRule,
} from "@jini-ai/cms/taxonomy";
