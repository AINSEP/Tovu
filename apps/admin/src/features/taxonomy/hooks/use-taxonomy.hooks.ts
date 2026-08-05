import { useEffect, useMemo, useState } from "react";
import { api, describeApiError, type AdminTaxonomyWithTerms } from "../../../lib/api";
import { findSelectedTerm } from "../rules";

/**
 * @file Everything the top-level `Taxonomy` screen does, so `Taxonomy.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error string. `selected`'s `useMemo` body
 * moved to `rules.ts`'s `findSelectedTerm` (Pattern 2: a `useMemo` body that is a pure function of
 * its inputs); the `useMemo` wrapper itself stays here since memoization is a hook concern, not a
 * rule of the domain.
 */

export interface TaxonomyController {
  taxonomies: AdminTaxonomyWithTerms[] | null;
  error: string | null;
  selectedTermId: string | null;
  setSelectedTermId: (termId: string | null) => void;
  selected: ReturnType<typeof findSelectedTerm>;
  load: () => void;
}

export function useTaxonomy(): TaxonomyController {
  const [taxonomies, setTaxonomies] = useState<AdminTaxonomyWithTerms[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);

  function load() {
    api
      .listTaxonomies()
      .then((r) => setTaxonomies(r.items))
      .catch((e) => setError(describeApiError(e, "failed to load taxonomies")));
  }

  useEffect(load, []);

  const selected = useMemo(() => findSelectedTerm(taxonomies, selectedTermId), [taxonomies, selectedTermId]);

  return { taxonomies, error, selectedTermId, setSelectedTermId, selected, load };
}
