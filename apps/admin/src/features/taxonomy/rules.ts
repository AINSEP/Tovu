import type { AdminTaxonomyWithTerms, AdminTerm } from "../../lib/api";

/**
 * @file Pure logic for the `taxonomy` feature — everything that computes a value rather than
 * rendering one.
 *
 * Follows the `rules.ts` convention `features/posts/rules.ts` establishes. `termDepth` was already
 * a module-level helper in `Taxonomy.tsx`; `otherMergeTargets` and `findSelectedTerm` were inline
 * derivations (a `.filter()` call, a `useMemo` body) that compute a value from their inputs, so per
 * that convention they move here too.
 */

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
