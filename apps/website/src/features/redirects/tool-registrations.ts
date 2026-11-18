import { withToolMetadata, type ToolContributor, type ToolRegistration } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import { buildRedirectsToolRegistrations, redirectsDerivedRisk, type RedirectHitSink, type RedirectRepoPort, type RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import { toolMetadata } from "../../contracts/core/tool-metadata/redirects.js";

/**
 * @file Redirects' half of ADR-049 Decision 4 (SPEC-009): this site's binding of the seven redirects
 * agent tools, whose catalog, handlers, model-facing error mapping and authored risk map live in
 * `@jini-ai/cms/redirects`. What stays here is the host's own policy: the tool metadata (search
 * vocabulary and the `redirects_tombstone` confirmation policy, `contracts/core/tool-metadata/
 * redirects.ts`), the default surface store, and the contributor the composition root installs.
 */

/**
 * The exact slice of the route-deps bag Redirects' tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 */
export interface RedirectsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  redirectRepo: RedirectRepoPort;
  redirectHitSink: RedirectHitSink;
  redirectsWriteDeps: RedirectsWriteDeps;
}

/**
 * The host builder: the package registrations plus this site's tool metadata. Its name, positional
 * parameters and default surface store are pinned by existing callers and tests; no handler reads
 * `surfaces`.
 */
export function buildRedirectsRegistrations(
  routeDeps: RedirectsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  return withToolMetadata({ registrations: buildRedirectsToolRegistrations({ deps: routeDeps }), metadata: toolMetadata });
}

/**
 * Contributes Redirects' AI tools to the assistant's catalog — called once by
 * `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildRedirectsRegistrations`/
 * `redirectsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 of the
 * rollout — no sibling domain still statically wired through `assistant` imports `redirects`, so this
 * one-directional `redirects -> assistant` call closes no new cycle).
 */
export function contributeRedirectsTools(): ToolContributor<RedirectsToolDeps, AssistantSurfaceDeps> {
  return { domain: "redirects", build: buildRedirectsRegistrations, risk: redirectsDerivedRisk };
}
