import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Task 4 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.1/§4 task 4.
 *
 * Narrow `RouteDeps` slice for the `content-transport` server module, mirroring
 * `routes/content/deps.ts`'s `ContentRouteDeps` (SPEC-038's established pattern): a genuine
 * narrowing to the fields the export route actually reads, not a widening of `RouteDeps`.
 *
 * - `workspaceId`/`authorize`/`clock`/`idGen`: the mount-path 404 guard, the `content.transport.read`
 *   gate, and `ContentTransportDeps`'s own `clock`/`idGen` fields (plan §3's `ContentTransportDeps`).
 * - `postRepo`/`pluginBeforeSaveHook`/`outbox`: threaded into `ContentTransportDeps` so the `post`/
 *   `page` contributors' `build()` gets the same repo/hook/outbox instances every other post/page
 *   route in this composition root uses — see `features/post/content-transport.ts`'s `buildHandler`.
 * - `workspaceRepo`: resolves the export bundle's `sourceLabel` (the workspace's own `name`) —
 *   see `export.ts`'s own doc for why a peer needs a human label, not just the raw workspace id.
 */
export type ContentTransportRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "clock" | "idGen" | "postRepo" | "pluginBeforeSaveHook" | "outbox" | "workspaceRepo"
>;

export type ContentTransportRouteRegistrar = (app: Express, deps: ContentTransportRouteDeps) => void;
