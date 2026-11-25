/**
 * Owner policy: 50 MiB for media uploads, including Library documents, and 500 MiB for video
 * (owner 2026-11-24). One source: `@tovu/contracts/upload-limits`. Call sites pass the caps as
 * uploadMedia's override; Jini's default for other consumers' image/video uploads stays 10 MiB.
 */
import { UPLOAD_CAPS } from "@tovu/contracts/upload-limits";
import type { Express } from "express";
import { describeRequestFailure } from "@jini-ai/core";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";

import { mediaDeleteRoute } from "@jini-ai/cms/admin-http/routes/media/delete";
import { mediaGetProvidersRoute } from "@jini-ai/cms/admin-http/routes/media/get-providers";
import { mediaImportUrlRoute } from "@jini-ai/cms/admin-http/routes/media/import-url";
import { mediaPutProvidersRoute } from "@jini-ai/cms/admin-http/routes/media/put-providers";
import type { MediaAssetLookups, MediaErrorMapping } from "@jini-ai/cms/admin-http/routes/media/shared";
import { mediaTrashRoute } from "@jini-ai/cms/admin-http/routes/media/trash";
import { mediaUpdateRoute } from "@jini-ai/cms/admin-http/routes/media/update";
import type { MediaRecord } from "#src/features/media/index";
import { createConvertingUploader, type VideoImportOptions } from "#src/features/media/import-video-conversion";
import { toAdminMediaResponse } from "@jini-ai/cms/admin-http/http/media";
import { readRecordedContentType } from "@jini-ai/cms/media/site/content-type-resolution";
import { purgeMedia } from "@jini-ai/cms/media/site/purge-media";
import {
  getMediaProviderCredentials, MediaProviderCredentialSecretStoreUnconfiguredError, MediaProviderCredentialValidationError,
  saveMediaProviderCredentials, uploadMedia,
} from "#src/features/media/index";
import { fetchImage } from "#src/features/media-import/fetch-image";
import { EgressRefusedError } from "#src/platform/http/index";
import { resolveMediaPublicUrls } from "#src/features/media/public-urls";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { resolveMediaByteSizes } from "@jini-ai/cms/admin-http/routes/media/byte-size";
import { mediaWhereUsedRoute } from "@jini-ai/cms/admin-http/routes/media/where-used";
import { mediaGridRoute, type MediaGridRouteDeps } from "@jini-ai/cms/admin-http/routes/media/grid";
import { rejectRoute } from "@jini-ai/core/errors/route-refusal";
import type { SqlMediaRepo } from "#src/platform/db/repos/media-repo";
import { findMediaWhereUsed } from "@jini-ai/cms/media/site/where-used";
import type { RouteDeps } from "#src/server/routes/types";
import { mediaTextRoute } from "@jini-ai/cms/admin-http/routes/media/text";
import { mediaReplaceRoute, type MediaReplacement } from "@jini-ai/cms/admin-http/routes/media/replace";
import { mediaUploadRoute, type MediaUploadInput } from "@jini-ai/cms/admin-http/routes/media/upload";
import { readDocumentText, replaceMediaFile, type MediaKind, type UploadMediaDeps, type VideoCodecProbePort } from "@jini-ai/cms/media";
import { captureMediaUploaded } from "@jini-ai/cms/media/site/analytics";
import { createDocumentArchiveReader } from "@jini-ai/cms/media/site/document-archive";
import * as yauzl from "yauzl";
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from "@jini-ai/agent-plugins/lifecycle/yauzl";

