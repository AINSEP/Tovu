/**
 * @file The taxonomy/term registry's read side — re-exported from `@jini-ai/cms/taxonomy`.
 *
 * A thin pass-through over injected read ports with no authorization of its own (its caller owns
 * that check), which is what let it port unchanged.
 */
export { listTaxonomiesWithTerms } from "@jini-ai/cms/taxonomy";

export type { TaxonomyListPort, TermListPort, TaxonomyWithTerms } from "@jini-ai/cms/taxonomy";
