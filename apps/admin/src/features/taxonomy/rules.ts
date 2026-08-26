import { ApiError, describeApiError, type AdminTaxonomyWithTerms, type AdminTerm } from "../../lib/api";
import type { QueryKey } from "../../lib/fetch-query";

/**
 * @file Pure logic for the `taxonomy` feature — everything that computes a value rather than
 * rendering one.
 *
 * Follows the `rules.ts` convention `features/posts/rules.ts` establishes. `termDepth` was already
 * a module-level helper in `Taxonomy.tsx`; `otherMergeTargets` and `findSelectedTerm` were inline
 * derivations (a `.filter()` call, a `useMemo` body) that compute a value from their inputs, so per
 * that convention they move here too.
 *
 * `describeDeleteBlocked` (web-design pass, 2026-08-05, backend contract from `taxonomy-delete-api`
 * dispatch): the delete-term/delete-taxonomy route pair refuses with a 409 rather than a plain
 * failure when content or children still reference what's being deleted. The owner's own complaint
 * that started this pass was a UI mistake — no delete affordance at all — so a blocked state that
 * just greys out a button with no explanation would be the same mistake in a new shape. This turns
 * the route's `code`/`assignedCount`/`childCount` into copy that names the remedy.
 *
 * `KEYS` (fetch-query migration, 2026-08-12): one cache identity for the whole taxonomy list. Every
 * write on this screen — create taxonomy, create term, rename term, delete term, delete taxonomy,
 * merge-execute — used to call the same shared `load()` by hand; each now invalidates this single
 * key instead, per `lib/fetch-query/types.ts`'s `QueryKey` doc. Defined once here (not per hook file)
 * for the same reason `redirects/rules.ts`'s `KEYS` is: a hand-typed second `["taxonomies"]` in one
 * of the five hook files would silently stop matching this one the moment either is edited.
 */
export const KEYS = {
  list: ["taxonomies"] as QueryKey,
};

/**
 * This feature's name on `lib/content-refresh-bus`, so a narrowed notification can say "taxonomy
 * moved" without waking every other content screen. Lives here beside {@link KEYS} rather than in
 * the bus module for the same reason `LANGUAGE_NAMESPACE` lives in `lib/settings-tabs` and
 * `EXECUTION_NAMESPACE` in `lib/execution-settings`: the bus is a transport and owns no vocabulary,
 * so each name belongs to the feature that answers to it.
 *
 * Distinct from `KEYS.list`'s `"taxonomies"` on purpose — that is a cache identity local to this
 * client, this is a wire-visible resource name a server push will have to match in the SSE stage.
 * Tying them together would make a cache-key rename a silent protocol break.
 */
export const TAXONOMY_RESOURCE = "taxonomy";

/**
 * `useTaxonomy`'s page-level error banner, extracted out of that hook (`refactor/fetch-query`
 * complexity pass, 2026-08-12 — the hook's own precedence chain over three sources pushed it to
 * complexity 10 against a ceiling of 9). Precedence: an active delete's own hard failure outranks a
 * background list-refresh failure — same reasoning as `redirects/rules.ts`'s `visibleRedirectsError`
 * (a stale list-refresh error should not read as "your delete failed"). A *blocked* (409) delete is
 * excluded entirely — it already has its own scoped `deleteTermBlocked`/`deleteTaxonomyBlocked` slot
 * in `useTaxonomy`, so folding it into this banner too would show the identical refusal twice.
 *
 * @complexity Time/space: O(1) — three fixed checks, no iteration.
 */
export function visibleTaxonomyError(params: {
  deleteTermBlocked: boolean;
  deleteTermError: Error | null;
  deleteTermFallback: string;
  deleteTaxonomyBlocked: boolean;
  deleteTaxonomyError: Error | null;
  deleteTaxonomyFallback: string;
  listError: Error | null;
  listFallback: string;
}): string | null {
  if (!params.deleteTermBlocked && params.deleteTermError) {
    return describeApiError(params.deleteTermError, params.deleteTermFallback);
  }
  if (!params.deleteTaxonomyBlocked && params.deleteTaxonomyError) {
    return describeApiError(params.deleteTaxonomyError, params.deleteTaxonomyFallback);
  }
  if (params.listError) return describeApiError(params.listError, params.listFallback);
  return null;
}

/** Depth of `term` within its taxonomy's `parentId` chain, bounded against cycles by a visited
 * set (server-side cycle detection should prevent one, but this render helper never trusts that
 * blindly).
 *
 * @complexity Time/space: O(d) in chain depth d, bounded to 32 regardless of actual data size.
 */