/** Host binding: the installed yauzl SDK + agent-plugins streaming reader back the document archive guard. */
const documentArchiveDeps = { yauzl: yauzl as unknown as YauzlPort, createArchiveReader: createYauzlAgentPluginArchiveReader };
import { toStoredMediaResponse } from "#src/server/inbound/admin-http/routes/media/stored-media-response";
import type { FailureOptions } from "#src/server/inbound/shared/admin-failure";
import { registerAdminMediaListRoute } from "#src/server/inbound/admin-http/routes/media/list";
import { registerAdminMediaOriginalRoute } from "#src/server/inbound/admin-http/routes/media/original";
import type { MediaProviderRouteDeps, MediaProviderRouteRegistrar, MediaRenditionRouteDeps, MediaRouteDeps, MediaRouteRegistrar } from "#src/server/inbound/admin-http/routes/media/deps";
import { registerMediaOriginalVideoRoute, registerMediaRenditionRoute } from "#src/server/inbound/public-http/routes/site/media-rendition";
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
/**
 * K1 (RT-K1-adm-media): update, trash, delete and the two provider routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/media/*`) mounted behind the admin ports below; `RouteDeps` is read
 * only here, at registration, and each mount builds that route's own small deps. The host services
 * those specs need are injected here: the recorded-type/public-URL/blob-size lookups, the
 * transactional trash flip, the reference-checked purge and the provider credential store with its
 * error refusals. where-used and import-url (w3 C4/C4b) answer their own 403 bodies through `forbidden`.
 * text, replace and upload (w3 C4c) are JSON specs too: their bodies are the app-wide `express.json()`
 * parse, so no raw mount is needed. list and original stay hand-written (byte responses — see the K1 report).
 */

/** The host's outward wording of a classified refusal (the specs' REQUIRED `outwardErrorMessage`
 *  port): this host lets the classified error's own message through. */
const outwardErrorMessage = ({ error }: { error: Error }): string => error.message;

/** The two port fields every media mount passes, plus the outward-copy port the specs that refuse with
 *  a domain error's copy require. `authorize` is read per request, as the hand-written routes read
 *  `deps.authorize`, so a later reassignment of it (or a test's later `t.mock.method(deps, …)`) is still honoured. */
function mediaPortDeps(
  { deps }: { deps: Pick<MediaRouteDeps, "workspaceId" | "authorize"> },
  _optional: Record<string, never> = {},
): AdminJsonRoutePortDeps & { outwardErrorMessage: typeof outwardErrorMessage } {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params), outwardErrorMessage };
}

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) and authorization mode each route
 *  had (update mounts with its own operation-only copy instead, see `operationOnlyFailure`): delete
 *  consulted the publishing-credential override (`authorizeOrRespond`, `"guarded"`); the others,
 *  update included, did not (`"direct"`). Switching either is an authorization change, not a move. Each route
 *  made exactly one authorization call, so no mount needs `authorizationByPermission`; and every one
 *  read the session before its params/body, so none opts into `deferMissingPrincipal`. */
function mountOptions(
  { operation, authorization }: { operation: string; authorization: AdminRouteAuthorization },
  optional: Pick<AdminJsonRouteMountOptions, "forbidden"> = {},
): AdminJsonRouteMountOptions {
  return { authorization, failure: { operation, code: "INTERNAL_ERROR" }, ...optional };
}

/** update's hand-written 500 came from `adminFailureResponse` with the operation alone, never the
 *  request's method/route, so its copy is the operation-derived one. `sendAdminFailure` prefers the
 *  route. With today's vocabulary the two happen to match ("Save media item"), but a route-keyed
 *  vocabulary entry would silently change the moved route. Pinned here as explicit copy, as seo.ts
 *  does for put-entry, so the route keeps answering as before. */
function operationOnlyFailure({ operation }: { operation: string }, _optional: Record<string, never> = {}): AdminJsonRouteMountOptions["failure"] {
  const copy = describeRequestFailure({ operation, vocabulary: ADMIN_FAILURE_VOCABULARY });
  return { operation, message: copy.message, failure: { action: copy.action, step: copy.step } };
}

/** The single-asset DTO lookups, bound to the host's content-type store, public-URL resolver and blob sizes. */
function mediaAssetLookups({ deps }: { deps: MediaRouteDeps }, _optional: Record<string, never> = {}): MediaAssetLookups {
  return {
    readContentType: ({ sha256 }) => readRecordedContentType({ deps, sha256 }),
    resolvePublicUrl: async ({ media }) => (await resolveMediaPublicUrls({ deps, assets: [media] })).get(media.id) ?? null,
    resolveByteSize: async ({ media }) => (await resolveMediaByteSizes({ deps, media: [media] })).get(media.source.sha256) ?? null,
  };
}

