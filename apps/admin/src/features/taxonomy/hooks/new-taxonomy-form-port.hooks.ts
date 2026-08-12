import type { AdminTaxonomy } from "../../../lib/api";

/**
 * @file What `useNewTaxonomyForm` needs from the outside world, as an interface rather than a
 * direct `lib/api` import.
 *
 * A separate port from `taxonomy-port.hooks.ts` and the other taxonomy ports: `createTaxonomy` is
 * this form's only route, shared with none of `TaxonomyPort`'s four, `MergeTermSectionPort`'s
 * three, or `NewTermFormPort`'s one — narrowing to what this hook actually consumes, per
 * `page-editor-port.hooks.ts`'s "narrowing here is not a shared contract, it is this hook's own
 * consumption" reasoning.
 */
export interface NewTaxonomyFormPort {
  createTaxonomy(input: { name: string; hierarchical: boolean }): Promise<{ taxonomy: AdminTaxonomy }>;
}
