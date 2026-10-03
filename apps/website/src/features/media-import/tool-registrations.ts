import type { Clock, IdGenerator } from "@jini-ai/core/primitives";
import { buildDomainRegistrations, indexCatalogById, optionalString, requireInputRecord, requireString, withSchemaOnRejection, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";
// `EgressRefusedError` is a runtime import, and the ONLY one this file takes from `platform/http` —
// the barrel is otherwise types-only by design. Imported for `instanceof`, not to construct
// anything; see {@link isImportShapeRejection}.
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import {
  sniffContentType,
  TOVU_MAX_UPLOAD_BYTES,
  uploadMedia,
  type AssetBlobRepoPort,
  type AssetRenditionRepoPort,
  type BlobStorePort,
  type MediaRepoPort,
  type TransformDefinitionRepoPort,
  type UploadMediaInput,
} from "../media/index.js";
import type { MediaContentTypeStorePort } from "../media/content-type-store.js";
import { resolveMediaPublicUrls } from "../media/tool-registrations.js";
import { FsFilePathError, openFsFileForRead } from "../fs-files/fs-files.js";
import { FS_ROOT_IDS, resolveFsRoots, type FsRootId } from "../fs-files/layout.js";
import { LOCAL_FILE_IMPORT_RECOVERY, mediaImportAgentToolCatalog } from "./agent-tools.js";
import { buildImportFilename, MediaImportValidationError } from "@jini-ai/cms/media/import";
import { fetchImage, validateImageBytes } from "./fetch-image.js";

/**
 * @file Wires URL and local-file imports onto the same upload pipeline: fetch URLs through the
 * SSRF-guarded `HttpClientPort` and validate the bytes (`fetch-image.ts`) -> upload them through the
 * SAME `uploadMedia` service `media_upload_asset`, the admin HTTP upload route, and
 * `media_generate_asset` all already call -> record the SNIFFED content type through the same
 * `mediaContentTypeStore` those three write -> resolve the same `/m/...` public URL.
 *
 * There is deliberately no second persistence path here. An imported asset is byte-for-byte
 * indistinguishable in the media library from a human-uploaded or AI-generated one: same dedup by
 * sha256, same blob store, same `asset_blobs`/`media`/`asset_renditions` rows, same content-type
 * recording, same public URL contract (ADR-027). The ONLY thing this domain adds over
 * `media_generate_asset` is where the bytes come from.
 *
 * Content-type recording is not optional here and is not best-effort: `media_upload_asset` shipped
 * without it once and produced permanently `content_type`-less `asset_blobs` rows that 500'd the very
 * next request for their public rendition (see `features/media/tool-registrations.ts`'s header for
 * that incident). This handler records it on the same line of reasoning `media_generate_asset` does —
 * a failure to record propagates rather than reporting a false success.
 */

export interface MediaImportToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: Clock;
  idGen: IdGenerator;
  mediaRepo: MediaRepoPort;
  assetBlobRepo: AssetBlobRepoPort;
  assetRenditionRepo: AssetRenditionRepoPort;
  blobStore: BlobStorePort;
  mediaContentTypeStore: MediaContentTypeStorePort;
  transformDefinitionRepo: TransformDefinitionRepoPort;
  /**
   * The SSRF-guarded outbound client this tool's whole safety story rests on — a genuinely separate
   * `HttpClientPort` instance from `customCredentialsHttpClient`, because it is built from a
   * different `EgressPolicy` (`MEDIA_IMPORT_EGRESS_POLICY`: redirects allowed and re-verified, a
   * file-sized response cap, a download-length timeout — see that policy's own doc for why each
   * differs). Injected, never constructed here: `.dependency-cruiser.mjs` forbids `features/**` from
   * deep-importing `platform/http/client.ts` at all, so a composition root
   * (`server/runtime/composition/{deps,app}.ts`) is the only thing that can build one. Same
   * discipline `CredentialedRequestDeps.httpClient` documents for the identical shape of dependency.
   */
  mediaImportHttpClient: HttpClientPort;
  /** Test-only override for where the FULL egress refusal (resolved address included) is logged;
   *  defaults to `console.warn`. See {@link withCallerSafeEgressRefusal}. */
  mediaImportEgressRefusalLog?: (line: string) => void;
  /** Same test seam as fs-files; production resolves the owner's persisted roots per workspace. */
  resolveRoots?: () => Record<FsRootId, string | undefined>;
  /** Test-only smaller binary cap. Clamped to the host ceiling; not a tool input. */
  mediaImportLocalMaxBytes?: number;
}

