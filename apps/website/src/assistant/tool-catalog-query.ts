import Database from "better-sqlite3";
import type { ToolRegistry } from "@jini-ai/core";
import type { Clock } from "@jini-ai/core/primitives";
import type { ToolCatalogQuery } from "@jini-ai/daemon/http";
import { buildToolCatalogQuery as buildCatalogSnapshot, listToolCatalogEntries as listCatalogEntries, type SearchEnricher } from "@jini-ai/registry/tool-catalog-builder";
import { createSqliteCatalogStoreFactory } from "@jini-ai/registry/tool-catalog-builder/sqlite";

import { indexedDescriptionFor, stripSearchKeywords } from "./tool-search-keywords.js";

/**
 * @file Backs `@jini-ai/daemon/http`'s `GET /api/tools/search` / `GET /api/tools/:id` with Tovu's own
 * `ToolRegistry` — the same registry `buildAssistantToolRegistrations` populates and
 * `ToolExecutor` already executes against, so search/describe can never drift from what
 * `execute_delegated_tool` can actually run.
 *
 * Missing until 2026-07-30: `agent-daemon-server.ts` built the registry and the executor but never
 * mounted `registerToolCatalogRoutes`, so `@jini-ai/mcp`'s `search_tools`/`describe_tool` (which
 * proxy these two routes) 404'd for every spawned CLI — confirmed live via a direct curl against
 * the daemon. This is the other half of that fix, alongside `mcp-injection.ts`'s missing bearer
 * credential.
 *
 * Ranking backend, 2026-07-30: swapped from a hand-rolled in-memory term-count scorer to
 * `@jini-ai/registry/tool-catalog/sqlite`'s FTS5 + `bm25()` implementation, after benchmarking both against the real
 * registered catalog. Timing is a wash either way (both sub-millisecond; a network/LLM round-trip
 * dwarfs the difference), but BM25's quality is meaningfully better: the in-memory scorer produced
 * frequent score ties on ambiguous queries (e.g. "notification email" scored
 * `forms_update_definition` and `identity_user_update_email` identically), while BM25 correctly
 * separates them by term-frequency/length-normalized relevance. That gap widens, not narrows, as
 * the catalog grows. (That 2026-07-30 benchmark ran against an 18-tool registry; the wired catalog
 * is 131 tools as of 2026-08-05, so the quality gap the swap was made for is wider now than the
 * numbers in that note imply, not narrower.)
 */

/** The tool id's own naming convention (`forms_create_definition` -> `forms`) doubles as its
 * catalog `source` — Tovu's `ToolDescriptor` carries no separate domain field, and every wired id
 * already follows `<domain>_<verb...>`, so deriving it is free rather than a new field to keep in
 * sync. */
function sourceForToolId(id: string): string {
  const [prefix] = id.split("_");
  return prefix && prefix.length > 0 ? prefix : "tovu";
}

// Generic snapshot validation and its rationale live in Jini's registry/src/tool-catalog-builder/query.ts.
// Tovu keeps its source names and search vocabulary here; keywords affect ranking, never authored text.
const enricher: SearchEnricher = {
  indexedDescription: ({ id, description }, optional) => indexedDescriptionFor(id, description, optional),
  authoredDescription: ({ description }) => stripSearchKeywords(description),
};
const classifier = { classify: ({ id }: { id: string }) => sourceForToolId(id) };

/**
 * Seeds an in-memory SQLite FTS5 index from `registry.list({})` and returns a `ToolCatalogQuery`
 * backed by it.
 *
 * `:memory:`, not a file, and seeded once at call time rather than kept live: the source of truth
 * is `registry` itself (a `ToolRegistry` rebuilt fresh from static code on every daemon boot), so
 * this index is a disposable snapshot, not durable state — matching `@jini-ai/registry/tool-catalog/sqlite`'s own module
 * doc ("this table only makes that id discoverable... reseeded wholesale"). Called once at daemon
 * startup (`agent-daemon-server.ts`), after every domain's registrations are wired in.
 *
 * @complexity O(r) to seed (r = registered tools, ~tens today); search/describe are SQLite's own
 * FTS5/index cost, not this function's.
 * @overallScore 100
 */
export function buildToolCatalogQuery(
  registry: Pick<ToolRegistry, "list">,
  /** Test seam. `false` seeds the raw descriptions with no operator vocabulary folded in — the ONLY
   *  caller is `tool-search-quality.eval.ts`, which needs a true before/after on the same case set to
   *  make its improvement attributable rather than asserted. Production always wants the default. */
  options: { readonly includeSearchKeywords?: boolean; readonly includeDoc2query?: boolean; readonly clock?: Clock } = {},
): ToolCatalogQuery {
  const db = new Database(":memory:");
  // Indexed text, not the raw description — see `tool-search-keywords.ts` for why. Short
  // version: BM25 can only rank words that are in the index, and this catalog's descriptions
  // are written in the codebase's nouns while operators search in theirs. Measured at 40%
  // top-1 before this.
  const snapshot = buildCatalogSnapshot({
    source: { list: () => registry.list({}) },
    storeFactory: createSqliteCatalogStoreFactory({ db }),
    enricher,
    classifier,
    clock: options.clock ?? { nowMs: () => Date.now() },
  }, options);

  // Both accessors strip the folded search vocabulary back off. The keywords exist to be RANKED on,
  // never to be read: a tool's description is a contract the model reasons about, and padding it
  // with synonyms to game the index would degrade that in order to fix search. Stripping here keeps
  // the two concerns separate — the index sees the vocabulary, every caller sees the authored text.
  return {
    search({ query }, { limit = 10 } = {}) {
      return snapshot.search({ query }, { limit });
    },
    describe({ id }) {
      return snapshot.describe({ id });
    },
  };
}

/** One registered tool as the catalog presents it: its id, the `source` domain `search_tools`
 *  reports, and the authored description with folded search vocabulary stripped — what
 *  `describe_tool` returns for the id, minus the input schema. */
export interface ToolCatalogEntry {
  readonly id: string;
  readonly source: string;
  readonly description: string;
}

/**
 * Reads `registry.list({})` NOW and returns every tool as a {@link ToolCatalogEntry} — the reader each
 * composition root binds to its own registry and hands `site_describe_capabilities`
 * (`features/site-inspection/deps.ts`'s `listCatalogTools`).
 *
 * Deliberately not an index: nothing seeded, ranked or kept. It shares `sourceForToolId` and
 * `stripSearchKeywords` with {@link buildToolCatalogQuery}, so an entry's `source`/`description` are
 * exactly what `search_tools`/`describe_tool` report for the same id. Reading the live registry on
 * every call, it also includes a tool registered after the FTS snapshot was seeded, before that
 * snapshot is rebound.
 *
 * @param registry - The live registry; only `list` is read.
 * @returns One entry per registered tool, in registration order.
 * @complexity O(r) in registered tools.
 */
export function listToolCatalogEntries(registry: Pick<ToolRegistry, "list">): ToolCatalogEntry[] {
  return listCatalogEntries({ source: { list: () => registry.list({}) }, enricher, classifier });
}
