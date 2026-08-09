import type { ComponentCatalogEntry, ComponentCatalogQuery, ComponentCatalogSearchHit } from "@jini-ai/http-kit";
import { ALL_MANIFESTS, type InteractiveComponentManifest } from "@jini-ai/ui/interactive-ui/manifests";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * @file Backs `@jini-ai/http-kit`'s `GET /api/components/search` / `GET /api/components/:id` with
 * `@jini-ai/ui/interactive-ui`'s manifest catalog — the sibling of `tool-catalog-query.ts`, backing
 * `@jini-ai/mcp`'s `search_components`/`describe_component` the same way that file backs
 * `search_tools`/`describe_tool`.
 *
 * **In-memory, not SQLite, and no reseed step.** `tool-catalog-query.ts` seeds an FTS5 index from
 * `registry.list()` because tools are runtime-registered (federated MCP tools, domain plugins —
 * the set changes per boot and per workspace). `ALL_MANIFESTS` is static, built-in, compile-time
 * data shipped inside `@jini-ai/ui` — there is nothing to reseed, and a handful of manifests today
 * doesn't warrant a database for substring matching. Revisit this if the catalog ever grows large
 * enough, or dynamic enough, for FTS5 to actually earn its cost — it does not today.
 *
 * `propsSchema` is `unknown` on the wire (`ComponentCatalogEntry`'s own type) precisely so
 * `@jini-ai/http-kit` never has to depend on `zod` — this file is the one place a manifest's live
 * zod schema is real, and `zodToJsonSchema` converts it to plain JSON right here, at the only
 * point that needs to cross that boundary.
 */

function scoreManifest(manifest: InteractiveComponentManifest, terms: readonly string[]): number {
  const haystack = [manifest.id, manifest.provider, manifest.description ?? "", ...manifest.capabilities]
    .join(" ")
    .toLowerCase();
  return terms.reduce((score, term) => (haystack.includes(term) ? score + 1 : score), 0);
}

function toSearchHit(manifest: InteractiveComponentManifest, score: number): ComponentCatalogSearchHit {
  return {
    id: manifest.id,
    provider: manifest.provider,
    capabilities: manifest.capabilities,
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
    score,
  };
}

function toEntry(manifest: InteractiveComponentManifest): ComponentCatalogEntry {
  return {
    id: manifest.id,
    provider: manifest.provider,
    capabilities: manifest.capabilities,
    // Cast, not a plain call: `manifest.propsSchema` is `@jini-ai/ui`'s own zod instance's
    // `ZodTypeAny`, structurally near-identical to but not the same nominal type as this
    // package's own resolved `zod` (two independent installs, both real, both valid at runtime —
    // `instanceof` isn't crossed, only compile-time structural comparison is), which sends
    // TypeScript into an excessively-deep instantiation check comparing the two. The runtime value
    // is a genuine zod schema regardless of which install produced it; `zodToJsonSchema` only ever
    // reads its `._def`, so this loses no real type safety, just a comparison TS cannot cheaply do.
    propsSchema: zodToJsonSchema(manifest.propsSchema as unknown as Parameters<typeof zodToJsonSchema>[0]),
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
  };
}

/**
 * Builds a `ComponentCatalogQuery` over `ALL_MANIFESTS` — a fresh scored ranking per call (cheap:
 * a handful of manifests, plain string matching), not a precomputed index.
 *
 * @complexity O(m) per `search` call (m = manifest count, ~single digits today); O(m) per
 * `describe` call for the linear lookup — a `Map` isn't worth the extra state at this size.
 */
export function buildComponentCatalogQuery(): ComponentCatalogQuery {
  return {
    search(query, limit = 10) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return ALL_MANIFESTS.map((manifest) => ({ manifest, score: scoreManifest(manifest, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ manifest, score }) => toSearchHit(manifest, score));
    },
    describe(id) {
      const manifest = ALL_MANIFESTS.find((candidate) => candidate.id === id);
      return manifest ? toEntry(manifest) : null;
    },
  };
}
