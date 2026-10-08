/**
 * @file Public surface (barrel) for taxonomy — re-exported from `@jini-ai/cms/taxonomy`.
 *
 * Jini owns taxonomy, hierarchy and term assignment. SQLite adapters bind the site's schema;
 * `gated-hooks.ts` composes the host's gated-mutation kernel, and `tool-registrations.ts` binds
 * its gateway to the assistant's uniform domain registration seam.
 * This barrel omits SQLite, hooks and registrations so consumers cannot accidentally depend
 * on the host's persistence or gateway choice.
 */
export {
  TaxonomyNotApplicableError,
  WorkspaceMismatchError,
  ContentTypeMismatchError,
  TaxonomyNotHierarchicalError,
  ParentCrossTaxonomyError,
  TermNotFoundError,
  HierarchyCycleDetectedError,
  wouldCreateCycle,
  validateContentJoin,
  validateHierarchyAssignment,
  TAXONOMY_ALLOWED_CONTENT_TYPES,
  isContentTypeOnAllowList,
  TaxonomyRecordNotFoundError,
  TermRecordNotFoundError,
  ContentRecordNotFoundError,
  createTaxonomy,
  createTerm,
  renameTerm,
  assignTerms,
  unassignTerms,
  deleteTerm,
  deleteTaxonomy,
  TermHasAssignedContentError,
  TermHasChildTermsError,
  TaxonomyHasAssignedContentError,
  onContentDeleted,
  listTaxonomiesWithTerms,
  SameTermMergeError,
  planMergeTerm,
  confirmMergeTerm,
  executeMergeTerm,
  InMemoryTaxonomyRepo,
  InMemoryTermRepo,
  InMemoryEntryTermRepo,
  InMemoryTaxonomyRevisionRepo,
  InMemoryContentLookup,
  noopStampWatermark,
  toTaxonomyOutbox,
  createPostBackedContentLookup,
  createContentLookup,
  taxonomyAgentToolCatalog,
  importTaxonomy,
  importTerm,
  TaxonomyVersionConflictError,
} from "@jini-ai/cms/taxonomy";

export type { TermTreeLookup, AuthorizeFn, Taxonomy, Term, TaxonomyRepoPort, TermRepoPort, EntryTermRepoPort, ContentLookupPort, ContentRecordLookupPort, EntryRecordLookupPort, ContentTypeTaxonomyPolicyPort, TaxonomyRevisionRow, TaxonomyRevisionRepoPort, WriteServiceDeps, CreateTaxonomyRequired, CreateTermRequired, RenameTermRequired, AssignTermsRequired, UnassignTermsRequired, UnassignableEntryTermRepoPort, DeleteTermRequired, DeleteTaxonomyRequired, DeletableTaxonomyRepoPort, DeletableTermRepoPort, AssignmentCountEntryTermRepoPort, TransactionalRepoPort, EntryTermsCleanupPort, OnContentDeletedRequired, TaxonomyListPort, TermListPort, TaxonomyWithTerms, MergeTermPlanDetails, PlanMergeTermRequired, ConfirmMergeTermRequired, ExecuteMergeTermRequired, ImportableTaxonomyRepoPort, ImportableTermRepoPort } from "@jini-ai/cms/taxonomy";
export type { Clock as ClockPort, IdGenerator as IdGeneratorPort } from "@jini-ai/core/primitives";
export type { AgentToolDefinition as TaxonomyAgentToolDefinition, AgentToolSideEffect as TaxonomyAgentToolSideEffect, AgentToolActorClassRule as TaxonomyAgentToolActorClassRule } from "@jini-ai/core";
