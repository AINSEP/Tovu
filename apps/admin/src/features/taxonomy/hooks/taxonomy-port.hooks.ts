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
 *
 * `trashTerm`/`trashTaxonomy` (T8b, 2026-09-21): replace the old `deleteTerm`/`deleteTaxonomy` pair
 * — the per-domain `DELETE /taxonomy/terms/:id`/`DELETE /taxonomy/:id` routes are gone. Both now go
 * through the generic single-item Trash route (`api.trash({ type: "term" | "taxonomy", id })`,
 * `taxonomy-dependencies.hooks.ts`), the same route every other admin delete button uses — see
 * `widgets-port.hooks.ts`'s `trashWidget` for the identical precedent. Object-argument shape (`{
 * id }`) rather than a bare string, matching this workspace's exported/boundary-function convention.
 */
export interface TaxonomyPort {
  listTaxonomies(): Promise<{ items: AdminTaxonomyWithTerms[] }>;
  trashTerm(target: { id: string }): Promise<{ ok: true; version: number | null }>;
  trashTaxonomy(target: { id: string }): Promise<{ ok: true; version: number | null }>;
  renameTerm(target: { termId: string; newName: string }): Promise<{ term: AdminTerm }>;
}
