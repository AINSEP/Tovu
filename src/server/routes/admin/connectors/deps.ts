import type { Express } from "express";

import type { ComposioConnectors } from "#src/connectors/composio-service";
import type { RouteDeps } from "../../types";

/**
 * @file Narrow `RouteDeps` slice for the `connectors` server module — a genuine narrowing in the
 * shape `routes/admin/media/deps.ts` established, not the historical widening pattern
 * `routes/admin/integrations/deps.ts` uses.
 *
 * Two slices, split on the same axis media's are: the catalog routes read Composio through the
 * long-lived service and need no secrets, while the two config routes seal an API key and need the
 * sealer/keyring instead. Neither set reads the other's fields, and a single union would make every
 * catalog read look like it depends on the secret store.
 *
 * The sealer and keyring are ADR-058's instances, reused rather than re-derived — the same call
 * `mediaProviderCredentialRepo`'s routes already make.
 */
export type ConnectorsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock"> & {
  composioConnectors: ComposioConnectors;
};

export type ConnectorsRouteRegistrar = (app: Express, deps: ConnectorsRouteDeps) => void;

export type ConnectorsConfigRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "clock" | "composioConfigRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring"
> & {
  composioConnectors: ComposioConnectors;
};

export type ConnectorsConfigRouteRegistrar = (app: Express, deps: ConnectorsConfigRouteDeps) => void;
