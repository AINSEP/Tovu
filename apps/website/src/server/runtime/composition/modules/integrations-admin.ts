import type { Express } from "express";

import { integrationsCreateRoute } from "@jini-ai/cms/admin-http/routes/integrations/create";
import { integrationsDeleteRoute } from "@jini-ai/cms/admin-http/routes/integrations/delete";
import { integrationsDeliveriesRoute } from "@jini-ai/cms/admin-http/routes/integrations/deliveries";
import { integrationsListRoute } from "@jini-ai/cms/admin-http/routes/integrations/list";
import { integrationsPauseRoute } from "@jini-ai/cms/admin-http/routes/integrations/pause";
import {
  createSubscription,
  deleteSubscription,
  pauseSubscription,
  WebhookSubscriptionNotFoundError,
  WebhookSubscriptionValidationError,
  type WebhookSubscriptionDeps,
} from "@jini-ai/integrations/webhooks/site/subscriptions";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps, WebhooksDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `integrations-admin` server module.
 *
 * Owns the 5 webhooks/integrations ADMIN routes (list/create/pause/delete/deliveries, ADR-036).
 * K1 (RT-K1-adm-integrations): all five are Jini route specs (`@jini-ai/cms/admin-http/routes/integrations/*`)
 * mounted behind the admin ports. `RouteDeps` is read only here, at registration: each mount builds
 * that route's own small deps object, so a spec never sees the whole bag. The webhook feature stays
 * Tovu's (`#src/features/webhooks`), injected as the three lifecycle services plus the two matchers
 * that recognise its validation and not-found errors.
 *
 * Distinct from `modules/integrations.ts` (already shipped in SPEC-031): that module owns the
 * Forms-to-webhook fan-out SUBSCRIBER — an internal, event-driven delivery-enqueue concern with
 * no HTTP surface. This module owns the admin CRUD/read HTTP surface over webhook subscriptions
 * and their delivery log — a different concern that happens to live in the same `integrations`
 * library. Two separate `ServerModuleHandle`s, two separate names, deliberately not merged into
 * one: `modules/integrations.ts`'s `start()` and this module's `registerRoutes()` have no shared
 * state and no ordering dependency on each other.
 */

/**
 * Integrations admin composition contract (ADR-036, ADR-046/SPEC-034).
 *
 * Subscription CRUD/delivery-list routes consume `WebhooksDeps` plus their identity,
 * clock, id-generation and origin ports. The origin registry has redirects/origin
 * ownership; see `WebhooksDeps` in `server/routes/types.ts`.
 *
 * This admin HTTP surface is distinct from the internal Forms-to-webhook subscriber.
 * The type is a local composition alias, not a port (ADR-006).
 */
export type IntegrationsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock" | "idGen" | "originRegistry"> & WebhooksDeps;

export type IntegrationsRouteRegistrar = (required: { app: Express; deps: IntegrationsRouteDeps }, optional?: Record<string, never>) => void;

/**
 * The subscription-lifecycle deps every service bound below hands `#src/features/webhooks`
 * (create, pause and delete), built in one place so each route uses the same target policy.
 *
 * ADR-PIPE-015 GAP-06: `isAllowedTarget` is the real core/origin egress oracle, replacing the
 * dev-only permitAllHttpsTargets stand-in. Fails closed on any parse failure or ambiguity.
 * Only create (and update) consult it — pause and delete never re-validate `targetUrl`.
 */
function toWebhookSubscriptionDeps(deps: IntegrationsRouteDeps, _optional: Record<string, never> = {}): WebhookSubscriptionDeps {
  return {
    clock: deps.clock,
    repo: deps.webhookSubscriptionRepo,
    idGenerator: deps.idGen,
    isAllowedTarget: ({ url }: { url: string }, _o = {}) =>
      deps.originRegistry.isAllowedEgressTarget({ context: { workspaceId: deps.workspaceId }, url: url }),
  };
}

/** The two port fields every integrations mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function integrationsPortDeps({ deps }: { deps: IntegrationsRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) and authorization mode each route had:
 *  create and pause consulted the publishing-credential override (`"guarded"`); list, delete and deliveries
 *  never did (`"direct"`). Switching either is an authorization change, not a move. */