/** The provider store's refusals: its own validation message (400), and the operator copy for a
 *  missing site key (503), detected before any write lands. */
const MEDIA_PROVIDER_SAVE_ERRORS: readonly MediaErrorMapping[] = [
  { matches: ({ err }) => err instanceof MediaProviderCredentialValidationError, status: 400, code: "MEDIA_PROVIDER_CREDENTIAL_VALIDATION_ERROR" },
  {
    matches: ({ err }) => err instanceof MediaProviderCredentialSecretStoreUnconfiguredError, status: 503, code: "SECRET_STORE_UNCONFIGURED",
    error: "the media provider credential store is not configured — set TOVU_SITE_KEY (a hex-encoded site key) in the server environment",
  },
];

/** `text`: Jini `mediaTextRoute` with the host's 64 KiB document-text pager bound. Its hand-written check
 *  called `deps.authorize` directly (`"direct"`) and denied with its own body (no `details`), kept by
 *  `forbidden`; its 500 was `sendAdminFailure`'s route-derived copy, so the mount names no `failure`. */
export function registerAdminMediaTextRoute(required: { app: Express; deps: MediaRouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const readText = (input: { workspaceId: string; id: string; offset: number }) => readDocumentText({
    deps: { mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, blobStore: deps.blobStore, documentTextExtractors: deps.documentTextExtractors }, input,
  });
  mountAdminJsonRoute({ app, spec: mediaTextRoute, deps: { ...mediaPortDeps({ deps }), readText } }, {
    authorization: "direct",
    forbidden: () => ({ status: 403, body: { error: "media.read is required", code: "FORBIDDEN" } }),
  });
}

/** The private 500 upload and replace shared (`sendValidationOrInternalError`'s operation and copy). */
const MEDIA_WRITE_FAILURE: FailureOptions = { operation: "routes/media/route-guards", code: "INTERNAL_ERROR", message: "The media upload or change could not finish." };

/** `replace`: Jini `mediaReplaceRoute` with the host's transactional file switch (50 MiB owner cap) and the
 *  stored-asset describer bound. Its hand-written check used `authorizeDirectOrRespond` (`"direct"`). */
export function registerAdminMediaReplaceRoute(
  { app, deps }: { app: Express; deps: MediaRouteDeps },
  { videoCodecProbe }: { videoCodecProbe?: VideoCodecProbePort | undefined } = {},
): void {
  const replaceDeps = {
    ...mediaPortDeps({ deps }),
    mediaRepo: deps.mediaRepo,
    ...UPLOAD_CAPS,
    replaceFile: (input: MediaReplacement) => replaceMediaFile({ deps, ...input }, { ...UPLOAD_CAPS, videoCodecProbe }),
    describeStored: (input: { media: MediaRecord; contentType: string; byteLength: number }) => toStoredMediaResponse({ deps, ...input }),
  };
  mountAdminJsonRoute({ app, spec: mediaReplaceRoute, deps: replaceDeps }, { authorization: "direct", failure: MEDIA_WRITE_FAILURE });
}

/** The product-event kind of an upload: its document/media kind refined by the verified MIME family. */
function uploadedMediaKind(required: { kind: string; contentType: string }, _optional = {}): "document" | "image" | "audio" | "video" | "other" {
  const family = required.contentType.split("/")[0];
  if (required.kind === "document") return "document";
  if (family === "image" || family === "audio" || family === "video") return family;
  return "other";
}

export type { VideoImportOptions };

/**
 * `upload`: Jini `mediaUploadRoute` with the host's upload pipeline (50 MiB owner cap, document archive
 * reader), sniff-type store, product event and stored-asset describer bound. Its hand-written route
 * refused a bad body BEFORE reading the session, so the mount defers a missing principal to `authorize`;
 * its check used `authorizeDirectOrRespond` (`"direct"`).
 *
 * Request body is JSON with base64-encoded bytes (`dataBase64`) rather than a
 * multipart/form-data stream — this repo has no multipart-parsing dependency
 * yet (no `multer` in `package.json`), and adding one is out of scope for this
 * walking skeleton. This is a real, disclosed simplification: a production
 * upload path should stream bytes (multipart or raw octet-stream), not
 * base64-inflate them through JSON. `express.json()`'s body-size limit was
 * bumped in `server/runtime/composition/app.ts` to accommodate this (see that file's comment).
 * The video import rule (2026-10-31) is opt-in through `videoImport`, so a bare mount never converts.
 */
export function registerAdminMediaUploadRoute(
  { app, deps }: { app: Express; deps: MediaRouteDeps },
  { videoImport }: { videoImport?: VideoImportOptions } = {},
): void {
  const uploadPorts = {
    clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo,
    renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, documentArchiveReader: createDocumentArchiveReader(documentArchiveDeps),
  };
  // The owner's video import size rule (a video over the import size is converted after it is stored, the original stays)
  // is applied by the one shared uploader every import path uses; see import-video-conversion.ts.
  const convertingUpload = createConvertingUploader({ uploadDeps: uploadPorts, caps: UPLOAD_CAPS, mediaRepo: deps.mediaRepo, clock: deps.clock }, { video: videoImport });
  const storeUpload = (input: MediaUploadInput) => convertingUpload({ workspaceId: deps.workspaceId, ...input });
  const uploadDeps = {
    ...mediaPortDeps({ deps }),
    storeUpload,
    recordContentType: ({ sha256, contentType }: { sha256: string; contentType: string }) => deps.mediaContentTypeStore.set({ workspaceId: deps.workspaceId, sha256, contentType }),
    onUploaded: ({ actorId, kind, contentType, byteLength }: { actorId: string; kind: MediaKind; contentType: string; byteLength: number }) => captureMediaUploaded({
      tracker: deps.tracker, actorId, byteLength, kind: uploadedMediaKind({ kind, contentType }), source: "admin",
    }),
    describeStored: (input: { media: MediaRecord; contentType: string; byteLength: number }) => toStoredMediaResponse({ deps, ...input }),
  };
  mountAdminJsonRoute({ app, spec: mediaUploadRoute, deps: uploadDeps }, { authorization: "direct", failure: MEDIA_WRITE_FAILURE, deferMissingPrincipal: true });
}

export const registerAdminMediaUpdateRoute: MediaRouteRegistrar = ({ app, deps }, _options = {}) => {
  const updateDeps = { ...mediaPortDeps({ deps }), ...mediaAssetLookups({ deps }), clock: deps.clock, mediaRepo: deps.mediaRepo };
  mountAdminJsonRoute({ app, spec: mediaUpdateRoute, deps: updateDeps }, { authorization: "direct", failure: operationOnlyFailure({ operation: "routes/media/update" }) });
};

export const registerAdminMediaTrashRoute: MediaRouteRegistrar = ({ app, deps }, _options = {}) => {
  const trashDeps = { ...mediaPortDeps({ deps }), ...mediaAssetLookups({ deps }), clock: deps.clock, mediaRepo: deps.mediaRepo, removeMedia: deps.removeMedia };
  mountAdminJsonRoute({ app, spec: mediaTrashRoute, deps: trashDeps }, mountOptions({ operation: "routes/media/trash", authorization: "direct" }));
};

export const registerAdminMediaDeleteRoute = ({ app, deps }: { app: Express; deps: MediaRouteDeps & MediaWhereUsedDeps }, _optional: Record<string, never> = {}): void => {
  const purgeDeps = {
    mediaRepo: deps.mediaRepo, entryRefsRepo: deps.entryRefsRepo, postRepo: deps.postRepo, blobRepo: deps.assetBlobRepo,
    renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, clock: deps.clock,
  };
  const deleteDeps = {
    ...mediaPortDeps({ deps }),
    purgeMedia: (input: { workspaceId: string; id: string }) => purgeMedia({ deps: purgeDeps, input }),
    forgetRemovedMedia: (input: { workspaceId: string; id: string }) => deps.forgetRemovedMedia(input),
  };
  mountAdminJsonRoute({ app, spec: mediaDeleteRoute, deps: deleteDeps }, mountOptions({ operation: "routes/media/delete", authorization: "guarded" }));
};

export const registerAdminMediaGetProvidersRoute: MediaProviderRouteRegistrar = ({ app, deps }, _options = {}) => {
  const getProviders = ({ workspaceId }: { workspaceId: string }) =>
    getMediaProviderCredentials({ repo: deps.mediaProviderCredentialRepo, sealer: deps.siteAssistantSecretSealer }, { workspaceId });
  mountAdminJsonRoute({ app, spec: mediaGetProvidersRoute, deps: { ...mediaPortDeps({ deps }), getProviders } }, mountOptions({ operation: "routes/media/get-providers", authorization: "direct" }));
};

export const registerAdminMediaPutProvidersRoute: MediaProviderRouteRegistrar = ({ app, deps }, _options = {}) => {
  const saveProviders = ({ workspaceId, providers }: { workspaceId: string; providers: Record<string, unknown> }) => saveMediaProviderCredentials(
    {
      repo: deps.mediaProviderCredentialRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring,
      clock: deps.clock, providerCatalog: deps.mediaProviderRegistry,
    },
    { workspaceId, providers: providers as Record<string, never> },
  );
  const putDeps = { ...mediaPortDeps({ deps }), saveProviders, saveErrorMappings: MEDIA_PROVIDER_SAVE_ERRORS };
  mountAdminJsonRoute({ app, spec: mediaPutProvidersRoute, deps: putDeps }, mountOptions({ operation: "routes/media/put-providers", authorization: "direct" }));
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
  } }, mountOptions({ operation: "routes/media/where-used", authorization: "direct" }));
};

