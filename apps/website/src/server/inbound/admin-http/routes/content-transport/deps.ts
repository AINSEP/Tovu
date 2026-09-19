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
 * - `blobStore`/`contentTransportBundleRepo`: added for Task 6 (blob pre-flight + bundle staging —
 *   `blobs-probe.ts`/`blob-put.ts`/`bundle-create.ts`). `blobStore` is the same real ADR-027
 *   `BlobStorePort` every media route already shares (`RouteDeps.blobStore`'s own doc) — Task 6
 *   reuses `putIfAbsent` directly rather than building a second dedupe path (plan §4 task 6's own
 *   instruction). `contentTransportBundleRepo` is new (this task): `content_transport_bundles`
 *   (migration `0066`) had no repo/port until now.
 * - `contentTransportBaselineRepo`/`dbOps`/`restorePointsRepo`/`gatedMutations`/
 *   `contentTransportApplyPort`: added for Task 7 (the gated `plan`/`confirm`/`execute` import
 *   ceremony — `import.ts`, `gated-hooks.ts`, `execute-import.ts`). `dbOps`/`restorePointsRepo`/
 *   `gatedMutations` are the same instance-wide singletons `taxonomy/merge-term.ts`/`database/
 *   migrate-forward.ts` already read directly off full `RouteDeps` — narrowed here instead of
 *   widening, per this file's own established pattern.
 */
export type ContentTransportRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "postRepo"
  | "pluginBeforeSaveHook"
  | "outbox"
  | "workspaceRepo"
  | "blobStore"
  | "contentTransportBundleRepo"
  | "contentTransportBaselineRepo"
  | "dbOps"
  | "restorePointsRepo"
  | "gatedMutations"
  | "contentTransportApplyPort"
>;

export type ContentTransportRouteRegistrar = (app: Express, deps: ContentTransportRouteDeps) => void;
