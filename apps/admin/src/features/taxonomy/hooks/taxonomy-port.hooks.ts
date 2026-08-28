import type { AdminTaxonomyWithTerms, AdminTerm } from "@/lib/api";

/**
 * @file What `useTaxonomy` and `useTermDetailPanel` need from the outside world, as an interface
 * rather than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects` and
 * `features/pages`: this file declares, `taxonomy-dependencies.hooks.ts` binds the real `api`
 * client, and nothing else under `features/taxonomy/hooks` imports `lib/api` for these four routes.
 *
 * Shared between exactly these two hooks — the top-level list screen and the per-term rename
 * form — the "genuinely matches" list/detail pairing named for this feature. `use-merge-term-
 * section.hooks.ts` (a self-contained plan/confirm/execute wizard), `use-new-taxonomy-form.hooks.ts`,
 * and `use-new-term-form.hooks.ts` (single-purpose create forms) each get their own narrow port
 * instead — none of their routes overlap with these four or with each other, and forcing them into
 * this port would be exactly the dishonest shared contract `page-editor-port.hooks.ts`'s own doc
 * comment warns against.
 */
export interface TaxonomyPort {
  listTaxonomies(): Promise<{ items: AdminTaxonomyWithTerms[] }>;
  deleteTerm(termId: string): Promise<{ deletedTermId: string }>;
  deleteTaxonomy(taxonomyId: string): Promise<{ deletedTaxonomyId: string; deletedTermIds: string[] }>;
  renameTerm(target: { termId: string; newName: string }): Promise<{ term: AdminTerm }>;
}