/** The `RouteDeps` slice the URL import reads: the asset routes' deps plus the dedicated egress client. */
export type MediaImportUrlRouteDeps = MediaRouteDeps & Pick<RouteDeps, "mediaImportHttpClient">;

/** The bounded grid queries; the durable SQL media repo provides them, in-memory doubles do not. */
type MediaGridQueries = Pick<SqlMediaRepo, "listGridPage" | "findGridItem">;

/** The repo's bounded grid queries, or a plain 501 when this store has none. Read per
 *  request so a test's later replacement of the repo or one of its methods is honoured.
 *  @complexity O(1). */
function gridQueries({ repo }: { repo: MediaRouteDeps["mediaRepo"] }, _optional: Record<string, never> = {}): MediaGridQueries {
  const candidate = repo as Partial<MediaGridQueries>;
  if (typeof candidate.listGridPage === "function" && typeof candidate.findGridItem === "function") return repo as unknown as MediaGridQueries;
  // Never fall back to a full-library read and slice it: that is the unbounded path this route replaces.
  return rejectRoute({ status: 501, error: "this media store cannot answer grid pages" });
}

/** DTO enrichment for exactly the answered rows: recorded content types only (no byte sniffing on a
 *  grid read), public URLs and blob sizes. @complexity O(n) in `media.length` plus the batch lookups. */
