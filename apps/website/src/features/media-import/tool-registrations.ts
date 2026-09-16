import {
  buildDomainRegistrations,
  indexCatalogById,
  optionalString,
  requireInputRecord,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";
// `EgressRefusedError` is a runtime import, and the ONLY one this file takes from `platform/http` —
// the barrel is otherwise types-only by design. Imported for `instanceof`, not to construct
// anything; see {@link isImportShapeRejection}.
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import {
  sniffContentType,
  uploadMedia,
  type AssetBlobRepoPort,
  type AssetRenditionRepoPort,
  type BlobStorePort,
  type MediaRepoPort,
  type TransformDefinitionRepoPort,
} from "../media/index.js";
import type { MediaContentTypeStorePort } from "../media/content-type-store.js";
import { resolveMediaPublicUrls } from "../media/tool-registrations.js";
import { mediaImportAgentToolCatalog } from "./agent-tools.js";
import { buildImportFilename, fetchImage, MediaImportValidationError } from "./fetch-image.js";

/**
 * @file Wires `agent-tools.ts`'s one-tool catalog onto the real pipeline: fetch the URL through the
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
  clock: { nowIso(): string };
  idGen: { newId(): string };
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
}

const CATALOG_BY_ID = indexCatalogById(mediaImportAgentToolCatalog);

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
function isImportShapeRejection(error: unknown): boolean {
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
    throw new EgressRefusedError(err.callerSafeMessage, { callerSafeMessage: err.callerSafeMessage });
  }
}

/**
 * This wiring layer's OWN risk classification, authored from what the one handler below actually
 * calls — see `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const mediaImportDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> one outbound guarded HTTPS GET + uploadMedia (mediaRepo.save/blobRepo.save/
  // renditionRepo.save) + mediaContentTypeStore.set. A genuine durable Tovu-side write, the same
  // classification media_upload_asset and media_generate_asset both carry.
  ["media_import_from_url", "mutates-durable-state"],
]);

/** What `media_import_from_url` returns — the SAME shape `media_upload_asset`/`media_generate_asset`/
 *  `media_list_assets` return, so the model can chain straight into `media_update_metadata`/
 *  `media_trash_asset` off the returned `id` with no separate lookup, and use `publicUrl` to embed the
 *  image immediately. Declared locally for the same reason `media-generation`'s `GeneratedMediaView`
 *  is: `@jini-ai/cms/media`'s equivalent view type is an internal projection, not public surface. */
interface ImportedMediaView {
  id: string;
  title: string;
  alt: string;
  caption: string;
  credit: string;
  sha256: string;
  status: string;
  version: number;
  publicUrl: string | null;
  /** The URL the bytes actually came from, after redirect resolution and normalization — so a
   *  transcript records what was imported, not merely what was asked for. */
  sourceUrl: string;
}

export function buildMediaImportRegistrations(routeDeps: MediaImportToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    media_import_from_url: async (ctx): Promise<{ media: ImportedMediaView }> => {
      const input = requireInputRecord(ctx.input);
      const url = requireString(input, "url");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "media.upload", entityType: "media" });

      const logEgressRefusal = routeDeps.mediaImportEgressRefusalLog ?? ((line: string) => console.warn(line));
      return withSchemaOnRejection({ toolId: "media_import_from_url", catalog: CATALOG_BY_ID, isShapeRejection: isImportShapeRejection }, () =>
        withCallerSafeEgressRefusal(logEgressRefusal, async () => {
          const fetched = await fetchImage({ httpClient: routeDeps.mediaImportHttpClient }, { url });

          const { media } = await uploadMedia({
            deps: {
              clock: routeDeps.clock,
              idGen: routeDeps.idGen,
              mediaRepo: routeDeps.mediaRepo,
              blobRepo: routeDeps.assetBlobRepo,
              renditionRepo: routeDeps.assetRenditionRepo,
              blobStore: routeDeps.blobStore,
            },
            input: {
              workspaceId: routeDeps.workspaceId,
              bytes: fetched.bytes,
              filename: buildImportFilename(fetched.url, fetched.contentType, optionalString(input, "filename")),
              // Already the SNIFFED type, decided by `fetch-image.ts` from the payload's magic bytes
              // and checked against its own importable-image allowlist — never the served
              // `Content-Type` header. `uploadMedia`'s own allowlist check therefore sees a value
              // this process derived, not one the remote host chose.
              contentType: fetched.contentType,
              alt: optionalString(input, "alt"),
              caption: optionalString(input, "caption"),
              credit: optionalString(input, "credit"),
              createdByPrincipal: ctx.principal.id,
            },
          });

          // The same "record what the bytes actually are" write the admin upload route and
          // `media_generate_asset` both perform. Re-sniffed rather than reusing `fetched.contentType`
          // so this line stays identical to the other two write paths — one shared discipline, not a
          // local shortcut that would quietly diverge if either side changed.
          const sniffed = sniffContentType(fetched.bytes);
          await routeDeps.mediaContentTypeStore.set({ workspaceId: routeDeps.workspaceId, sha256: media.source.sha256, contentType: sniffed });

          const urls = await resolveMediaPublicUrls(routeDeps, [media]);
          return {
            media: {
              id: media.id,
              title: media.title,
              alt: media.alt,
              caption: media.caption,
              credit: media.credit,
              sha256: media.source.sha256,
              status: media.status,
              version: media.version,
              publicUrl: urls.get(media.id) ?? null,
              sourceUrl: fetched.url.href,
            },
          };
        })
      );
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
 * Contributes `media-import`'s AI tool to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`,
 * not by importing this module.
 */
export function contributeMediaImportTools(): ToolContributor {
  return { domain: DOMAIN, build: buildMediaImportRegistrations, risk: mediaImportDerivedRisk };
}
