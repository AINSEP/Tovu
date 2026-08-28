import { api, ApiError, type AdminTaxonomyWithTerms, type AdminTerm } from "@/lib/api";
import type { TaxonomyPort } from "./taxonomy-port.hooks";

/**
 * @file The only place under `features/taxonomy/hooks` that reaches `lib/api` for
 * `useTaxonomy`/`useTermDetailPanel`'s four routes — see `taxonomy-port.hooks.ts` for why the
 * split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. */
export const defaultTaxonomyPort: TaxonomyPort = {
  listTaxonomies: () => api.listTaxonomies(),
  deleteTerm: (termId) => api.deleteTerm(termId),
  deleteTaxonomy: (taxonomyId) => api.deleteTaxonomy(taxonomyId),
  renameTerm: (target) => api.renameTerm(target),
};

/** Seed state for {@link createFakeTaxonomyPort}. */
export interface FakeTaxonomyPortOptions {
  groups?: AdminTaxonomyWithTerms[];
  /** Set to make the next `deleteTerm`/`deleteTaxonomy` call throw a 409-shaped `ApiError`, the
   *  same shape `describeDeleteBlocked` reads — see that rule for the recognized `code`s. */
  onDeleteTermBlocked?: (termId: string) => { code: string; assignedCount?: number; childCount?: number } | undefined;
  onDeleteTaxonomyBlocked?: (
    taxonomyId: string
  ) => { code: string; assignedCount?: number; childCount?: number } | undefined;
}

/** Builds a real {@link ApiError} for a blocked-delete seed — `describeDeleteBlocked` (rules.ts)
 *  narrows on `e instanceof ApiError`, so a plain `Error` with the same fields would silently fall
 *  through to the hard-error branch instead of the blocked one; the fake must throw the real class. */
function blockedError(fields: { code: string; assignedCount?: number; childCount?: number }): ApiError {
  return new ApiError(fields.code, 409, fields.code, fields as Record<string, unknown>);
}

/**
 * An in-memory {@link TaxonomyPort} for tests — the fake that lets a test describe "this taxonomy
 * has these terms" or "this delete is blocked" directly, instead of hand-building fetch
 * `Response`s. Shipped alongside the real binding per the pattern's "every port gets a fake" rule
 * (see `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeTaxonomyPort(options: FakeTaxonomyPortOptions = {}): TaxonomyPort & {
  /** Every taxonomy group currently in the fake's store, in list order. */
  readonly groups: AdminTaxonomyWithTerms[];
} {
  const groups = [...(options.groups ?? [])];

  function findTerm(termId: string): { group: AdminTaxonomyWithTerms; term: AdminTerm } | undefined {
    for (const group of groups) {
      const term = group.terms.find((t) => t.id === termId);
      if (term) return { group, term };
    }
    return undefined;
  }

  return {
    groups,

    async listTaxonomies() {
      return { items: [...groups] };
    },

    async deleteTerm(termId) {
      const blocked = options.onDeleteTermBlocked?.(termId);
      if (blocked) throw blockedError(blocked);
      const found = findTerm(termId);
      if (!found) throw new Error(`fake taxonomy port: unknown term ${termId}`);
      found.group.terms = found.group.terms.filter((t) => t.id !== termId);
      return { deletedTermId: termId };
    },

    async deleteTaxonomy(taxonomyId) {
      const blocked = options.onDeleteTaxonomyBlocked?.(taxonomyId);
      if (blocked) throw blockedError(blocked);
      const index = groups.findIndex((g) => g.taxonomy.id === taxonomyId);
      if (index < 0) throw new Error(`fake taxonomy port: unknown taxonomy ${taxonomyId}`);
      const [removed] = groups.splice(index, 1);
      return { deletedTaxonomyId: taxonomyId, deletedTermIds: removed!.terms.map((t) => t.id) };
    },

    async renameTerm({ termId, newName }) {
      const found = findTerm(termId);
      if (!found) throw new Error(`fake taxonomy port: unknown term ${termId}`);
      const updated = { ...found.term, name: newName };
      found.group.terms = found.group.terms.map((t) => (t.id === termId ? updated : t));
      return { term: updated };
    },
  };
}
