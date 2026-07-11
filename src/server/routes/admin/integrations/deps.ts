import type { Express } from "express";

import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "../../../../integrations";
import type { RouteDeps } from "../../types";

/**
 * @file Local `RouteDeps` extension for the integrations admin routes (ADR-036 admin wiring).
 *
 * Purpose:
 * `src/server/routes/types.ts` (the shared `RouteDeps`/`RouteRegistrar` seam) is a shared
 * composition-root file out of scope for this task — see the handoff report for the exact
 * `RouteDeps` fields to add there. Until that lands, the integrations route registrars type
 * against this local superset instead, so they can be implemented and tested now without
 * touching a file other in-flight work also depends on.
 *
 * How it relates to the project:
 * - Mirrors `RouteRegistrar` from `../../types` exactly, just widened by the two repo ports
 *   these routes need (`webhookSubscriptionRepo`, `webhookDeliveryRepo`).
 * - Once `RouteDeps` itself carries those same field names/types (see the handoff report's
 *   `RouteDeps` snippet), the concrete `RouteDeps` object `app.ts` builds already satisfies
 *   `IntegrationsRouteDeps` structurally — no further change needed in this file.
 *
 * Architectural role:
 * Composition-root deps seam, scoped to the integrations admin routes only. Not itself a port
 * (ADR-006) — a local type alias over the shared `RouteDeps`, same as `RouteRegistrar` is.
 */
export interface IntegrationsRouteDeps extends RouteDeps {
  /** ADR-036 `webhook_subscriptions` persistence (in-memory in dev/tests). */
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  /** ADR-036 `webhook_deliveries` persistence (in-memory in dev/tests). */
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
}

export type IntegrationsRouteRegistrar = (app: Express, deps: IntegrationsRouteDeps) => void;
