import { nowIso } from "@jini-ai/core/primitives";

import type { ToolContributor } from "#src/assistant/index";
import { buildMediaRegistrations, mediaDerivedRisk, type MediaRecord, type MediaToolDeps, type TransformDefinitionRepoPort } from "@jini-ai/cms/media";
import { type AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import { requireInputRecord, requireString, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { CORE_PUBLIC_TRANSFORM_NAME } from "./bootstrap.js";
import { assertAllowedSniffedContentType, getLatestTransformDefinition, mediaPublicPath, mediaUrlKey } from "./index.js";
import type { MediaContentTypeStorePort } from "./content-type-store.js";
import { TOVU_MAX_UPLOAD_BYTES } from "../../contracts/core/upload-limits.js";
import { mediaRepoWithCreator } from "./created-by.js";

export { buildMediaRegistrations, mediaDerivedRisk, type MediaToolDeps };

/** Cosmetic only (ADR-027 §4 — never participates in the rendition lookup itself) — duplicated from
 *  `features/seo/media.ts`'s identical local copy rather than shared, per this codebase's own
 *  "duplicate the tiny thing, don't reach across files for it" convention (see e.g.
 *  `custom-credentials/agent-tools.ts`'s header for the same reasoning applied elsewhere). */
const EXT_BY_TRANSFORM_FORMAT: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp", gif: "gif" };

/** The exact deps {@link resolveMediaPublicUrls} (read: `getMany`) and {@link buildMediaRegistrationsForTovu}'s
 *  `recordUploadContentType` wiring (write: `set` — see this file's header, "Content-type recording")
 *  need beyond `MediaToolDeps`'s own fields — both OPTIONAL so a test double (or a future host reusing
 *  `buildMediaRegistrationsForTovu` without wiring these) degrades to `publicUrl: null`/no recording
 *  for every asset rather than throwing; see those functions' own docs. `RouteDeps` (this host's real
 *  composition-root deps bag) always supplies both in production — `mediaContentTypeStore`/
 *  `transformDefinitionRepo` are established `RouteDeps` fields (`server/routes/types.ts`), not new
 *  wiring this file introduces. `mediaContentTypeStore` is `Pick`-narrowed to only the two methods
 *  this file actually calls, not the whole `MediaContentTypeStorePort`, so a caller passing a
 *  purpose-built double for either half never needs to fake the other. */
export interface MediaPublicUrlDeps {
  mediaContentTypeStore?: Pick<MediaContentTypeStorePort, "getMany" | "set">;
  transformDefinitionRepo?: TransformDefinitionRepoPort;
}

/**
 * One asset's resolved URL — the per-asset decision {@link resolveMediaPublicUrls} extracts so its
 * own batch loop is pure assembly. `null` covers "no registered 'public' core transform yet" (boot
 * has not run `ensureCoreMediaTransform`, or this is a test double with no transform registered).
 */
function resolveOneAssetPublicUrl(
  asset: MediaRecord,
  contentTypes: ReadonlyMap<string, string>,
  latest: Awaited<ReturnType<typeof getLatestTransformDefinition>>
): string | null {
  const key = mediaUrlKey(asset);
  const contentType = contentTypes.get(asset.source.sha256);
  if (contentType?.startsWith("video/")) return mediaPublicPath(key, { kind: "original" });
  if (!latest) return null;
  const ext = EXT_BY_TRANSFORM_FORMAT[latest.params.format] ?? latest.params.format;
  return mediaPublicPath(key, { kind: "transform", name: CORE_PUBLIC_TRANSFORM_NAME, version: latest.version, ext });
}

/**
 * Batch-resolves each of `assets`' `/m/...` public URL — the real implementation behind
 * `MediaToolDeps.resolvePublicUrls` for this host. See this file's header for the full contract
 * (image vs. video, the no-backfill disclosed scope adjustment, why this lives here and not in a
 * route module).
 *
 * @returns a map from `MediaRecord.id` to its resolved URL, or `null` for a trashed asset, an asset
 * with no registered "public" core transform yet (boot has not run `ensureCoreMediaTransform`), or
 * any other unresolvable case — never a link a visitor would 404 on by construction, mirroring
 * `features/post/tool-registrations.ts`'s own `resolvePublicUrl` contract.
 * @complexity O(1) queries regardless of `assets.length`: one batched content-type lookup, one latest-
 * transform-version lookup (workspace-wide, not per-asset).
 */
export async function resolveMediaPublicUrls(
  deps: MediaPublicUrlDeps & { workspaceId: string },
  assets: readonly MediaRecord[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!deps.mediaContentTypeStore || !deps.transformDefinitionRepo) {
    for (const asset of assets) result.set(asset.id, null);
    return result;
  }

  const active: MediaRecord[] = [];
  for (const asset of assets) {
    if (asset.status === "trashed") result.set(asset.id, null);
    else active.push(asset);
  }
  if (active.length === 0) return result;

  const sha256s = [...new Set(active.map((asset) => asset.source.sha256))];
  const contentTypes = await deps.mediaContentTypeStore.getMany({ workspaceId: deps.workspaceId, sha256s });

  const latest = await getLatestTransformDefinition({
    deps: { transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME },
  });

  for (const asset of active) {
    result.set(asset.id, resolveOneAssetPublicUrl(asset, contentTypes, latest));
  }
  return result;
}

/**
 * `media_upload_asset`'s real `recordUploadContentType` implementation for this host — sniffs the
 * REAL type from the uploaded bytes (`sniffContentType`) and records it via `mediaContentTypeStore`,
 * the SAME store/method the HTTP admin upload route and `media_generate_asset`
 * (`features/media-generation/tool-registrations.ts`) already write through. Never the caller's
 * declared `contentType` string: recording that instead would let an operator's "Images"/"Videos"
 * tab, and this host's own `/m/...` public rendition route, disagree with what the bytes actually
 * are — the exact "an attacker/careless-caller-controlled `contentType` header is trusted" gap
 * `uploadMedia`'s own header (`@jini-ai/cms/media`) already discloses for the upload-validation step,
 * and `content-type-store.ts`'s header states as this store's own invariant.
 *
 * ALWAYS returns a hook, even when `routeDeps.mediaContentTypeStore` is not wired: the allowlist
 * check below must run on every upload, not only on hosts that opted into content-type recording.
 * `assertAllowedSniffedContentType` (`upload-content-type.ts`) sniffs the bytes and throws the SAME
 * `MediaValidationError` `resolveUploadContentType`'s declared-type check throws, so this is a shape
 * rejection Jini's `uploadMedia` caller-facing contract already surfaces to the model (see that
 * file's `tool-registrations.ts:136-138`). Only once that passes does this record the type — and
 * only when `store` exists, matching the pre-fix degrade-soft contract for hosts with no store.
 *
 * @throws MediaValidationError bytes sniff outside `DEFAULT_ALLOWED_MIME_TYPES` — the caller's own
 *   rollback-and-rethrow (Jini's `media_upload_asset` handler) deletes the media/blob/rendition rows
 *   `uploadMedia()` just wrote, so no unlabeled OR mistyped row survives.
 * @complexity O(bytes.length) once, bounded by `sniffContentType`'s own fixed-window magic-byte
 *   scan (see that function's own doc) — not proportional to the upload size cap.
 */
function buildRecordUploadContentType(
  routeDeps: MediaToolDeps & MediaPublicUrlDeps
): (params: { media: MediaRecord; bytes: Uint8Array }) => Promise<void> {
  const store = routeDeps.mediaContentTypeStore;
  return async ({ media, bytes }) => {
    const contentType = assertAllowedSniffedContentType(bytes);
    if (store) {
      await store.set({ workspaceId: routeDeps.workspaceId, sha256: media.source.sha256, contentType });
    }
  };
}

const MEDIA_TRASH_TOOL_ID = "media_trash_asset";

/** See `trash/trash-item-tool.ts`'s identical constant's doc — duplicated here rather than
 *  imported, the same "structurally typed, no `features/trash` import" convention this file's own
 *  {@link RemoveMediaFn} doc already follows. */
const ASSISTANT_ACTOR_PLUGIN_ID = "assistant";

/**
 * Hands one asset's removal to whoever owns removal in this composition.
 *
 * Structurally typed ON PURPOSE — this file imports nothing from `features/trash`, exactly as
 * `post.ts`'s `RemovePostFn` and the comments write-service's `RemoveCommentFn` do not. The
 * composition root binds the real implementation, already bound to this domain's entity type.
 */
export type RemoveMediaFn = (required: {
  workspaceId: string;
  id: string;
  display: { title: string; subtitle?: string | null };
  at: string;
  expectedVersion: number | null;
  actor: { principalId: string; pluginId?: string | null };
}) => Promise<{ ok: true; version: number | null } | { ok: false; reason: "not-found" | "version-changed" }>;

/**
 * The one field this shim adds to Jini's `MediaToolDeps`.
 *
 * Declared here (rather than widening `MediaToolDeps` in `@jini-ai/cms`) for the same reason the
 * confirmation gate itself lives here: `@jini-ai/cms` is host-agnostic and knows nothing about
 * Tovu's Trash. It is folded into `assistant/tool-registrations.ts`'s `AssistantToolRegistryDeps`
 * so both composition roots satisfy it structurally.
 */
export interface MediaTrashToolDeps {
  removeMedia: RemoveMediaFn;
}

/** Records reversible media removal in the host's Trash, then uses the package handler's reply.
 * Both permission checks and the transactional version check remain; no consent card is needed. */
function buildMediaTrashHandler(
  routeDeps: MediaToolDeps & MediaTrashToolDeps,
  originalHandler: ToolHandler
): ToolHandler {
  return async (ctx) => {
    const mediaId = requireString({ input: requireInputRecord({ input: ctx.input }), key: "mediaId" });
    await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "media.delete" }, { entityType: "media", entityId: mediaId });

    const existing = await routeDeps.mediaRepo.findById({ workspaceId: routeDeps.workspaceId, id: mediaId });
    if (!existing) throw new Error(`media asset '${mediaId}' was not found`);

    // Resolve the latest version for the transactional removal.
    const current = await routeDeps.mediaRepo.findById({ workspaceId: routeDeps.workspaceId, id: mediaId });
    if (!current) throw new Error(`media asset '${mediaId}' was not found`);

    // The marker flip and the Trash index row, as one transaction. `originalHandler` still runs
    // afterwards and still owns the tool's reply shape — `trashMedia` is idempotent (an asset
    // already `trashed` is returned unchanged, no second version bump), so it renders the row
    // this flip produced instead of performing a second one. That is what keeps the agent path
    // and the HTTP route on the same single delete chokepoint with no change to `@jini-ai/cms`.
    const removed = await routeDeps.removeMedia({
      workspaceId: routeDeps.workspaceId,
      id: mediaId,
      display: { title: current.title, subtitle: current.slug },
      at: nowIso({ clock: routeDeps.clock }),
      expectedVersion: current.version,
      actor: { principalId: ctx.principal.id, pluginId: ASSISTANT_ACTOR_PLUGIN_ID },
    });
    if (!removed.ok) {
      throw new Error(
        removed.reason === "not-found"
          ? `media asset '${mediaId}' was not found`
          : `media asset '${mediaId}' changed during removal — nothing was trashed`
      );
    }

    const result = (await originalHandler(ctx)) as Record<string, unknown>;
    return { trashed: true, cancelled: false, ...result };

  };
}

