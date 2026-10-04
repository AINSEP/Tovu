import { escapeHtml } from "#src/platform/html/escape";

/** JINI CANDIDATE: semantic category/tag output without framework or persistence dependencies. */
export interface HtmlTaxonomyTerm {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export function renderHtmlTaxonomy(
  { id, name, hierarchical, terms }: { id: string; name: string; hierarchical: boolean; terms: readonly HtmlTaxonomyTerm[] },
  _optional = {},
): string {
  const ids = new Set(terms.map((term) => term.id));
  const children = new Map<string | null, HtmlTaxonomyTerm[]>();
  for (const term of terms) {
    // A trashed/missing parent cannot hide a live child. Flat tags ignore parent metadata.
    const parent = hierarchical && term.parentId !== term.id && ids.has(term.parentId ?? "") ? term.parentId : null;
    const bucket = children.get(parent) ?? [];
    bucket.push(term);
    children.set(parent, bucket);
  }
  const seen = new Set<string>();
  function renderTerms(rows: readonly HtmlTaxonomyTerm[], depth: number): string {
    const body = rows.map((term) => {
      // Malformed imported cycles must neither overflow nor duplicate a term in public output.
      if (seen.has(term.id)) return "";
      seen.add(term.id);
      const nested = renderTerms(children.get(term.id) ?? [], depth + 1);
      // termRef has no public archive URL today. Plain labels avoid manufacturing 404 links.
      return `<li data-tovu-term="${escapeHtml(term.id)}" data-depth="${depth}"><span data-tovu-term-label>${escapeHtml(term.name)}</span>${nested}</li>`;
    }).join("");
    return body === "" ? "" : `<ul data-tovu-taxonomy-list data-depth="${depth}">${body}</ul>`;
  }
  const list = renderTerms(children.get(null) ?? [], 0);
  const orphanedCycles = renderTerms(terms.filter((term) => !seen.has(term.id)), 0);
  return `<section data-tovu-taxonomy="${escapeHtml(id)}" aria-label="${escapeHtml(name)}">${list}${orphanedCycles}</section>`;
}
