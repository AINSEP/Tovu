import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Task 4 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.1/§4 task 4.
 *
 * Narrow `RouteDeps` slice for the `publish-content` server module, mirroring
 * `routes/content/deps.ts`'s `ContentRouteDeps` (SPEC-038's established pattern): a genuine
 * narrowing to the fields the export route actually reads, not a widening of `RouteDeps`.
 *
 * - `workspaceId`/`authorize`/`clock`/`idGen`: the mount-path 404 guard, the `publish_content.read`
 *   gate, and `PublishContentDeps`'s own `clock`/`idGen` fields (plan §3's `PublishContentDeps`).
 * - `postRepo`/`pluginBeforeSaveHook`/`outbox`: threaded into `PublishContentDeps` so the `post`/
 *   `page` contributors' `build()` gets the same repo/hook/outbox instances every other post/page
 *   route in this composition root uses — see `features/post/publish-content.ts`'s `buildHandler`.
 * - `workspaceRepo`: resolves the export bundle's `sourceLabel` (the workspace's own `name`) —
 *   see `export.ts`'s own doc for why a peer needs a human label, not just the raw workspace id.
 * - `blobStore`/`publishContentBundleRepo`: added for Task 6 (blob pre-flight + bundle staging —
 *   `blobs-probe.ts`/`blob-put.ts`/`bundle-create.ts`). `blobStore` is the same real ADR-027
 *   `BlobStorePort` every media route already shares (`RouteDeps.blobStore`'s own doc) — Task 6
 *   reuses `putIfAbsent` directly rather than building a second dedupe path (plan §4 task 6's own
 *   instruction). `publishContentBundleRepo` is new (this task): `publish_content_bundles`
 *   (migration `0066`) had no repo/port until now.
 * - `publishContentBaselineRepo`/`dbOps`/`restorePointsRepo`/`gatedMutations`/
 *   `publishContentApplyPort`: added for Task 7 (the gated `plan`/`confirm`/`execute` import
 *   ceremony — `import.ts`, `gated-hooks.ts`, `execute-import.ts`). `dbOps`/`restorePointsRepo`/
 *   `gatedMutations` are the same instance-wide singletons `taxonomy/merge-term.ts`/`database/
 *   migrate-forward.ts` already read directly off full `RouteDeps` — narrowed here instead of
 *   widening, per this file's own established pattern.
 * - `publishContentPeerRepo`/`publishContentPeerHttpClient`/`siteAssistantSecretSealer`/
 *   `siteAssistantSecretKeyring`: added for Task 10 (peers CRUD + the outbound push/pull driver —
 *   `peers.ts`, `peer-transport.ts`). The sealer/keyring pair is the SHARED ADR-058 pair every
 *   credential table in this codebase uses, narrowed here rather than widened (same reasoning
 *   `routes/types.ts`'s own doc records for the two config routes that already read them).
 *   `publishContentPeerHttpClient` is a guarded `HttpClientPort` built from this feature's own
 *   `createPublishContentPeerEgressPolicy()` — never a client any other consumer shares, because it
 *   is the only one whose `devHostAllowlist` is operator-configurable.
 */
export type PublishContentRouteDeps = Pick<
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
  | "publishContentBundleRepo"
  | "publishContentBaselineRepo"
  | "dbOps"
  | "restorePointsRepo"
  | "gatedMutations"
  | "publishContentApplyPort"
  | "publishContentPeerRepo"
  | "publishContentPeerHttpClient"
  | "siteAssistantSecretSealer"
  | "siteAssistantSecretKeyring"
>;

export type PublishContentRouteRegistrar = (app: Express, deps: PublishContentRouteDeps) => void;