/**
 * `buildMediaRegistrations` wired with this host's real `resolvePublicUrls`
 * ({@link resolveMediaPublicUrls}) and `recordUploadContentType`
 * ({@link buildRecordUploadContentType}) implementations, plus `media_trash_asset`'s Trash
 * adapter ({@link buildMediaTrashHandler}) wrapped over the Jini-provided handler — this is
 * what `contributeMediaTools` below registers, in place of passing `buildMediaRegistrations` straight
 * through.
 *
 * Exported (2026-09-08) so a test can call it directly with a fake `MediaToolDeps &
 * MediaPublicUrlDeps` and a real `SurfaceExchangeStore`, mirroring every sibling domain's own
 * `build<Domain>Registrations` export (`buildWidgetsRegistrations`, `buildRedirectsRegistrations`,
 * ...) — `media/__tests__/agent-tools.trash-confirmation.test.ts` is what needed it.
 *
 * `maxUploadBytes: TOVU_MAX_UPLOAD_BYTES` (2026-09-21): every OTHER upload path into this package
 * (the admin HTTP upload route, `duplicate-asset.ts`, `media-generation`'s and `media-import`'s own
 * tool registrations) already calls `uploadMedia` with this host's `TOVU_MAX_UPLOAD_BYTES` override
 * instead of `@jini-ai/cms/media`'s 10 MiB `DEFAULT_MAX_UPLOAD_BYTES` — this was the one remaining
 * upload path (and the one a chat attachment promoted into the library also goes through) still
 * silently stuck at 10 MiB, because `MediaToolDeps` had no field to carry a cap until
 * `@jini-ai/cms/media`'s `maxUploadBytes` addition. Passed explicitly here (not merely via
 * `...routeDeps`) since `RouteDeps` itself has no `maxUploadBytes` field — this host's cap is a fixed
 * constant, not a per-request value.
 */
