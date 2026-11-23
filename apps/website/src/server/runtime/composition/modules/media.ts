import type { Express } from "express";
import { mediaDeleteRoute } from "@jini-ai/cms/admin-http/routes/media/delete";
import { mediaGetProvidersRoute } from "@jini-ai/cms/admin-http/routes/media/get-providers";
import { mediaTrashRoute } from "@jini-ai/cms/admin-http/routes/media/trash";
import { mediaWhereUsedRoute } from "@jini-ai/cms/admin-http/routes/media/where-used";
import { mediaImportUrlRoute } from "@jini-ai/cms/admin-http/routes/media/import-url";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { readRecordedContentType } from "@jini-ai/cms/media/site/content-type-resolution";
import { findMediaWhereUsed, getMediaProviderCredentials, purgeMedia, uploadMedia, type MediaRecord } from "#src/features/media/index";
import { fetchImage } from "#src/features/media-import/fetch-image";
import { EgressRefusedError } from "#src/platform/http/index";
import { resolveMediaPublicUrls } from "#src/features/media/public-urls";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { toAdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import { resolveMediaByteSizes } from "#src/server/inbound/admin-http/routes/media/byte-size";
import { registerAdminMediaTextRoute } from "#src/server/inbound/admin-http/routes/media/text";
import { registerAdminMediaListRoute } from "#src/server/inbound/admin-http/routes/media/list";
import { registerAdminMediaOriginalRoute } from "#src/server/inbound/admin-http/routes/media/original";
import { registerAdminMediaPutProvidersRoute } from "#src/server/inbound/admin-http/routes/media/put-providers";
import { registerAdminMediaUpdateRoute } from "#src/server/inbound/admin-http/routes/media/update";
import { registerAdminMediaUploadRoute } from "#src/server/inbound/admin-http/routes/media/upload";
import { registerAdminMediaReplaceRoute } from "#src/server/inbound/admin-http/routes/media/replace";
import type { MediaProviderRouteDeps, MediaProviderRouteRegistrar, MediaRenditionRouteDeps, MediaRouteDeps, MediaRouteRegistrar } from "#src/server/inbound/admin-http/routes/media/deps";
import { registerMediaOriginalVideoRoute, registerMediaRenditionRoute } from "#src/server/inbound/public-http/routes/site/media-rendition";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — the `media` server module.
 *
 * Owns the 6 admin media routes (list/upload/update/trash/delete/original, ADR-027 §7) plus the
 * public, unauthenticated rendition-serving route (`GET /m/:assetId/...`, ADR-027 §4 frozen URL
 * contract) that exercises the `sharp`-backed transform lifecycle (`imageTransformer.transform()`
 * via `resolveMediaRendition`) — moved here verbatim from `app.ts`'s `createApp()`, same registrar
 * function bodies, no behavior change.
 *
 * `registerAdminMediaOriginalRoute` (`apps/website/src/server/inbound/admin-http/routes/media/original.ts`) is new: an authenticated,
 * workspace-scoped `GET .../media/:mediaId/original` that serves an asset's ORIGINAL bytes with a
 * server-sniffed `Content-Type` — distinct from, and not a replacement for, the public rendition
 * route above (which only serves named/registered TRANSFORMS, and 404s for every asset today since
 * `transform_registry` is empty in a real deployment). See that route's own file header for the
 * full security rationale (content-type sniffing, SVG/HTML defusal, Range support).
 *
 * Ordering note (disclosed): in `app.ts` the public rendition route previously registered much
 * later, alongside the store/comments/analytics/forms "must precede the site `/:slug` catch-all"
 * group (~line 724). This module registers all 7 routes together at the point the admin media
 * block used to occupy (~line 535) — earlier than before, but the ONLY real constraint on that
 * route ("must precede `/:slug`") still holds trivially, since it's now registered even earlier
 * relative to the catch-all, and its fixed `/m/` prefix never overlaps any other route class in
 * this app. See SPEC-034 for the full disclosure.
 *
 * `registerMediaOriginalVideoRoute` (`routes/site/media-rendition.ts`, 2026-08-24) is an 8th route:
 * public and unauthenticated like the rendition route immediately above, but serves a video asset's
 * ORIGINAL bytes directly rather than through the image-transform pipeline — see that function's
 * own doc for why video can't go through `resolveMediaRendition` at all. Registered after the
 * rendition route for readability (both are `/m/` routes); Express disambiguates them by path
 * segment count, not registration order, so this ordering is not load-bearing.
 *
 * `ServerModuleHandle` factories receive already-built ports, per the ADR-046 Phase 3 convention
 * established by `modules/forms.ts`/`modules/integrations.ts` — this module does not construct
 * `SharpImageTransformer`/`InMemoryImageTransformer` itself; the composition root
 * (`apps/website/src/server/runtime/composition/app.ts`/`apps/website/src/server/runtime/composition/deps.ts`) still selects which concrete adapter `imageTransformer` is.
 *
 * 2026-09-03 member-gating sweep: the deps parameter widened from `MediaRouteDeps` alone to also
 * include `MediaRenditionRouteDeps`'s `postRepo`/member-repo fields, needed by
 * `registerMediaRenditionRoute`/`registerMediaOriginalVideoRoute` (see that type's own doc). No
 * new plumbing at the call site: `apps/website/src/server/runtime/composition/app.ts` already passes this factory the full `routeDeps`
 * object, which has carried `postRepo` and the three member repos since ADR-030.
 */
/** The two port fields every media spec mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a test's later reassignment of it is still honoured. */
function mediaPortDeps({ deps }: { deps: AdminJsonRoutePortDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The per-route `sendAdminFailure` options the hand-written route passed for an unexpected failure. */
const mediaFailure = (operation: string) => ({ operation, code: "INTERNAL_ERROR" });

/** GET the provider credential markers (Jini spec `mediaGetProvidersRoute`). It never consulted the
 *  publishing-credential override, so it mounts with `authorizeDirectOrRespond` semantics. */
export const registerAdminMediaGetProvidersRoute: MediaProviderRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: mediaGetProvidersRoute, deps: {
    ...mediaPortDeps({ deps }),
    getMediaProviderCredentials: (input) => getMediaProviderCredentials({ repo: deps.mediaProviderCredentialRepo, sealer: deps.siteAssistantSecretSealer }, input),
  } }, { authorization: "direct", failure: mediaFailure("routes/media/get-providers") });
};

/** DELETE hard-purge (Jini spec `mediaDeleteRoute`), behind `authorizeOrRespond` as before. Every
 *  collaborator is read per request, so a test's later `t.mock.method(deps, …)` is still honoured. */
export const registerAdminMediaDeleteRoute = ({ app, deps }: { app: Express; deps: MediaRouteDeps & MediaWhereUsedDeps }, _optional: Record<string, never> = {}): void => {
  mountAdminJsonRoute({ app, spec: mediaDeleteRoute, deps: {
    ...mediaPortDeps({ deps }),
    purgeMedia: (input) => purgeMedia({ deps: {
      mediaRepo: deps.mediaRepo, entryRefsRepo: deps.entryRefsRepo, postRepo: deps.postRepo, blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, clock: deps.clock,
    }, input }),
    forgetRemovedMedia: (input) => deps.forgetRemovedMedia(input),
  } }, { failure: mediaFailure("routes/media/delete") });
};

/** POST trash (Jini spec `mediaTrashRoute`), behind `authorizeDirectOrRespond` as before. */
export const registerAdminMediaTrashRoute: MediaRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: mediaTrashRoute, deps: {
    ...mediaPortDeps({ deps }),
    mediaRepo: { findById: (input) => deps.mediaRepo.findById(input) },
    removeMedia: (input) => deps.removeMedia(input),
    clock: { nowIso: () => deps.clock.nowIso() },
    toMediaResponse: ({ media }) => toTrashedMediaResponse({ deps, media }),
  } }, { authorization: "direct", failure: mediaFailure("routes/media/trash") });
};

