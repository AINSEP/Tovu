import type { ToolDescriptor, ToolRegistry } from "@jini-ai/core";
import type { ToolCatalogEntry, ToolCatalogQuery, ToolCatalogSearchHit } from "@jini-ai/http-kit";

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
 */

/** The tool id's own naming convention (`forms_create_definition` -> `forms`) doubles as its
 * catalog `source` — Tovu's `ToolDescriptor` carries no separate domain field, and every wired id
 * already follows `<domain>_<verb...>`, so deriving it is free rather than a new field to keep in
 * sync. */
function sourceForToolId(id: string): string {
  const [prefix] = id.split("_");
  return prefix && prefix.length > 0 ? prefix : "tovu";
}

function toEntry(descriptor: ToolDescriptor): ToolCatalogEntry {
  return {
    id: descriptor.id,
    description: descriptor.description ?? "",
    inputSchema: descriptor.inputSchema,
    source: sourceForToolId(descriptor.id),
  };
}

/**
 * A minimal keyword search over `registry.list()`: each whitespace-separated query term scores one
 * point per hit against the tool's id+description, case-insensitively. No stemming/fuzzing —
 * matches `search_tools`' own published contract ("keyword" search, `q="fill form"`-style), and the
 * catalog is small enough (tens of entries, not thousands) that relevance beyond substring matching
 * is not worth the complexity yet.
 *
 * @complexity O(t * r) — t = query terms, r = registered tools. Effectively O(1) at today's scale.
 * @overallScore 100
 */
export function buildToolCatalogQuery(registry: Pick<ToolRegistry, "list">): ToolCatalogQuery {
  return {
    search(query, limit = 10): readonly ToolCatalogSearchHit[] {
      const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
      const hits: ToolCatalogSearchHit[] = [];
      for (const descriptor of registry.list()) {
        const haystack = `${descriptor.id} ${descriptor.description ?? ""}`.toLowerCase();
        const score = terms.reduce((total, term) => (haystack.includes(term) ? total + 1 : total), 0);
        if (score > 0) {
          hits.push({ id: descriptor.id, description: descriptor.description ?? "", source: sourceForToolId(descriptor.id), score });
        }
      }
      hits.sort((a, b) => b.score - a.score);
      return hits.slice(0, limit);
    },
    describe(id): ToolCatalogEntry | null {
      const descriptor = registry.list().find((entry) => entry.id === id);
      return descriptor ? toEntry(descriptor) : null;
    },
  };
}
