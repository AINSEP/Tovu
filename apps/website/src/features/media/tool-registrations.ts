/**
 * @file Media's agent-tool registrations — re-exported from `@jini-ai/cms/media`, plus this host's
 * OWN `publicUrl` resolution wired on top (2026-09-02).
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports every not-yet-converted domain as a single uniform block
 * of `../<domain>/tool-registrations` lines. Pointing only media somewhere else would make the one
 * ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 *
 * Converted to the tool-contribution registry 2026-08-17, on a RETRY: first tried in Stage 2 batch 2
 * and reverted the same session. At that time, a plain importer grep of this file itself found
 * nothing risky (only `assistant/tool-registrations.ts`), but `check:architecture`'s module graph is
 * per-directory: `src/widgets/resolver-service.ts` value-imports `CORE_PUBLIC_TRANSFORM_NAME` from
 * `../media/bootstrap` and `getLatestTransformDefinition` from `../media/index`, and `assistant`
 * still statically depended on `widgets` (`assistant/tool-registrations.ts`'s own `DOMAIN_SLICES`)
 * at the time — group B ran the `media` conversion attempt in its own isolated worktree, before
 * group A's separate, parallel `widgets` conversion had merged. Adding a `media -> assistant`
 * registry edge back then closed a real 3-module cycle: `assistant, media, widgets` (confirmed via
 * `check:architecture --list`: largest strongly-connected component, runtime-only, went 0 -> 3).
 *
 * Re-verified this session, after both batches had merged into `general-work`: `widgets` is now
 * converted too (`widgets/tool-registrations.ts`'s own `contributeWidgetsTools()`), which already
 * removed the `assistant -> widgets` static edge that closed the cycle above. `resolver-service.ts`'s
 * value-imports into `media/bootstrap`/`media/index` are unchanged and still exist, but with
 * `assistant` no longer reaching `widgets` statically, they no longer round-trip back to `assistant`.
 * `check:architecture` confirms 0 module cycles with this conversion in place — see this repo's own
 * commit history for the before/after run in the same worktree.
 *
 * ## `publicUrl` (2026-09-02)
 *
 * `@jini-ai/cms/media`'s `buildMediaRegistrations` gained an OPTIONAL, batch-shaped
 * `MediaToolDeps.resolvePublicUrls` hook (see that package's `media/tool-registrations.ts` header for
 * why it stayed generic there — the `/m/{assetId}/{transformName}.v{version}/...` URL contract is
 * ADR-027, a HOST decision, not a `@jini-ai/cms` one). This file is where that hook gets a REAL
 * implementation for Tovu specifically: {@link resolveMediaPublicUrls} builds the same
 * `/m/{assetId}/public.v{version}/image.{ext}` URL `features/seo/media.ts`'s own `buildSeoImageUrl`
 * already produces for `ogImage`/`twitterImage` (same contract, same "public" core transform), or
 * `/m/{assetId}/original` for a video asset (`routes/site/media-rendition.ts`'s
 * `registerMediaOriginalVideoRoute` — the byte-passthrough route that exists specifically because
 * video can't go through the image-transform pipeline).
 *
 * Image-vs-video is answered from `mediaContentTypeStore` (`content-type-store.ts`) — the SAME port
 * the admin Media screen's Images/Videos tabs already use, batch-shaped (`getMany`) so a
 * `media_list_assets` call with N assets costs one query, not N. Deliberately NOT the backfilling
 * variant `routes/admin/media/content-type.ts`'s `resolveContentTypes` uses (that function lives in
 * `server/inbound/admin-http/routes/media/`, a route-layer module this feature-layer file has no
 * business importing from — routes depend on features, never the reverse): an asset with no recorded
 * content type yet (pre-existing row from before this store existed, never opened once through the
 * admin Media screen since) is treated as "not confirmed video" and gets the image-transform URL,
 * same as every recognized image type. This is directionally correct for the overwhelming majority of
 * assets (every fresh upload records its type immediately — `routes/admin/media/upload.ts`,
 * `media-generation/tool-registrations.ts`'s own `media_generate_asset` handler does the same) and is
 * a disclosed, narrow scope adjustment, not a silent gap: a genuinely never-typed VIDEO asset would
 * get a `publicUrl` that 404s/500s at request time until an operator opens the Media screen once
 * (which backfills it for good).
 *
 * `resolvePublicUrls` is exported so `features/media-generation/tool-registrations.ts` can resolve
 * `media_generate_asset`'s own response through the exact same logic (a batch of one) instead of a
 * second, drifting implementation.
 *
 * ## Content-type recording (2026-09-02, media-pipeline defect batch)
 *
 * Until this fix, `media_upload_asset` was the ONE write path into `media`/`asset_blobs` that never
 * recorded a content type anywhere — line 53-54 above already documents that the HTTP admin upload
 * route and `media_generate_asset` both did; `media_upload_asset` silently did not, because it is
 * wired straight from `@jini-ai/cms/media`'s generic `buildMediaRegistrations`, which has no
 * knowledge of this host's `mediaContentTypeStore` port at all. A real asset uploaded through this
 * tool got a permanently `content_type`-less `asset_blobs` row, which 500'd the very next request for
 * its `/m/...` public rendition (this route's own image-transform path never reads that column, but
 * an operator-facing symptom traced back here regardless — see the dispatch notes for the full
 * chain). `@jini-ai/cms/media`'s `buildMediaRegistrations` gained a second OPTIONAL hook alongside
 * `resolvePublicUrls` for exactly this — `MediaToolDeps.recordUploadContentType`, called once right
 * after `media_upload_asset`'s own `uploadMedia()` succeeds, given the raw uploaded bytes (never the
 * caller's declared `contentType` string — see that hook's own doc in `@jini-ai/cms/media` for why).
 * {@link buildRecordUploadContentType} is this host's real implementation: sniff the bytes
 * (`sniffContentType`), record the sniffed value through the SAME `mediaContentTypeStore.set` the
 * other two paths already call. A rejection from this hook propagates out of the tool call rather
 * than reporting a false success — an upload whose bytes were saved but whose type failed to record
 * is a real failure, not one to paper over.
 */
