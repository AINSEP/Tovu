/**
 * @file The fixed taxonomy validation chains — re-exported from `@jini-ai/cms/taxonomy`.
 *
 * These pure, order-critical decision functions moved into the package on 2026-08-03 so a second
 * host can enforce the same content-join and hierarchy rules. Nothing here is host-specific: the
 * chains take caller-resolved data and perform no repo lookups of their own, which is exactly what
 * made them portable unchanged.
 *
 * This file stays as a re-export rather than being deleted because several `server/routes/admin/
 * taxonomy/*` modules import these error classes by path. Rewriting those call sites is a
 * mechanical change that deserves its own commit — the same reasoning `core/ports.ts` records.
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
} from "@jini-ai/cms/taxonomy";

export type { TermTreeLookup } from "@jini-ai/cms/taxonomy";