const CATALOG_BY_ID = indexCatalogById({ catalog: mediaImportAgentToolCatalog });

const DOMAIN = "media-import";

/**
 * Decides which of this tool's rejections are the CALLER's to fix — the predicate
 * `withSchemaOnRejection` turns into a `ToolInputError`, which `@jini-ai/daemon`'s `ToolExecutor`
 * tags `errorKind: 'validation'` and `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` answers as a
 * `400 BAD_REQUEST` carrying the message, instead of SEC-005-redacting it into a bare
 * `INTERNAL_ERROR`.
 *
 * Two classes, for one reason each:
 *
 * - `MediaImportValidationError` — a bad scheme, a non-200, bytes that are not an importable image.
 * - `EgressRefusedError` — the egress policy refused the target: a non-public resolved address
 *   (`169.254.169.254` and friends), a disallowed scheme, or credentials in the URL, on the first
 *   hop or any re-verified redirect. Added 2026-09-07 (SEC-05): it was previously unclassified, so
 *   every SSRF block — the guard doing precisely its job — reached the operator and the model as
 *   "an internal error occurred", with the reason stripped and the audit row recording a crash
 *   rather than a block. Hours of live debugging went into that message.
 *
 * The marker is the honest classification for both, not a trick to defeat the redaction: it means
 * "the caller's input was the problem and a different input would fix it", and a different
 * (publicly reachable) URL does fix an egress refusal. The refusal reaches the caller only in its
 * `callerSafeMessage` form — the host the caller supplied and the classification, never the address
 * it resolved to ({@link withCallerSafeEgressRefusal}). Same precedent as `features/post`'s
 * `PostVersionConflictError` and `features/media`'s `AttachmentRejectedError` re-classifications.
 *
 * Deliberately NOT widened to "anything the HTTP client threw": a DNS failure, a connect timeout,
 * or a transport error are not decisions this process made, a different URL does not reliably fix
 * them, and their text can carry internal detail. Those keep the redacted-`internal` path, which
 * `assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts` pins
 * with a negative control alongside the positive ones.
 *
 * @complexity O(1) — two `instanceof` checks.
 */
function isImportShapeRejection({ error }: { error: unknown }): boolean {
  return error instanceof MediaImportValidationError || error instanceof EgressRefusedError;
}

/**
 * Runs `work`, narrowing any `EgressRefusedError` it throws to its `callerSafeMessage` BEFORE
 * `withSchemaOnRejection` reads `.message` — the same narrowing
 * `features/custom-credentials/tool-registrations.ts`'s `makeModelFacingCredentialedRequest` applies.
 *
 * `.message` names the address the hostname resolved to. A model that can name any host and read
 * back its resolved address can map internal DNS one import at a time (`internal-db.corp` ->
 * `10.0.4.7`). That full message is logged server-side instead; it carries a hostname, an address,
 * and a class, never request content (`platform/http/errors.ts` documents it as the log-facing half).
 *
 * @complexity O(1) beyond `work` itself.
 */
