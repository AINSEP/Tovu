import type { Express } from "express";

import type { WebhookSubscriptionDeps } from "#src/features/webhooks/index";
import type { RouteDeps, WebhooksDeps } from "#src/server/routes/types";

/**
 * @file Integrations admin composition contract (ADR-036, ADR-046/SPEC-034).
 *
 * Subscription CRUD/delivery-list routes consume `WebhooksDeps` plus their identity,
 * clock, id-generation and origin ports. The origin registry has redirects/origin
 * ownership; see `WebhooksDeps` in `server/routes/types.ts`.
 *
 * This admin HTTP surface is distinct from the internal Forms-to-webhook subscriber.
 * The type is a local composition alias, not a port (ADR-006).
 */
export type IntegrationsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock" | "idGen" | "originRegistry"> & WebhooksDeps;

export type IntegrationsRouteRegistrar = (app: Express, deps: IntegrationsRouteDeps) => void;

/**
 * The subscription-lifecycle deps every route in this directory hands `#src/features/webhooks`
 * (create, pause and delete), built in one place so each route uses the same target policy.
 *
 * ADR-PIPE-015 GAP-06: `isAllowedTarget` is the real core/origin egress oracle, replacing the
 * dev-only permitAllHttpsTargets stand-in. Fails closed on any parse failure or ambiguity.
 * Only create (and update) consult it — pause and delete never re-validate `targetUrl`.
 */
export function toWebhookSubscriptionDeps(deps: IntegrationsRouteDeps): WebhookSubscriptionDeps {
  return {
    clock: deps.clock,
    repo: deps.webhookSubscriptionRepo,
    idGenerator: deps.idGen,
    isAllowedTarget: (url: string) =>
      deps.originRegistry.isAllowedEgressTarget({ context: { workspaceId: deps.workspaceId }, url: url }),
  };
}