/** The `RouteDeps` slice the usage route reads (the usage scan's repos plus the port fields). */
export type MediaWhereUsedDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "mediaRepo" | "entryRefsRepo" | "postRepo">;

/** GET where-used (Jini spec `mediaWhereUsedRoute`). It read `deps.authorize` directly, never the
 *  publishing-credential override, so it mounts with `authorizeDirectOrRespond` semantics. The usage
 *  scan reads `deps` per request, so a test's later replacement of a repo method is still honoured. */
export const registerAdminMediaWhereUsedRoute = ({ app, deps }: { app: Express; deps: MediaWhereUsedDeps }, _optional: Record<string, never> = {}): void => {
  mountAdminJsonRoute({ app, spec: mediaWhereUsedRoute, deps: {
    ...mediaPortDeps({ deps }),
    mediaRepo: { findById: (input) => deps.mediaRepo.findById(input) },
    findWhereUsed: (input) => findMediaWhereUsed({ deps, input }),
  } }, { authorization: "direct", failure: mediaFailure("routes/media/where-used") });
};

/** The `RouteDeps` slice the URL import reads: the asset routes' deps plus the dedicated egress client. */
export type MediaImportUrlRouteDeps = MediaRouteDeps & Pick<RouteDeps, "mediaImportHttpClient">;