async function withCallerSafeEgressRefusal<T>(log: (line: string) => void, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (!(err instanceof EgressRefusedError)) throw err;
    log(`[media-import] media_import_from_url egress refused: ${err.message}`);
    throw new EgressRefusedError({ message: err.callerSafeMessage }, { callerSafeMessage: err.callerSafeMessage });
  }
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls — see `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const mediaImportDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> one outbound guarded HTTPS GET + uploadMedia (mediaRepo.save/blobRepo.save/
  // renditionRepo.save) + mediaContentTypeStore.set. A genuine durable Tovu-side write, the same
  // classification media_upload_asset and media_generate_asset both carry.
  ["media_import_from_url", "mutates-durable-state"],
  // -> openFsFileForRead + uploadMedia (blob/media/rendition writes) + mediaContentTypeStore.set.
  ["media_import_local_file", "mutates-durable-state"],
]);

/** What `media_import_from_url` returns — the SAME shape `media_upload_asset`/`media_generate_asset`/
 *  `media_list_assets` return, so the model can chain straight into `media_update_metadata`/
 *  `media_trash_asset` off the returned `id` with no separate lookup, and use `publicUrl` to embed the
 *  image immediately. Declared locally for the same reason `media-generation`'s `GeneratedMediaView`
 *  is: `@jini-ai/cms/media`'s equivalent view type is an internal projection, not public surface. */
export interface ImportedMediaView {
  id: string;
  /** The asset's short lookup name (2026-09-16) — a page marker can reference this instead of the
   *  long `id`; mirrors `@jini-ai/cms/media`'s own `MediaToolView.slug` addition. */
  slug: string;
  title: string;
  alt: string;
  caption: string;
  credit: string;
  sha256: string;
  status: string;
  version: number;
  publicUrl: string | null;
  /** The URL the bytes actually came from, after redirect resolution and normalization — so a
   *  transcript records what was imported, not merely what was asked for. Empty for local files. */
  sourceUrl: string;
}

/**
 * Selects one existing fs-files root id. Only the owner can configure its directory.
 * @throws {MediaImportValidationError} For an unknown id or an unset custom folder.
 * @complexity O(1), one workspace root resolution.
 */
function resolveLocalImportRoot(required: { routeDeps: MediaImportToolDeps; root: string }): string {
  const { routeDeps, root } = required;
  if (!(FS_ROOT_IDS as readonly string[]).includes(root)) {
    throw new MediaImportValidationError({ message: `'${root}' is not a recognized root — expected one of: ${FS_ROOT_IDS.join(", ")}` });
  }
  const roots = (routeDeps.resolveRoots ?? (() => resolveFsRoots({ workspaceId: routeDeps.workspaceId })))();
  const rootPath = roots[root as FsRootId];
  if (rootPath === undefined) {
    throw new MediaImportValidationError({ message: `no folder has been set for the '${root}' root yet. ${LOCAL_FILE_IMPORT_RECOVERY}` });
  }
  return rootPath;
}

/**
 * Persists already-validated bytes through the existing upload/dedupe service, records their sniffed
 * type, and returns the same media projection for either byte source. Storage failures propagate.
 * @complexity O(n) in the uploaded bytes for hashing/storage; fixed-count repository operations.
 */
async function persistImportedMedia(required: { routeDeps: MediaImportToolDeps; input: UploadMediaInput; sourceUrl: string }): Promise<{ media: ImportedMediaView }> {
  const { routeDeps, input, sourceUrl } = required;
  const { media } = await uploadMedia({
    deps: {
      clock: routeDeps.clock, idGen: routeDeps.idGen, mediaRepo: routeDeps.mediaRepo,
      blobRepo: routeDeps.assetBlobRepo, renditionRepo: routeDeps.assetRenditionRepo,
      blobStore: routeDeps.blobStore,
    },
    input,
  }, { maxUploadBytes: TOVU_MAX_UPLOAD_BYTES });
  // Identical recording discipline to the URL, generated-media and admin upload paths.
  const sniffed = sniffContentType({ bytes: input.bytes });
  await routeDeps.mediaContentTypeStore.set({ workspaceId: routeDeps.workspaceId, sha256: media.source.sha256, contentType: sniffed });
  const urls = await resolveMediaPublicUrls(routeDeps, [media]);
  return {
    media: {
      id: media.id, slug: media.slug, title: media.title, alt: media.alt, caption: media.caption,
      credit: media.credit, sha256: media.source.sha256, status: media.status, version: media.version,
      publicUrl: urls.get(media.id) ?? null, sourceUrl,
    },
  };
}

/** Builds this domain's permission-gated durable import handlers; root/path validation precedes I/O.
 * @complexity O(1) registration work; handlers are bounded by the upload cap.
 */
export function buildMediaImportRegistrations(routeDeps: MediaImportToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    media_import_local_file: async (ctx): Promise<{ media: ImportedMediaView }> => {
      const input = requireInputRecord({ input: ctx.input });
      const root = requireString({ input, key: "root" });
      const relativePath = requireString({ input, key: "path" });
      await requireToolPermission({
        authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }),
        workspaceId: routeDeps.workspaceId,
        principalId: ctx.principal.id,
        permission: "media.upload",
      }, { entityType: "media" });

      return withSchemaOnRejection({
        toolId: "media_import_local_file", catalog: CATALOG_BY_ID,
        isShapeRejection: ({ error }) => error instanceof FsFilePathError || error instanceof MediaImportValidationError,
        fn: async () => {
          const rootPath = resolveLocalImportRoot({ routeDeps, root });
          const maxBytes = Math.min(routeDeps.mediaImportLocalMaxBytes ?? TOVU_MAX_UPLOAD_BYTES, TOVU_MAX_UPLOAD_BYTES);
          const bytes = await openFsFileForRead({ rootPath, relativePath, maxBytes });
          const contentType = validateImageBytes({ source: relativePath, bytes, bytesTruncated: false });
          const title = optionalString({ input, key: "title" });
          // uploadMedia derives its title by stripping the final extension. A synthetic suffix lets
          // an explicit editorial title keep its punctuation and spaces; this is never a disk path.
          const filename = title === undefined ? relativePath.split(/[\\/]/).at(-1)! : `${title}.imported`;
          return persistImportedMedia({
            routeDeps,
            input: {
              workspaceId: routeDeps.workspaceId, bytes, filename, contentType,
              alt: optionalString({ input, key: "alt" }), caption: optionalString({ input, key: "caption" }),
              createdByPrincipal: ctx.principal.id,
            },
            sourceUrl: "",
          });
        },
      });
    },

    media_import_from_url: async (ctx): Promise<{ media: ImportedMediaView }> => {
      const input = requireInputRecord({ input: ctx.input });
      const url = requireString({ input, key: "url" });
      await requireToolPermission({
        authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }),
        workspaceId: routeDeps.workspaceId,
        principalId: ctx.principal.id,
        permission: "media.upload",
      }, { entityType: "media" });

      const logEgressRefusal = routeDeps.mediaImportEgressRefusalLog ?? ((line: string) => console.warn(line));
      return withSchemaOnRejection({
        toolId: "media_import_from_url",
        catalog: CATALOG_BY_ID,
        isShapeRejection: isImportShapeRejection,
        fn: () =>
          withCallerSafeEgressRefusal(logEgressRefusal, async () => {
            const fetched = await fetchImage({ deps: { httpClient: routeDeps.mediaImportHttpClient }, url });

            return persistImportedMedia({
              routeDeps,
              input: {
                workspaceId: routeDeps.workspaceId,
                bytes: fetched.bytes,
                filename: buildImportFilename({ url: fetched.url, contentType: fetched.contentType }, { override: optionalString({ input, key: "filename" }) }),
                contentType: fetched.contentType,
                alt: optionalString({ input, key: "alt" }),
                caption: optionalString({ input, key: "caption" }),
                credit: optionalString({ input, key: "credit" }),
                createdByPrincipal: ctx.principal.id,
              },
              sourceUrl: fetched.url.href,
            });
          })
      });
    },
  };

  return buildDomainRegistrations({
    domain: DOMAIN,
    catalogModule: "features/media-import/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: mediaImportDerivedRisk,
  });
}

/**
 * Contributes `media-import`'s AI tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`,
 * not by importing this module.
 */
export function contributeMediaImportTools(): ToolContributor {
  return { domain: DOMAIN, build: buildMediaImportRegistrations, risk: mediaImportDerivedRisk };
}
