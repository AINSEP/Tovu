import type { Express } from "express";

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