async function enrichGridMedia({ deps, media }: { deps: MediaRouteDeps; media: readonly MediaRecord[] }, _optional: Record<string, never> = {}): ReturnType<MediaGridRouteDeps["enrichMedia"]> {
  const sha256s = [...new Set(media.filter((item) => item.kind !== "document").map((item) => item.source.sha256))];
  const [contentTypesBySha256, publicUrlsById, byteSizesBySha256] = await Promise.all([
    deps.mediaContentTypeStore.getMany({ workspaceId: deps.workspaceId, sha256s }),
    resolveMediaPublicUrls({ deps, assets: media }),
    resolveMediaByteSizes({ deps, media }),
  ]);
  return { contentTypesBySha256, publicUrlsById, byteSizesBySha256 };
}

/** GET grid (Jini spec `mediaGridRoute`): one bounded page or one exact asset, beside the full list.
 *  Like the list route it answers 404 for a foreign workspace and asks `media.read` directly. Only the
 *  newest-first order is paged: no SQL collation reproduces the admin's `localeCompare` title order,
 *  so alphabetical stays on the full list until a persisted sort key exists.
 *  @complexity O(1) setup; per request one bounded page read plus the summary aggregate. */
export const registerAdminMediaGridRoute = ({ app, deps }: { app: Express; deps: MediaRouteDeps }, _optional: Record<string, never> = {}): void => {
  mountAdminJsonRoute({ app, spec: mediaGridRoute, deps: {
    ...mediaPortDeps({ deps }),
    readPage: (required, optional) => {
      if (required.orderBy !== "created") return rejectRoute({ status: 400, error: "alphabetical order is not available in pages yet" });
      return gridQueries({ repo: deps.mediaRepo }).listGridPage(required, optional);
    },
    findItem: (required) => gridQueries({ repo: deps.mediaRepo }).findGridItem(required),
    enrichMedia: ({ media }) => enrichGridMedia({ deps, media }),
  } }, mountOptions({ operation: "routes/media/grid", authorization: "direct" }));
};

