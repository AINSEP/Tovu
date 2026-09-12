import type { ToolCatalogQuery } from "@jini-ai/http-kit";

/**
 * @file A `ToolCatalogQuery` whose backing snapshot can be swapped after construction — the
 * discovery-side half of federation hot-reload (`mcp-federation/reload.ts`'s execution-side
 * counterpart).
 *
 * `buildToolCatalogQuery` (`tool-catalog-query.ts`) seeds a disposable, one-shot in-memory FTS index
 * from `registry.list()` — by its own design, since ordinarily the registry is built once per boot
 * and never changes again. Federation hot-reload breaks that assumption on purpose: a connection
 * admitted after boot registers new tools into the SAME live `registry`
 * (`agent-daemon-server.ts`'s reload route), and those tools need to reach `search_tools`/
 * `describe_tool` too, not only `execute_delegated_tool` — `ToolExecutor.execute`
 * (`@jini-ai/daemon`) already resolves a named tool id against the live `registry` on every call, so
 * execution was never the gap; discovery is, because it only ever saw whatever snapshot was current
 * the one time `@jini-ai/http-kit`'s `registerToolCatalogRoutes` was called.
 *
 * `registerToolCatalogRoutes` captures its `{catalog}` deps object ONCE, at registration time
 * (`@jini-ai/http-kit`'s `tool-catalog.ts` — `mountJsonRoute(app, route, deps, adapter)` closes over
 * `deps`), and calls `deps.catalog.search(...)`/`.describe(...)` by property lookup on that SAME
 * object every request. That is exactly the seam this file uses: the returned `query` object's
 * IDENTITY stays constant forever, so the route's own closure needs no change, while `rebind` swaps
 * which underlying `ToolCatalogQuery` its methods delegate to. Same "closes over a binding, not a
 * value" idiom `agent-daemon-server.ts` already uses for its `federationAdmissionReports`/
 * `federationRefusalPrefix` module-level `let`s, reified here as a small reusable wrapper because
 * THIS seam needs an object with live methods rather than a `let` a function body reads directly.
 */

export interface LiveToolCatalogQuery {
  /** Stable identity — pass this into `registerToolCatalogRoutes` exactly once. */
  readonly query: ToolCatalogQuery;
  /** Swaps the snapshot every subsequent `search`/`describe` call delegates to. */
  rebind(next: ToolCatalogQuery): void;
}

/**
 * @param initial - The boot-time snapshot, exactly what `buildToolCatalogQuery(registry)` (wrapped in
 * `withToolCatalogAudit`) already produced — this wrapper changes nothing about first-boot behavior
 * for a process that never reloads.
 * @complexity O(1) to construct; each call costs whatever the CURRENTLY bound `ToolCatalogQuery`
 * costs, plus one property read.
 * @overallScore 100
 */
export function createLiveToolCatalogQuery(initial: ToolCatalogQuery): LiveToolCatalogQuery {
  let current = initial;
  return {
    query: {
      search: (query, limit) => current.search(query, limit),
      describe: (id) => current.describe(id),
    },
    rebind(next: ToolCatalogQuery): void {
      current = next;
    },
  };
}