/** POST import-url (Jini spec `mediaImportUrlRoute`). It read `deps.authorize` directly, so it mounts
 *  with `authorizeDirectOrRespond` semantics. `logEgressRefusal` receives an egress refusal's full
 *  diagnosis; without it, the operator console does.
 *  @complexity O(1) setup; per request as the spec. */
export function registerAdminMediaImportUrlRoute(
  { app, deps }: { app: Express; deps: MediaImportUrlRouteDeps },
  optional: { logEgressRefusal?: (line: string) => void } = {},
): void {
  mountAdminJsonRoute({ app, spec: mediaImportUrlRoute, deps: {
    ...mediaPortDeps({ deps }),
    // This is the dedicated MEDIA_IMPORT_EGRESS_POLICY client from composition, never the
    // credentialed-request client (which has a smaller cap and a different redirect policy).
    fetchImage: ({ url }) => fetchImage({ deps: { httpClient: deps.mediaImportHttpClient }, url }),
    uploadMedia: (input) => uploadMedia({
      deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
      input,
    }, { maxUploadBytes: MAX_DOCUMENT_BYTES }),
    mediaContentTypeStore: { set: (input) => deps.mediaContentTypeStore.set(input) },
    egressRefusalMessage: ({ error }) => egressRefusalMessage({ error }, { log: optional.logEgressRefusal }),
    toMediaResponse: async ({ media, contentType, byteSize }) => {
      const publicUrl = (await resolveMediaPublicUrls({ deps, assets: [media] })).get(media.id) ?? null;
      return toAdminMediaResponse({ media, contentType, publicUrl, byteSize });
    },
  } }, { authorization: "direct", failure: mediaFailure("routes/media/import-url") });
}

/** The caller-safe sentence for an egress refusal, or `undefined` for any other failure.
 *  @complexity O(1). */
function egressRefusalMessage({ error }: { error: unknown }, optional: { log?: ((line: string) => void) | undefined } = {}): string | undefined {
  if (!(error instanceof EgressRefusedError)) return undefined;
  // Full DNS diagnosis is operator-log-only, matching the assistant tool's refusal contract.
  (optional.log ?? console.warn)(`[media-import] admin URL import refused: ${error.message}`);
  return error.callerSafeMessage;
}

/** The admin response for the re-read asset: recorded type, public URL and stored size, read in parallel.
 *  @complexity O(1) — three independent single-asset lookups. */
async function toTrashedMediaResponse({ deps, media }: { deps: MediaRouteDeps; media: MediaRecord }, _options: Record<string, never> = {}) {
  const [contentType, publicUrl, byteSizes] = await Promise.all([
    readRecordedContentType({ deps, sha256: media.source.sha256 }),
    resolveMediaPublicUrls({ deps, assets: [media] }).then((urls) => urls.get(media.id) ?? null),
    resolveMediaByteSizes({ deps, media: [media] }),
  ]);
  return toAdminMediaResponse({ media, contentType, publicUrl, byteSize: byteSizes.get(media.source.sha256) ?? null });
}

export function createMediaModule(deps: MediaRouteDeps & MediaProviderRouteDeps & MediaRenditionRouteDeps & MediaImportUrlRouteDeps & MediaWhereUsedDeps): ServerModuleHandle {
  return {
    name: "media",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminMediaListRoute({ app, deps });
      registerAdminMediaWhereUsedRoute({ app, deps });
      registerAdminMediaUploadRoute({ app, deps });
      registerAdminMediaImportUrlRoute({ app, deps });
      registerAdminMediaReplaceRoute({ app, deps });
      registerAdminMediaUpdateRoute({ app, deps });
      registerAdminMediaTrashRoute({ app, deps });
      registerAdminMediaDeleteRoute({ app, deps });
      registerAdminMediaOriginalRoute({ app, deps });
      registerAdminMediaTextRoute({ app, deps });
      registerMediaRenditionRoute({ app, deps });
      registerMediaOriginalVideoRoute({ app, deps });
      registerAdminMediaGetProvidersRoute({ app, deps });
      registerAdminMediaPutProvidersRoute({ app, deps });
    },
  };
}
