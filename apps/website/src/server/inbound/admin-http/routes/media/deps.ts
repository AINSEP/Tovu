import type { Express } from "express";

import type { ClockDeps, MediaDeps, RouteDeps } from "#src/server/routes/types";

/**
 * @file Narrow media admin composition contract (ADR-046/SPEC-034).
 *
 * Composes `MediaDeps` and `ClockDeps`, with only the required identity/removal fields
 * picked separately. Both composition roots satisfy this shape. See `MediaDeps` in
 * `server/routes/types.ts` for the group boundary.
 */
export type MediaRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "removeMedia" | "forgetRemovedMedia"> &
  ClockDeps &
  MediaDeps;

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
 * Public asset URLs must enforce member access even when requested directly, otherwise
 * an image/video embedded in a members-only post remains fetchable after that post 404s.
 * `postRepo` provides the derivation seam — `media-rendition.ts` walks published
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
