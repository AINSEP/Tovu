import { toolMetadata } from "../../contracts/core/tool-metadata/widgets.js";
/**
 * @file Widgets' half of ADR-049 Decision 4 (SPEC-043/ADR-047), the host binding: the catalog, the
 * twelve handlers, the authored risk map and the typed-error mapping live in `@jini-ai/cms/widgets`
 * (`buildWidgetsToolRegistrations`). This file supplies what is Tovu's: the route deps' two
 * write-path composers (`./deps.ts`), the plugin-hook refusal wrapper (`withPluginHookRefusals`:
 * the refusal class and its fixed wording are Tovu's), the search vocabulary and approval policy
 * (`toolMetadata`), and the default surface store.
 */
import { withToolMetadata, type ToolContributor, type ToolRegistration } from "@jini-ai/core";
import { buildWidgetsToolRegistrations, widgetsDerivedRisk, type WidgetsPackageToolDeps } from "@jini-ai/cms/widgets";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import { withPluginHookRefusals } from "../../contracts/core/plugin-hook-failed-error.js";
import { buildWidgetsDeps, buildWidgetsRegionDeps, type WidgetsRouteDeps } from "./deps.js";

/** Re-exported for this file's existing callers/tests, now sourced from the shared composer
 * (`./deps.ts`) instead of being declared locally — see that file's header for why one composer
 * replaces what used to be this interface's own copy plus `server/routes/admin/widgets/
 * agent-tools.ts`'s separately-written, identically-shaped one. */
export type WidgetsToolDeps = WidgetsRouteDeps;

/**
 * The slice of the host's route deps the handlers read, plus the two composers of the write-path
 * deps bags (`buildWidgetsDeps`/`buildWidgetsRegionDeps`, which stay host code). They stay lazy: a
 * registry built for its descriptors alone is given route deps without the repos those bags read.
 */
function toPackageDeps({ routeDeps }: { routeDeps: WidgetsToolDeps }, _optional = {}): WidgetsPackageToolDeps {
  return {
    authorize: routeDeps.authorize,
    workspaceId: routeDeps.workspaceId,
    idGen: routeDeps.idGen,
    entryRepo: routeDeps.entryRepo,
    entryRefsRepo: routeDeps.entryRefsRepo,
    widgetBindingRepo: routeDeps.widgetBindingRepo,
    composeWriteDeps: () => buildWidgetsDeps(routeDeps),
    composeRegionDeps: () => buildWidgetsRegionDeps(routeDeps),
    wrapHookRefusals: withPluginHookRefusals,
  };
}

export function buildWidgetsRegistrations(
  routeDeps: WidgetsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  return withToolMetadata({ registrations: buildWidgetsToolRegistrations({ deps: toPackageDeps({ routeDeps }) }), metadata: toolMetadata });
}

/**
 * Contributes Widgets' AI tools to the assistant's catalog — called once by
 * `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildWidgetsRegistrations`/
 * `widgetsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2 — see
 * `tool-contribution-registry.ts`'s header for why: this edge used to close a module cycle with
 * `assistant`, and a one-directional `widgets -> assistant` registration call does not). Converting
 * `widgets` first in this batch (ahead of `content-types`/`forms`, which `widgets` itself imports)
 * was deliberate: it removes the `assistant -> widgets` static edge before either of those converts,
 * so a later `content-types -> assistant` or `forms -> assistant` edge cannot round-trip back through
 * `widgets` to close a new cycle the way `themes`/`post` did in the prior batch.
 */
export function contributeWidgetsTools(): ToolContributor<WidgetsToolDeps, AssistantSurfaceDeps> {
  return { domain: "widgets", build: buildWidgetsRegistrations, risk: widgetsDerivedRisk };
}