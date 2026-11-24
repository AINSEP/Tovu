import type { Express } from "express";

import { redirectCreateRoute } from "@jini-ai/cms/admin-http/routes/redirects/create";
import { redirectGetRoute } from "@jini-ai/cms/admin-http/routes/redirects/get-by-id";
import { redirectHitsRoute } from "@jini-ai/cms/admin-http/routes/redirects/hits";
import { redirectImportRoute } from "@jini-ai/cms/admin-http/routes/redirects/import";
import { redirectListRoute } from "@jini-ai/cms/admin-http/routes/redirects/list";
import { redirectTombstoneRoute } from "@jini-ai/cms/admin-http/routes/redirects/tombstone";
import { redirectUpdateRoute } from "@jini-ai/cms/admin-http/routes/redirects/update";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-041) — the `redirects` server module (SPEC-009 Redirects admin
 * CRUD/import/hits surface).
 *
 * Owns all 7 registrations (list, get-by-id, create, update, tombstone, import, hits) — moved
 * here verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior
 * change, same relative order. All seven are Jini route specs (`@jini-ai/cms/admin-http/routes/
 * redirects/*`) mounted behind the admin ports.
 */

/**
 * `RedirectRouteDeps` mirrors `MenuRouteDeps`'s pattern for documentation/
 * consistency, even though (unlike Menus) this feature's new fields
 * (`redirectRepo`, `redirectHitSink`, `originRegistry`, `redirectsWriteDeps`)
 * are already declared directly on the shared `RouteDeps` (`routes/types.ts`)
 * — TypeScript's excess-property checks on `createRouteDeps()`'s object-
 * literal return make a "local-extension-only, never touch routes/types.ts"
 * approach mechanically impractical (every existing sibling feature that
 * needs new fields on `RouteDeps` already extends it directly, despite some
 * ADR prose aspiring otherwise — a disclosed deviation, not an oversight).
 */
export interface RedirectRouteDeps extends RouteDeps {}

export type RedirectRouteRegistrar = (required: { app: Express; deps: RedirectRouteDeps }, optional?: Record<string, never>) => void;

/** The two port fields every redirects mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function redirectPortDeps({ deps }: { deps: RedirectRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** These six routes never consulted the publishing-credential override (`authorizeDirectOrRespond`); `create` did (`authorizeOrRespond`), see its registrar. */
const directMountOptions = (operation: string) => ({ authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } });

export const registerAdminRedirectListRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: redirectListRoute, deps: { ...redirectPortDeps({ deps }), redirectRepo: deps.redirectRepo, redirectsWriteDeps: deps.redirectsWriteDeps } }, directMountOptions("routes/redirects/list"));
};

export const registerAdminRedirectGetRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: redirectGetRoute, deps: { ...redirectPortDeps({ deps }), redirectRepo: deps.redirectRepo } }, directMountOptions("routes/redirects/get-by-id"));
};

/** `create` is the one redirects route that called `authorizeOrRespond`, so it mounts `"guarded"`: a publishing credential answers from its grant. Unmapped failures keep the shared write-error helper's operation. */
export const registerAdminRedirectCreateRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: redirectCreateRoute, deps: { ...redirectPortDeps({ deps }), redirectsWriteDeps: deps.redirectsWriteDeps } }, { authorization: "guarded", failure: { operation: "routes/redirects/shared", code: "INTERNAL_ERROR" } });
};

/** Unmapped update failures keep the shared write-error helper's operation (`routes/redirects/shared`). */
export const registerAdminRedirectUpdateRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: redirectUpdateRoute, deps: { ...redirectPortDeps({ deps }), redirectsWriteDeps: deps.redirectsWriteDeps } }, directMountOptions("routes/redirects/shared"));
};

export const registerAdminRedirectTombstoneRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: redirectTombstoneRoute, deps: { ...redirectPortDeps({ deps }), redirectsWriteDeps: deps.redirectsWriteDeps } }, directMountOptions("routes/redirects/tombstone"));
};

export const registerAdminRedirectImportRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: redirectImportRoute, deps: { ...redirectPortDeps({ deps }), redirectsWriteDeps: deps.redirectsWriteDeps } }, directMountOptions("routes/redirects/import"));
};

export const registerAdminRedirectHitsRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: redirectHitsRoute, deps: { ...redirectPortDeps({ deps }), redirectRepo: deps.redirectRepo, redirectHitSink: deps.redirectHitSink } }, directMountOptions("routes/redirects/hits"));
};

export function createRedirectsModule(deps: RedirectRouteDeps): ServerModuleHandle {
  return {
    name: "redirects",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminRedirectListRoute({ app, deps });
      registerAdminRedirectGetRoute({ app, deps });
      registerAdminRedirectCreateRoute({ app, deps });
      registerAdminRedirectUpdateRoute({ app, deps });
      registerAdminRedirectTombstoneRoute({ app, deps });
      registerAdminRedirectImportRoute({ app, deps });
      registerAdminRedirectHitsRoute({ app, deps });
    },
  };
}
