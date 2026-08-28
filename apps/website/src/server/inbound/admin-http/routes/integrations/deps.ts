import type { Express } from "express";

import type { RouteDeps, WebhooksDeps } from "#src/server/routes/types";

/**
 * @file Narrow `RouteDeps` slice for the integrations ADMIN routes (ADR-036 admin wiring;
 * ADR-046 Phase 3 / SPEC-034 `modules/integrations-admin.ts`).
 *
 * Purpose (updated 2026-07-16, SPEC-034):
 * This type used to `extend RouteDeps` (a WIDENING, from back when `webhookSubscriptionRepo`/
 * `webhookDeliveryRepo` hadn't landed on the shared `RouteDeps` yet — see git history for the
 * original ADR-036 rationale). Both fields have been on `RouteDeps` since ADR-046 Phase 1's
 * webhooks durability slice, so the `extends RouteDeps` shape was already redundant; this is now
 * a genuine NARROWING (`Pick`), matching `routes/admin/media/deps.ts`/`routes/admin/taxonomy/
 * deps.ts`'s identical rationale — stating the exact subset these 5 admin routes (list/create/
 * pause/delete/deliveries) actually read, for `modules/integrations-admin.ts`'s factory
 * parameter. Narrowing an already-satisfied type is backward-compatible: nothing that built a
 * full `RouteDeps` object to satisfy the old `extends` shape needs to change.
 *
 * Architectural role:
 * Composition-root deps seam, scoped to the integrations ADMIN routes only — distinct from
 * `modules/integrations.ts`, which owns the Forms-to-webhook fan-out SUBSCRIBER (a different
 * concern: internal event-driven delivery enqueue vs. admin CRUD over subscriptions). Not itself
 * a port (ADR-006) — a local type alias over the shared `RouteDeps`, same as `RouteRegistrar` is.
 *
 * 2026-08-18 (`RouteDeps` decomposition Slice 6): `webhookSubscriptionRepo`/`webhookDeliveryRepo` are
 * now their own named `WebhooksDeps` interface in `routes/types.ts`, so this composes it directly
 * instead of listing the 2 keys via `Pick`; `originRegistry` stays a separate `Pick<RouteDeps, ...>`
 * key here rather than joining `WebhooksDeps` — it is redirects/origin-domain infrastructure reused
 * by these routes, not a webhooks-owned field.
 */
export type IntegrationsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock" | "idGen" | "originRegistry"> & WebhooksDeps;

export type IntegrationsRouteRegistrar = (app: Express, deps: IntegrationsRouteDeps) => void;
