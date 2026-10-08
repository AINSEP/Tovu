import { nativeToolMetadata } from '../contracts/core/tool-metadata/index.js';
import type { ToolMetadata } from '@jini-ai/core';
import { createSearchEnricher } from '@jini-ai/registry/tool-catalog-builder';
import { DOC2QUERY } from "./tool-search-doc2query.js";
/**
 * @file Operator vocabulary for tool search — the words a human uses that a tool's own description
 * does not contain.
 *
 * ## Why this exists
 *
 * BM25 can rank only indexed vocabulary. Operators ask for "images" or "snapshots" while domain
 * descriptions may say "assets" or "restore points". Meta-tool discovery is the model's route to
 * the catalog, so missing vocabulary makes a working tool unreachable.
 *
 * Choose everyday domain synonyms independently of evaluation queries. The held-out cases in
 * `development/evals/tool-search-quality.eval.ts` assess discovery without shaping this vocabulary.
 * Domain registration contracts own the words; Jini metadata projects them and the shared search
 * enricher folds/strips indexed text without changing authored descriptions.
 *
 * Only tools an operator plausibly asks for in plain language need an entry. A tool absent from this
 * map is unchanged — it keeps ranking on its id and description alone.
 */

/**
 * Tool id -> extra search vocabulary. Space-separated terms; word order does not matter (BM25 treats
 * these as a bag of terms). Include plurals AND singulars explicitly: the index uses FTS5's default
 * `unicode61` tokenizer, which does not stem, so "image" and "images" are different tokens.
 */
export const TOOL_SEARCH_KEYWORDS: Readonly<Record<string, string>> = nativeToolMetadata.keywords;

/** Separates a tool's real description from its appended search vocabulary. Written once, used by
 *  both halves of the fold/strip pair below so the two can never disagree about the boundary.
 *  Exported for `content-read-tool.ts`'s own card-description builder: a merged
 *  `content_read.<resource>` card composes ITS OWN single marker boundary from several retired
 *  tools' plain descriptions plus their combined keyword/doc2query tails (see that file's header)
 *  — reusing this constant keeps that boundary byte-identical to the one `indexedDescriptionFor`
 *  itself would draw, so `stripSearchKeywords` cuts a card's description in exactly the right place
 *  without either file having to know the other's marker text separately. */
export const KEYWORD_MARKER = " — also known as: ";
const searchEnricher = createSearchEnricher({ marker: KEYWORD_MARKER, keywords: TOOL_SEARCH_KEYWORDS, questions: DOC2QUERY });

/**
 * Folds a tool's keywords into the text that gets INDEXED.
 *
 * Appending behind one marker lets the shared enricher strip the indexed vocabulary on return.
 *
 * The obvious cost of that shortcut — the model seeing a keyword tail on every hit — is NOT paid,
 * because {@link stripSearchKeywords} removes it again on the way out of `search_tools` and
 * `describe_tool`. The vocabulary exists only inside the FTS index, where BM25 can rank on it and
 * nothing else ever reads it. That split is the whole point: a tool's description is a contract
 * shown to a model, and padding it with synonyms to game a search index would degrade the thing
 * the model actually reasons about in order to fix the thing it searches with.
 */
export function indexedDescriptionFor(
  toolId: string,
  description: string,
  /** Test seam, mirroring `buildToolCatalogQuery`'s own `includeSearchKeywords`. `false` folds the
   *  operator nouns but NOT the doc2query questions, which is the only way to still measure the
   *  pre-adoption baseline now that production includes both — without it, the adoption eval's
   *  "before" arm silently becomes its "after" arm and the comparison reports a null result. */
  options: { readonly includeDoc2query?: boolean; readonly metadata?: ToolMetadata } = {},
): string {
  // Keywords supply operator nouns; doc2query adds verbs and question phrasing that distinguish
  // sibling tools. Both sit behind KEYWORD_MARKER so callers see only authored descriptions.
  return searchEnricher.indexedDescription({ id: toolId, description,
    ...(options.metadata ? { metadata: options.metadata } : {}),
  }, { includeDoc2query: options.includeDoc2query ?? true });
}

/**
 * Inverse of {@link indexedDescriptionFor} — recovers the tool's authored description from whatever
 * was indexed, so no caller of `search_tools`/`describe_tool` ever sees the search vocabulary.
 *
 * Tolerates text with no marker unchanged because every hit passes here, including tools with
 * no search vocabulary. Demo-only tools are excluded from operator-language enrichment.
 */
export function stripSearchKeywords(indexed: string): string {
  return searchEnricher.authoredDescription({ description: indexed });
}
