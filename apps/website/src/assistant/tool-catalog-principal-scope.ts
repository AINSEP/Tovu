/**
 * @file Per-principal tool discovery: the `catalogFor` factory for `@jini-ai/daemon/http`'s
 * `toolCatalogRoutes`. Least privilege lives in the contract: a read-only principal discovers (and
 * can describe) only read-only tools, a full principal discovers everything. The view is built
 * per request and never kept, so one principal's catalog cannot be served to another. A request
 * whose principal cannot be resolved throws, which the route turns into an internal error; it
 * never falls back to the unscoped catalog.
 */
import type { Principal, ToolRegistry } from "@jini-ai/core";
import type { ToolCatalogQuery } from "@jini-ai/daemon/http";
import { filterReadOnlyToolCatalog } from "@jini-ai/daemon/read-only-tools";
import { bearerTokenFromHeader } from "@jini-ai/core/contracts/server";
import type { RunScopedCallerResolver } from "@jini-ai/daemon/run-credentials";

export interface ToolCatalogPrincipalScopeDeps {
  readonly catalog: ToolCatalogQuery;
  readonly registry: Pick<ToolRegistry, "list">;
  /** Throws when the request names no resolvable principal. */
  readonly resolvePrincipal: (required: { request: Request }) => Principal;
}

/** @returns The `catalogFor` the daemon catalog routes call once per request. O(1) per call. */
export function createToolCatalogFor(
  { catalog, registry, resolvePrincipal }: ToolCatalogPrincipalScopeDeps,
  _optional: Record<string, never> = {},
): (required: { request: Request }) => ToolCatalogQuery {
  return ({ request }) => filterReadOnlyToolCatalog({ principal: resolvePrincipal({ request }), registry, catalog });
}

/**
 * Resolves the principal the way discovery auth already does: the per-run bearer credential names a
 * live run, and the run's tracked principal is the identity. Never reads a principal off the wire.
 * @throws when the bearer is missing, unknown, or its run is no longer tracked.
 */
export function discoveryPrincipalResolver(
  { runCredentials, principalByRunId }: { runCredentials: RunScopedCallerResolver; principalByRunId: ReadonlyMap<string, Principal> },
  _optional: Record<string, never> = {},
): (required: { request: Request }) => Principal {
  return ({ request }) => {
    const token = bearerTokenFromHeader({ header: request.headers.get("authorization") });
    const caller = token ? runCredentials.resolveCaller({ token }) : undefined;
    const principal = caller ? principalByRunId.get(caller.runId) : undefined;
    if (!principal) throw new Error("tool discovery needs a live run; no principal could be resolved for this request");
    return principal;
  };
}