export function buildMediaRegistrationsForTovu(
  routeDeps: MediaToolDeps & MediaPublicUrlDeps & MediaTrashToolDeps,
  surfaces: AssistantSurfaceDeps
): ToolRegistration[] {
  const registrations = buildMediaRegistrations(routeDeps, {
    resolvePublicUrls: ({ assets }) => resolveMediaPublicUrls(routeDeps, assets),
    recordUploadContentType: buildRecordUploadContentType(routeDeps),
    maxUploadBytes: TOVU_MAX_UPLOAD_BYTES,
  });

  return registrations.map((registration) => {
    if (registration.descriptor.id === MEDIA_TRASH_TOOL_ID) {
      return { ...registration, handler: buildMediaTrashHandler(routeDeps, registration.handler) };
    }
    if (registration.descriptor.id === "media_upload_asset") {
      return { ...registration, handler: (async (ctx, optional) => {
        // The published package predates asset attribution. Bind its upload repo per invocation,
        // so concurrent callers and chat promotions stamp their own authenticated principal.
        const scoped = buildMediaRegistrations({ ...routeDeps,
          mediaRepo: mediaRepoWithCreator({ mediaRepo: routeDeps.mediaRepo, principalId: ctx.principal.id }),
        }, { resolvePublicUrls: ({ assets }) => resolveMediaPublicUrls(routeDeps, assets),
          recordUploadContentType: buildRecordUploadContentType(routeDeps), maxUploadBytes: TOVU_MAX_UPLOAD_BYTES });
        const upload = scoped.find(tool => tool.descriptor.id === "media_upload_asset")!;
        const result = await upload.handler(ctx, optional) as { media: Record<string, unknown> };
        return { ...result, media: { ...result.media, createdBy: ctx.principal.id } };
      }) satisfies ToolHandler };
    }
    return registration;
  });
}

/**
 * Contributes Media's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildMediaRegistrations`/
 * `mediaDerivedRisk` by name (only `MediaToolDeps` as an erased `import type`); this is the seam that
 * replaced it — see this file's own header above for why the earlier attempt closed a cycle and why
 * this retry does not.
 */
export function contributeMediaTools(): ToolContributor {
  return { domain: "media", build: buildMediaRegistrationsForTovu, risk: mediaDerivedRisk };
}
