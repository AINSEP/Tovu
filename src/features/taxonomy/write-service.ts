/**
 * @file The taxonomy write-service's ordinary (non-gated) mutations — re-exported from
 * `@jini-ai/cms/taxonomy`.
 *
 * The single write chokepoint for taxonomies/terms/term-assignments moved into the package on
 * 2026-08-03. It was portable unchanged: every dependency it has (clock, id generation, the repos,
 * the outbox, the watermark stamp, the content lookup) already arrived through `WriteServiceDeps`
 * rather than being imported, so the package names no host module.
 *
 * `mergeTerm` is deliberately not here — it lives in the sibling `merge-term.ts`, isolated because
 * it alone runs a plan/confirm/execute ceremony.
 *
 * This file stays as a re-export rather than being deleted because `server/routes/types.ts` and
 * five `server/routes/admin/taxonomy/*` modules import these ports and error classes by path.
 */
export {
  TAXONOMY_ALLOWED_CONTENT_TYPES,
  isContentTypeOnAllowList,
  TaxonomyRecordNotFoundError,
  TermRecordNotFoundError,
  ContentRecordNotFoundError,
  createTaxonomy,
  createTerm,
  renameTerm,
  assignTerms,
  onContentDeleted,
} from "@jini-ai/cms/taxonomy";

export type {
  AuthorizeFn,
  Taxonomy,
  Term,
  TaxonomyRepoPort,
  TermRepoPort,
  EntryTermRepoPort,
  ContentLookupPort,
  TaxonomyRevisionRow,
  TaxonomyRevisionRepoPort,
  ClockPort,
  IdGeneratorPort,
  WriteServiceDeps,
  CreateTaxonomyRequired,
  CreateTermRequired,
  RenameTermRequired,
  AssignTermsRequired,
  EntryTermsCleanupPort,
  OnContentDeletedRequired,
} from "@jini-ai/cms/taxonomy";