function mountOptions(operation: string, authorization: AdminRouteAuthorization) {
  return { authorization, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** How the specs recognise the webhook feature's two anticipated failures, without importing its classes. */
const isValidationError = ({ err }: { err: unknown }, _optional: Record<string, never> = {}): boolean => err instanceof WebhookSubscriptionValidationError;
const isNotFoundError = ({ err }: { err: unknown }, _optional: Record<string, never> = {}): boolean => err instanceof WebhookSubscriptionNotFoundError;

/** The two repos the read routes use, read at registration like the hand-written routes read them per call. */
function integrationsReadDeps({ deps }: { deps: IntegrationsRouteDeps }, _optional: Record<string, never> = {}) {
  return { ...integrationsPortDeps({ deps }), webhookSubscriptionRepo: deps.webhookSubscriptionRepo, webhookDeliveryRepo: deps.webhookDeliveryRepo };
}

export const registerAdminIntegrationsListRoute: IntegrationsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: integrationsListRoute, deps: integrationsReadDeps({ deps }) }, mountOptions("routes/integrations/list", "direct"));
};

export const registerAdminIntegrationsCreateRoute: IntegrationsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const createDeps = {
    ...integrationsPortDeps({ deps }),
    // ADR-PIPE-015 GAP-06: the real core/origin egress oracle (see `toWebhookSubscriptionDeps`); built per request.
    createSubscription: (input: { workspaceId: string; label: string; targetUrl: string; topics: string[] }) => createSubscription({
      deps: toWebhookSubscriptionDeps(deps),
      input: {
        ...input,
        // Dev-mode single-actor placeholder, matching the session/command-gateway convention
        // (`dev-auth.ts`'s fixed `"user-local"` session subject) — no permissions feature yet.
        ownerPrincipalId: "user-local",
        createdByPrincipalId: "user-local",
      },
    }),
    isValidationError,
  };
  mountAdminJsonRoute({ app, spec: integrationsCreateRoute, deps: createDeps }, mountOptions("routes/integrations/create", "guarded"));
};

export const registerAdminIntegrationsPauseRoute: IntegrationsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const pauseDeps = {
    ...integrationsPortDeps({ deps }),
    // The shared egress policy is not exercised here: pause never re-validates targetUrl.
    pauseSubscription: ({ workspaceId, subscriptionId, paused }: { workspaceId: string; subscriptionId: string; paused: boolean }) =>
      pauseSubscription({ deps: toWebhookSubscriptionDeps(deps), input: { workspaceId, id: subscriptionId } }, { paused }),
    isNotFoundError,
    isValidationError,
  };
  mountAdminJsonRoute({ app, spec: integrationsPauseRoute, deps: pauseDeps }, mountOptions("routes/integrations/pause", "guarded"));
};

export const registerAdminIntegrationsDeleteRoute: IntegrationsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const deleteDeps = {
    ...integrationsPortDeps({ deps }),
    // The shared egress policy is not exercised here: delete never re-validates targetUrl.
    deleteSubscription: ({ workspaceId, subscriptionId }: { workspaceId: string; subscriptionId: string }) =>
      deleteSubscription({ deps: toWebhookSubscriptionDeps(deps), input: { workspaceId, id: subscriptionId } }),
    isNotFoundError,
  };
  mountAdminJsonRoute({ app, spec: integrationsDeleteRoute, deps: deleteDeps }, mountOptions("routes/integrations/delete", "direct"));
};

export const registerAdminIntegrationsDeliveriesRoute: IntegrationsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: integrationsDeliveriesRoute, deps: integrationsReadDeps({ deps }) }, mountOptions("routes/integrations/deliveries", "direct"));
};

export function createIntegrationsAdminModule(deps: IntegrationsRouteDeps): ServerModuleHandle {
  return {
    name: "integrations-admin",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminIntegrationsListRoute({ app, deps });
      registerAdminIntegrationsCreateRoute({ app, deps });
      registerAdminIntegrationsPauseRoute({ app, deps });
      registerAdminIntegrationsDeleteRoute({ app, deps });
      registerAdminIntegrationsDeliveriesRoute({ app, deps });
    },
  };
}
