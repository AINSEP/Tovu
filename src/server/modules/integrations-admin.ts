import { registerAdminIntegrationsCreateRoute } from "../routes/admin/integrations/create";
import { registerAdminIntegrationsDeleteRoute } from "../routes/admin/integrations/delete";
import { registerAdminIntegrationsDeliveriesRoute } from "../routes/admin/integrations/deliveries";
import type { IntegrationsRouteDeps } from "../routes/admin/integrations/deps";
import { registerAdminIntegrationsListRoute } from "../routes/admin/integrations/list";
import { registerAdminIntegrationsPauseRoute } from "../routes/admin/integrations/pause";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `integrations-admin` server module.
 *
 * Owns the 5 webhooks/integrations ADMIN routes (list/create/pause/delete/deliveries, ADR-036) —
 * moved here verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior
 * change.
 *
 * Distinct from `modules/integrations.ts` (already shipped in SPEC-031): that module owns the
 * Forms-to-webhook fan-out SUBSCRIBER — an internal, event-driven delivery-enqueue concern with
 * no HTTP surface. This module owns the admin CRUD/read HTTP surface over webhook subscriptions
 * and their delivery log — a different concern that happens to live in the same `integrations`
 * library. Two separate `ServerModuleHandle`s, two separate names, deliberately not merged into
 * one: `modules/integrations.ts`'s `start()` and this module's `registerRoutes()` have no shared
 * state and no ordering dependency on each other.
 */
export function createIntegrationsAdminModule(deps: IntegrationsRouteDeps): ServerModuleHandle {
  return {
    name: "integrations-admin",
    registerRoutes: (app) => {
      registerAdminIntegrationsListRoute(app, deps);
      registerAdminIntegrationsCreateRoute(app, deps);
      registerAdminIntegrationsPauseRoute(app, deps);
      registerAdminIntegrationsDeleteRoute(app, deps);
      registerAdminIntegrationsDeliveriesRoute(app, deps);
    },
  };
}
