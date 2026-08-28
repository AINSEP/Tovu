import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Narrow `RouteDeps` slice for the `external-mcp` server module, in the shape
 * `routes/admin/connectors/deps.ts` and `routes/admin/media/deps.ts` established.
 *
 * One slice rather than connectors' two: every route here reads the same roster, and the write
 * routes need the sealer that the read route does not. Splitting on that axis would separate a
 * three-route family whose members already share a table, a permission and a validation module —
 * the narrowing would cost more than it documents.
 *
 * The sealer and keyring are ADR-058's shared instances, reused rather than re-derived, the same
 * call the Composio and media-provider credential routes make.
 */
export type ExternalMcpRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "clock" | "externalMcpServerRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring"
>;

export type ExternalMcpRouteRegistrar = (app: Express, deps: ExternalMcpRouteDeps) => void;