export function termDepth(required: { term: AdminTerm; byId: Map<string, AdminTerm> }): number {
  const { term, byId } = required;
  let depth = 0;
  let current: AdminTerm | undefined = term;
  const visited = new Set<string>();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId.get(current.parentId);
    depth += 1;
    if (depth > 32) break; // defensive bound, not an expected real depth
  }
  return depth;
}

/** Every term in `taxonomy` a merge could target, i.e. every term except the one being merged
 *  away. Was `MergeTermSection`'s inline `props.taxonomy.terms.filter(...)`.
 *
 * @complexity Time/space: O(n) in term count.
 */
export function otherMergeTargets(taxonomy: AdminTaxonomyWithTerms, excludeTermId: string): AdminTerm[] {
  return taxonomy.terms.filter((t) => t.id !== excludeTermId);
}

/** Resolves the taxonomy group + term the operator has selected in the term list, by scanning
 *  every group's terms for a matching id. Was `Taxonomy`'s `useMemo` body — the hook that replaces
 *  it still wraps this in `useMemo`, keyed on the same `[taxonomies, selectedTermId]` inputs; only
 *  the computation itself moved out to be directly testable.
 *
 * @complexity Time/space: O(g*t) in the worst case (groups * terms per group) — a linear scan, no
 * index maintained since selection changes are infrequent relative to render cost here.
 */
export function findSelectedTerm(
  taxonomies: AdminTaxonomyWithTerms[] | null,
  selectedTermId: string | null,
): { taxonomy: AdminTaxonomyWithTerms; term: AdminTerm } | null {
  if (!taxonomies || !selectedTermId) return null;
  for (const group of taxonomies) {
    const term = group.terms.find((t) => t.id === selectedTermId);
    if (term) return { taxonomy: group, term };
  }
  return null;
}

export interface DeleteBlockedState {
  code: "TERM_HAS_ASSIGNMENTS" | "TAXONOMY_HAS_ASSIGNMENTS" | "TERM_HAS_CHILDREN";
  /** `assignedCount` or `childCount` from the route's 409 body, whichever `code` implies. Defaults
   *  to 0 (rather than throwing) if the server ever sends a refusal without its count field — an
   *  honest "some" beats a crash, though the route contract always includes it today. */
  count: number;
  message: string;
}

/** Turns a delete route's 409 refusal into operator copy naming both the count and the remedy — see
 *  `api.ts`'s `deleteTerm`/`deleteTaxonomy` doc comment for the route contract this reads. Returns
 *  `null` for anything that isn't one of the three known blocked-delete codes (a 404, a 403, a
 *  network failure, an unrelated `ApiError`, ...) so the caller falls through to its own generic
 *  error handling for those — this function only owns the "delete was REFUSED because content or
 *  children still reference it" case, not delete failure in general.
 *
 * @complexity O(1) — one `instanceof` check plus a fixed 3-way switch, no iteration.
 */
export function describeDeleteBlocked(e: unknown): DeleteBlockedState | null {
  if (!(e instanceof ApiError)) return null;
  // Captured as a local rather than read as `e.body` inside `countOf` below — TypeScript does not
  // retain the `instanceof` narrowing of `e` across a nested function's closure boundary, since it
  // cannot prove `e` isn't reassigned to something else before `countOf` is called.
  const body = e.body;
  function countOf(key: string): number {
    const raw = body?.[key];
    return typeof raw === "number" ? raw : 0;
  }
  switch (e.code) {
    case "TERM_HAS_ASSIGNMENTS": {
      const count = countOf("assignedCount");
      return {
        code: e.code,
        count,
        message: `Still assigned to ${count} content item${count === 1 ? "" : "s"}. Unassign it, or merge it into another term, before deleting.`,
      };
    }
    case "TAXONOMY_HAS_ASSIGNMENTS": {
      const count = countOf("assignedCount");
      return {
        code: e.code,
        count,
        message: `A term in this taxonomy is still assigned to ${count} content item${count === 1 ? "" : "s"}. Unassign or merge that term before deleting the taxonomy.`,
      };
    }
    case "TERM_HAS_CHILDREN": {
      const count = countOf("childCount");
      return {
        code: e.code,
        count,
        message: `Has ${count} child term${count === 1 ? "" : "s"} under it. Delete or move them first.`,
      };
    }
    default:
      return null;
  }
}
