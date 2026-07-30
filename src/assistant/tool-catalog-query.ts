import Database from "better-sqlite3";
import type { ToolRegistry } from "@jini-ai/core";
import type { ToolCatalogQuery } from "@jini-ai/http-kit";
import { ensureToolCatalogTables, getToolCatalogEntry, reseedToolCatalog, searchToolCatalog } from "@jini-ai/sqlite";

/**
 * @file Backs `@jini-ai/http-kit`'s `GET /api/tools/search` / `GET /api/tools/:id` with Tovu's own
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
 * `@jini-ai/sqlite`'s FTS5 + `bm25()` implementation, after benchmarking both against the real
 * registered catalog. Timing is a wash either way (both sub-millisecond; a network/LLM round-trip
 * dwarfs the difference), but BM25's quality is meaningfully better: the in-memory scorer produced
 * frequent score ties on ambiguous queries (e.g. "notification email" scored
 * `forms_update_definition` and `identity_user_update_email` identically), while BM25 correctly
 * separates them by term-frequency/length-normalized relevance. That gap widens, not narrows, as
 * the catalog grows past today's 18 tools.
 */

/** The tool id's own naming convention (`forms_create_definition` -> `forms`) doubles as its
 * catalog `source` — Tovu's `ToolDescriptor` carries no separate domain field, and every wired id
 * already follows `<domain>_<verb...>`, so deriving it is free rather than a new field to keep in
 * sync. */
function sourceForToolId(id: string): string {
  const [prefix] = id.split("_");
  return prefix && prefix.length > 0 ? prefix : "tovu";
}

/**
 * Seeds an in-memory SQLite FTS5 index from `registry.list()` and returns a `ToolCatalogQuery`
 * backed by it.
 *
 * `:memory:`, not a file, and seeded once at call time rather than kept live: the source of truth
 * is `registry` itself (a `ToolRegistry` rebuilt fresh from static code on every daemon boot), so
 * this index is a disposable snapshot, not durable state — matching `@jini-ai/sqlite`'s own module
 * doc ("this table only makes that id discoverable... reseeded wholesale"). Called once at daemon
 * startup (`agent-daemon-server.ts`), after every domain's registrations are wired in.
 *
 * @complexity O(r) to seed (r = registered tools, ~tens today); search/describe are SQLite's own
 * FTS5/index cost, not this function's.
 * @overallScore 100
 */
export function buildToolCatalogQuery(registry: Pick<ToolRegistry, "list">): ToolCatalogQuery {
  const db = new Database(":memory:");
  ensureToolCatalogTables(db);
  reseedToolCatalog(
    db,
    registry.list().map((descriptor) => ({
      id: descriptor.id,
      description: descriptor.description ?? "",
      inputSchema: descriptor.inputSchema,
      source: sourceForToolId(descriptor.id),
    })),
  );

  return {
    search(query, limit = 10) {
      return searchToolCatalog(db, query, limit);
    },
    describe(id) {
      return getToolCatalogEntry(db, id);
    },
  };
}