import type { ToolContributor } from "#src/assistant/index";
import { buildMediaRegistrations, mediaDerivedRisk, sniffContentType, type MediaRecord, type MediaToolDeps, type TransformDefinitionRepoPort } from "@jini-ai/cms/media";
import type { AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import type { ToolRegistration } from "@jini-ai/cms/core";
import { CORE_PUBLIC_TRANSFORM_NAME } from "./bootstrap.js";
import { getLatestTransformDefinition } from "./index.js";
import type { MediaContentTypeStorePort } from "./content-type-store.js";

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
  const contentType = contentTypes.get(asset.source.sha256);
  if (contentType?.startsWith("video/")) return `/m/${asset.id}/original`;
  if (!latest) return null;
  const ext = EXT_BY_TRANSFORM_FORMAT[latest.params.format] ?? latest.params.format;
  return `/m/${asset.id}/${CORE_PUBLIC_TRANSFORM_NAME}.v${latest.version}/image.${ext}`;
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
 * `undefined` when `routeDeps.mediaContentTypeStore` is not wired (mirrors {@link resolveMediaPublicUrls}'s
 * identical degrade-soft contract): `buildMediaRegistrations`'s hook is OPTIONAL, so an upload still
 * succeeds with no type recorded, exactly the pre-fix behavior, rather than throwing for a caller
 * that hasn't opted in.
 *
 * @complexity O(bytes.length) once, bounded by `sniffContentType`'s own fixed-window magic-byte
 *   scan (see that function's own doc) — not proportional to the upload size cap.
 */
function buildRecordUploadContentType(
  routeDeps: MediaToolDeps & MediaPublicUrlDeps
): ((params: { media: MediaRecord; bytes: Uint8Array }) => Promise<void>) | undefined {
  const store = routeDeps.mediaContentTypeStore;
  if (!store) return undefined;
  return async ({ media, bytes }) => {
    const contentType = sniffContentType(bytes);
    await store.set({ workspaceId: routeDeps.workspaceId, sha256: media.source.sha256, contentType });
  };
}

/**
 * `buildMediaRegistrations` wired with this host's real `resolvePublicUrls`
 * ({@link resolveMediaPublicUrls}) and `recordUploadContentType`
 * ({@link buildRecordUploadContentType}) implementations — this is what `contributeMediaTools` below
 * registers, in place of passing `buildMediaRegistrations` straight through.
 */
function buildMediaRegistrationsForTovu(
  routeDeps: MediaToolDeps & MediaPublicUrlDeps,
  _surfaces: AssistantSurfaceDeps
): ToolRegistration[] {
  return buildMediaRegistrations({
    ...routeDeps,
    resolvePublicUrls: (assets) => resolveMediaPublicUrls(routeDeps, assets),
    recordUploadContentType: buildRecordUploadContentType(routeDeps),
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
