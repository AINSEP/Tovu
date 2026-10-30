import type { ComponentCatalogEntry, ComponentCatalogQuery, ComponentCatalogSearchHit } from "@jini-ai/daemon/http";
import { ALL_MANIFESTS, type InteractiveComponentManifest } from "@jini-ai/ui/interactive-ui/manifests";
import { chartProvidersByKind, createChartProviderRegistry } from "@jini-ai/ui/charts";
import type { AdminChartProviderSnapshot } from "#src/contracts/headless/index";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * @file Backs `@jini-ai/http-kit`'s `GET /api/components/search` / `GET /api/components/:id` with
 * `@jini-ai/ui/interactive-ui`'s manifest catalog — the sibling of `tool-catalog-query.ts`, backing
 * `@jini-ai/mcp`'s `search_components`/`describe_component` the same way that file backs
 * `search_tools`/`describe_tool`.
 *
 * **In-memory, not SQLite, and no reseed step.** `tool-catalog-query.ts` seeds an FTS5 index from
 * `registry.list()` because tools are runtime-registered (federated MCP tools, domain plugins —
 * the set changes per boot and per workspace). Component manifests are a handful of entries shipped
 * inside `@jini-ai/ui` — a handful of manifests today doesn't warrant a database for substring
 * matching. Revisit this if the catalog ever grows large enough for FTS5 to actually earn its cost.
 *
 * The host may supply the current admitted registry's entries. Each query reads that snapshot,
 * so disabling a provider or changing the site default cannot leave a stale catalog behind.
 * `ALL_MANIFESTS` remains the compatibility default for hosts without a chart snapshot.
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
 * The admin's live chart aliases without React: the same wire IDs and schemas, each reporting the
 * provider Jini's headless `chartProvidersByKind` picks (what admin renders), or `core.table`.
 * The server cannot import `@jini-ai/ui/charts/react` or `@jini-ai/ui/interactive-ui` — both pull
 * React and its UI peers, which the website's production install does not carry.
 * @complexity O(m + p) per snapshot (m manifests, p admitted providers); callers cache by generation.
 * @example chartCatalogManifests({ snapshot });
 */
/**
 * Projects the admin snapshot into the chart-provider registry's provider shape for server-side
 * selection only. Every `load` refuses: chart provider code is a browser bundle, and the server only
 * needs ids/kinds to pick which provider a manifest advertises.
 *
 * @complexity O(p) in snapshot providers.
 */
export function serverSideChartProviders(
  { snapshot }: { snapshot: AdminChartProviderSnapshot },
  _options: Record<string, never> = {},
) {
  return snapshot.providers.map(({ id, kinds }) => ({
    id, kinds, enabled: true, load: () => Promise.reject(new Error("chart providers load in the browser only")),
  }));
}

export function chartCatalogManifests(
  { snapshot }: { snapshot: AdminChartProviderSnapshot },
  _options: Record<string, never> = {},
): readonly InteractiveComponentManifest[] {
  const registry = createChartProviderRegistry({ providers: serverSideChartProviders({ snapshot }) });
  return ALL_MANIFESTS.map((manifest) => {
    const capability = manifest.capabilities.includes("chart") ? manifest.capabilities.find((c) => c.endsWith("-chart")) : undefined;
    if (!capability) return manifest;
    const [selected] = chartProvidersByKind({ registry, kind: capability.slice(0, -"-chart".length) }, { siteProvider: snapshot.siteProvider });
    return selected ? { ...manifest, provider: selected.id } : manifest;
  });
}

/**
 * Builds a `ComponentCatalogQuery` over the host's current manifests — a fresh ranking per call (cheap:
 * a handful of manifests, plain string matching), not a precomputed index.
 *
 * @complexity O(m) per `search` call (m = manifest count, ~single digits today); O(m) per
 * `describe` call for the linear lookup — a `Map` isn't worth the extra state at this size.
 * The optional first object preserves existing nullary callers; live hosts inject their snapshot.
 * @example buildComponentCatalogQuery({ getManifests: () => registry.list() });
 */
export function buildComponentCatalogQuery(
  { getManifests = () => ALL_MANIFESTS }: { getManifests?: () => readonly InteractiveComponentManifest[] } = {},
  _options: Record<string, never> = {},
): ComponentCatalogQuery {
  return {
    search({ query }, { limit = 10 } = {}) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return getManifests().map((manifest) => ({ manifest, score: scoreManifest(manifest, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ manifest, score }) => toSearchHit(manifest, score));
    },
    describe({ id }) {
      const manifest = getManifests().find((candidate) => candidate.id === id);
      return manifest ? toEntry(manifest) : null;
    },
  };
}
