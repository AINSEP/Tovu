import type { Express } from "express";

import type { ClockDeps, MediaDeps, RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — narrow `RouteDeps` slice for the `media` server module.
 *
 * Purpose:
 * Unlike `routes/admin/members/deps.ts`/`routes/admin/integrations/deps.ts` (which `extends
 * RouteDeps` to WIDEN it — a historical pattern from when those fields hadn't landed on the
 * shared `RouteDeps` yet), this is a genuine NARROWING: `mediaRepo`/`assetBlobRepo`/
 * `assetRenditionRepo`/`blobStore`/`transformDefinitionRepo`/`imageTransformer` have been on
 * `RouteDeps` since ADR-027, so this file's only job is to state the exact subset the 6 media
 * routes (5 admin + 1 public rendition) actually read, matching `routes/ops/health.ts`'s
 * `NoDepsRouteRegistrar` precedent for what a module's real dependency surface should look like.
 *
 * 2026-08-18 (`RouteDeps` decomposition Slice 2): those same 6 fields are now their own named
 * `MediaDeps` interface in `routes/types.ts`, so this composes `MediaDeps` directly instead of
 * re-listing the keys via a second `Pick`; `workspaceId`/`authorize` (from `IdentityDeps`, picked
 * individually rather than pulling in the whole interface — none of the 14 other identity/auth-repo
 * fields are read here) and `clock`/`idGen` (`ClockDeps`, pulled in whole since it is exactly these
 * two fields) round out the same set as before, byte-for-byte.
 *
 * How it relates to the project:
 * - `modules/media.ts` takes this same `MediaRouteDeps` shape as its factory parameter.
 * - Any `RouteDeps` object (both `server/app.ts`'s and `server/deps.ts`'s) structurally satisfies
 *   this type already — no composition-root change needed to adopt it.
 */
export type MediaRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & ClockDeps & MediaDeps;

export type MediaRouteRegistrar = (app: Express, deps: MediaRouteDeps) => void;

/**
 * Widened (not narrowed) slice for the TWO public routes typed against it via
 * {@link MediaRenditionRouteRegistrar} below (`routes/site/media-rendition.ts`'s
 * `registerMediaRenditionRoute`/`registerMediaOriginalVideoRoute`) — deliberately kept separate
 * from {@link MediaRouteDeps} rather than widening that shared type, so the 6 ADMIN media routes
 * (list/upload/update/trash/delete/original — all still typed against `MediaRouteDeps` above via
 * `MediaRouteRegistrar`) never gain unused `postRepo`/member-repo fields on their own composition
 * surface.
 *
 * The 2026-09-03 member-gating sweep (this file's own sibling routes were never gated — see
 * `routes/site/pages.ts` ADR-030 §4, and `9bf661e9`'s content-API fix) found that these two
 * PUBLIC, unauthenticated routes serve an asset's bytes purely by `assetId`, with no
 * member-gating hook at all: an image/video embedded in a members-only post's body stayed
 * directly fetchable by URL even after the post itself 404s to an anonymous caller.
 * `postRepo` is the derivation seam that closes this — `media-rendition.ts` walks published
 * posts' `bodyJson` for the requested `assetId` (mirroring `pages.ts`'s own
 * `collectImageAssetIds` walk) rather than requiring a new asset->post foreign key, and the
 * three member repo ports are the same `MemberAccessResolver` construction ingredients
 * `pages.ts`/`get-by-slug.ts` already use.
 */
export type MediaRenditionRouteDeps = MediaRouteDeps &
  Pick<RouteDeps, "postRepo" | "memberSessionRepo" | "memberSubscriptionRepo" | "memberTierRepo">;

export type MediaRenditionRouteRegistrar = (app: Express, deps: MediaRenditionRouteDeps) => void;

/**
 * Slice for the two media-PROVIDER-credential routes (`get-providers.ts`/`put-providers.ts`).
 *
 * Kept separate from `MediaRouteDeps` above rather than widening it: those 7 routes move asset
 * bytes and need the blob/rendition/transform ports, while these 2 store vendor API keys and need
 * the sealer/keyring instead. Neither set reads the other's fields, and a single union would make
 * every asset route look like it depends on the secret store.
 *
 * The sealer and keyring are ADR-058's instances, reused rather than re-derived — `SecretSealerPort`
 * is a generic seal/open primitive and does not need a second domain-separation boundary per table,
 * the same reasoning `adminExecutionCredentials` already relies on.
 */
export type MediaProviderRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "mediaProviderCredentialRepo"
  | "siteAssistantSecretSealer"
  | "siteAssistantSecretKeyring"
>;

export type MediaProviderRouteRegistrar = (app: Express, deps: MediaProviderRouteDeps) => void;