/** POST import-url (Jini spec `mediaImportUrlRoute`). It read `deps.authorize` directly, so it mounts
 *  with `authorizeDirectOrRespond` semantics. `logEgressRefusal` receives an egress refusal's full
 *  diagnosis; without it, the operator console does.
 *  @complexity O(1) setup; per request as the spec. */
export function registerAdminMediaImportUrlRoute(
  { app, deps }: { app: Express; deps: MediaImportUrlRouteDeps },
  optional: { logEgressRefusal?: (line: string) => void; videoImport?: VideoImportOptions } = {},
): void {
  const convertingUpload = createConvertingUploader({
    uploadDeps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    caps: UPLOAD_CAPS, mediaRepo: deps.mediaRepo, clock: deps.clock,
  }, { video: optional.videoImport });
  mountAdminJsonRoute({ app, spec: mediaImportUrlRoute, deps: {
    ...mediaPortDeps({ deps }),
    // This is the dedicated MEDIA_IMPORT_EGRESS_POLICY client from composition, never the
    // credentialed-request client (which has a smaller cap and a different redirect policy).
    fetchImage: ({ url }) => fetchImage({ deps: { httpClient: deps.mediaImportHttpClient }, url }),
    uploadMedia: (input) => convertingUpload(input),
    mediaContentTypeStore: { set: (input) => deps.mediaContentTypeStore.set(input) },
    egressRefusalMessage: ({ error }) => egressRefusalMessage({ error }, { log: optional.logEgressRefusal }),
    toMediaResponse: async ({ media, contentType, byteSize }) => {
      const publicUrl = (await resolveMediaPublicUrls({ deps, assets: [media] })).get(media.id) ?? null;
      return toAdminMediaResponse({ media, contentType, publicUrl, byteSize });
    },
  } }, mountOptions({ operation: "routes/media/import-url", authorization: "direct" }));
}

/** The caller-safe sentence for an egress refusal, or `undefined` for any other failure.
 *  @complexity O(1). */
function egressRefusalMessage({ error }: { error: unknown }, optional: { log?: ((line: string) => void) | undefined } = {}): string | undefined {
  if (!(error instanceof EgressRefusedError)) return undefined;
  // Full DNS diagnosis is operator-log-only, matching the assistant tool's refusal contract.
  (optional.log ?? console.warn)(`[media-import] admin URL import refused: ${error.message}`);
  return error.callerSafeMessage;
}

export function createMediaModule(
  deps: MediaRouteDeps & MediaProviderRouteDeps & MediaRenditionRouteDeps & MediaImportUrlRouteDeps & MediaWhereUsedDeps,
  { videoImport }: { videoImport?: VideoImportOptions } = {},
): ServerModuleHandle {
  return {
    name: "media",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminMediaListRoute({ app, deps });
      registerAdminMediaGridRoute({ app, deps });
      registerAdminMediaWhereUsedRoute({ app, deps });
      registerAdminMediaUploadRoute({ app, deps }, { videoImport });
      registerAdminMediaImportUrlRoute({ app, deps }, { videoImport });
      registerAdminMediaReplaceRoute({ app, deps }, { videoCodecProbe: videoImport?.ports.videoCodecProbe });
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
