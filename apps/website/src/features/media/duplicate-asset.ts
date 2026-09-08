import {
  findMediaByIdOrSlug,
  updateMediaMetadata,
  uploadMedia,
  sniffContentType,
  type MediaRecord,
  type MediaToolDeps,
} from "@jini-ai/cms/media";
import { ToolInputError } from "@jini-ai/core";

import type { DuplicateResourceHandlerContributor } from "#src/assistant/index";
import type { MediaPublicUrlDeps } from "./tool-registrations.js";

/**
 * @file `content_duplicate`'s `"media"` resource — the third resource, and the only one whose rows
 * are not the whole story: a media asset has BYTES behind it.
 *
 * ## The decision this file exists to make: a copy REFERENCES the same bytes, it never duplicates them
 *
 * That is forced by the storage model, not a preference between two workable options.
 * `AssetBlobRecord`'s identity is `(workspaceId, sha256)` and `BlobStorePort` is content-addressed
 * (`computeBlobStorageKey` derives the key from the hash), so "write a second copy of these bytes"
 * is not representable — identical bytes always resolve to the same blob row and the same storage
 * key. There is no second physical copy to be had, and asking for one would only mean writing a
 * duplicate ROW pointing at the same object, which is strictly worse than sharing one.
 *
 * So this handler routes the copy through `uploadMedia` with the SOURCE's own bytes, and inherits
 * exactly the semantics that package already documents and tests: *"uploading the same bytes twice
 * always creates two `MediaRecord`s (two distinct library entries, matching common CMS behavior) but
 * writes the blob bytes only once"*. Two further properties come along with going through
 * `uploadMedia` rather than hand-writing rows, and both are reasons not to hand-write them:
 *
 * 1. The dedup check-then-act runs inside `withSha256Lock`, so it cannot interleave with a
 *    concurrent blob-GC delete-pass on the same hash — and if the source's blob happens to be
 *    `tombstoned` (a pending GC candidate), it is RESURRECTED to `active` in that same locked
 *    section. A hand-rolled copy would happily point a brand-new row at a blob about to be deleted.
 * 2. `AssetRenditionRecord` is keyed by `assetId`, not by hash, so the copy needs its own rendition
 *    rows to be addressable at its own `/m/<id>/...` URL. `uploadMedia` writes the "original"
 *    rendition as part of its normal path.
 *
 * **What the operator actually gets, stated plainly** (and stated the same way in the
 * `content_duplicate` catalog entry, so the model tells them the same thing): a new library entry
 * with its own id, its own slug, and its own editorial fields — title, alt text, caption, credit,
 * width/height, CSS class, HTML attributes — pointing at the same image or video. Editing the copy's
 * alt text does not touch the original's. Deleting one does not break the other: the underlying
 * bytes survive as long as any row still references them. What it is NOT is a second file on disk,
 * and nothing here pretends otherwise.
 */

/** The exact `content_duplicate` handler input this resource reads. */
interface DuplicateMediaInput {
  principalId: string;
  id: string;
  overrides: { title?: string; slug?: string; status?: string };
}

/**
 * Resolves the content type to re-upload the copy under.
 *
 * PREFERS the type already recorded for these exact bytes over a fresh sniff, and that ordering is
 * load-bearing rather than an optimization: `uploadMedia` validates `contentType` against an
 * allowlist, and `sniffContentType` falls back to `application/octet-stream` for anything outside its
 * fixed magic-byte table (a PDF, say). Sniffing first would therefore make some already-accepted
 * assets un-copyable — the recorded value, by contrast, was itself produced by a sniff of these same
 * bytes at upload time AND already passed that allowlist once, so it is both trustworthy and known
 * acceptable. The sniff is the fallback for an older asset that predates the content-type store.
 *
 * Never a caller-declared string: there isn't one, and there must not be — see
 * `tool-registrations.ts`'s `buildRecordUploadContentType` for the same discipline on the upload path.
 *
 * @complexity One batched store read plus, only on the fallback path, `sniffContentType`'s own
 * fixed-window scan.
 */
async function resolveCopyContentType(
  routeDeps: MediaToolDeps & MediaPublicUrlDeps,
  sha256: string,
  bytes: Uint8Array
): Promise<string> {
  const recorded = await routeDeps.mediaContentTypeStore?.getMany({ workspaceId: routeDeps.workspaceId, sha256s: [sha256] });
  return recorded?.get(sha256) ?? sniffContentType(bytes);
}

/**
 * Copies every editorial field `uploadMedia` does not already take, onto the freshly created row.
 *
 * Split out from {@link duplicateMediaAsset} because it is the part that must stay in step with
 * `MediaRecord`'s own field list: a field added to the record and forgotten here is a field that
 * silently fails to copy, which is the failure mode this whole tool exists to avoid. `uploadMedia`
 * accepts `alt`/`caption`/`credit` directly, so only the remainder is applied here.
 *
 * `title` is set through this path rather than via `uploadMedia`'s `filename` because that derivation
 * strips a trailing extension — a title like `"Logo v1.2"` would arrive as `"Logo v1"`.
 *
 * @complexity O(1) — one repo read plus one write.
 */
async function applyCopiedMetadata(
  routeDeps: MediaToolDeps,
  created: MediaRecord,
  source: MediaRecord,
  overrides: { title?: string; slug?: string }
): Promise<MediaRecord> {
  const { media } = await updateMediaMetadata({
    deps: { clock: routeDeps.clock, mediaRepo: routeDeps.mediaRepo },
    input: {
      workspaceId: routeDeps.workspaceId,
      id: created.id,
      title: overrides.title ?? `Copy of ${source.title}`,
      ...(overrides.slug !== undefined ? { slug: overrides.slug } : {}),
      width: source.width,
      height: source.height,
      cssClass: source.cssClass,
      htmlAttributes: source.htmlAttributes,
    },
  });
  return media;
}

/**
 * Duplicates one media asset — see this file's header for the bytes decision and what the operator
 * gets.
 *
 * Accepts a slug as well as an id, because `findMediaByIdOrSlug` is media's own established
 * identity model (`MediaRecord.slug`'s doc: an ADDITIONAL human-typeable key alongside `id`) and
 * refusing a slug here would make this tool the one place that ignores it.
 *
 * A TRASHED source is refused. `uploadMedia` always creates an `active` row, so copying a trashed
 * asset would produce a live entry for content the operator had already deleted — the same "a copy
 * is never more exposed than its source" rule that makes a duplicated published page default to
 * draft and a duplicated disabled form stay disabled.
 *
 * @param routeDeps - Media's own tool deps bag plus this host's optional content-type store.
 * @param input - `content_duplicate`'s per-resource handler input.
 * @returns `{ media }` — the copy's own row.
 * @throws {ToolInputError} For an unsupported `status` override, a missing source, a trashed source,
 * or bytes that are no longer retrievable.
 * @complexity O(1) repo/store calls plus one full read of the source's bytes.
 */
export async function duplicateMediaAsset(
  routeDeps: MediaToolDeps & MediaPublicUrlDeps,
  input: DuplicateMediaInput
): Promise<Record<string, unknown>> {
  // Rejected rather than ignored, mirroring the `"form"` resource: `content_duplicate`'s `status`
  // override is spelled in post/page's vocabulary (draft/published), which a media asset has no
  // equivalent of — its statuses are active/trashed, and a copy is never created trashed.
  if (input.overrides.status !== undefined) {
    throw new ToolInputError(
      "content_duplicate: resource 'media' does not support the 'status' override — a media asset is " +
        "active/trashed, not draft/published, and a copy is always created active. Overrides honored " +
        "for 'media': title and slug. Use media_trash_asset afterwards to trash the copy."
    );
  }

  const source = await findMediaByIdOrSlug({
    deps: { mediaRepo: routeDeps.mediaRepo },
    input: { workspaceId: routeDeps.workspaceId, idOrSlug: input.id },
  });
  if (!source) throw new ToolInputError(`content_duplicate: media asset '${input.id}' was not found`);
  if (source.status === "trashed") {
    throw new ToolInputError(
      `content_duplicate: media asset '${input.id}' is in the trash and was not copied — a copy would be ` +
        "a live entry for content you already deleted. Restore it first if you meant to copy it."
    );
  }

  // Resolved BEFORE anything is written: an asset whose bytes are genuinely gone must fail loudly
  // with nothing created, never leave a half-formed library entry behind (the same no-orphan-row
  // discipline `duplicatePostOrPage` applies to a bespoke-HTML page with no store wired).
  const blob = await routeDeps.assetBlobRepo.findByHash({ workspaceId: routeDeps.workspaceId, sha256: source.source.sha256 });
  if (!blob) {
    throw new ToolInputError(
      `content_duplicate: media asset '${input.id}' has no stored blob for hash ${source.source.sha256} — ` +
        "nothing was copied. Its bytes are missing, so a copy would reference content that does not exist."
    );
  }
  const bytes = await routeDeps.blobStore.get({ storageKey: blob.storageKey });
  const contentType = await resolveCopyContentType(routeDeps, source.source.sha256, bytes);

  // Dedups by (workspaceId, sha256) inside the sha256 lock: the copy REFERENCES the source's bytes
  // rather than duplicating them, and a tombstoned blob is resurrected rather than left to be
  // collected out from under the new row. See this file's header.
  const { media: created } = await uploadMedia({
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
      bytes,
      // Only ever a slug/title SEED — the real title is set by `applyCopiedMetadata` below.
      filename: `copy-of-${source.slug}`,
      contentType,
      alt: source.alt,
      caption: source.caption,
      credit: source.credit,
      createdByPrincipal: input.principalId,
    },
  });

  // Keyed by sha256, not by asset id, so for a source whose type was already recorded this is a
  // no-op rewrite of the same value. It is called anyway, and deliberately: an asset predating the
  // content-type store has NO recorded type, and without this the copy would inherit that gap and
  // drop out of the admin's Images/Videos filter and the `/m/...` video URL branch. This is the
  // same store and method the HTTP upload route and `media_upload_asset` already write through.
  await routeDeps.mediaContentTypeStore?.set({ workspaceId: routeDeps.workspaceId, sha256: created.source.sha256, contentType });

  const media = await applyCopiedMetadata(routeDeps, created, source, input.overrides);
  return { media };
}

/**
 * `content_duplicate`'s resource contributor for `"media"`, resolving to `media.upload` — the SAME
 * permission `media_upload_asset` already declares in this domain's catalog. Creating a copy IS
 * creating a new library entry, so it is gated as an upload, not as a metadata update.
 *
 * Called from the composition root (`server/runtime/composition/tool-catalog-manifest.ts`), never
 * from within this domain: `.dependency-cruiser.mjs`'s `domain-no-direct-assistant-tool-registration`
 * rule bans any non-type-only `features/** -> assistant/**` import, so this function returns plain
 * data and imports only the registry's TYPE.
 */
export function contributeMediaDuplicateHandlers(): DuplicateResourceHandlerContributor[] {
  return [
    {
      resource: "media",
      build: (routeDeps) => ({
        permission: "media.upload",
        duplicate: (input) => duplicateMediaAsset(routeDeps as unknown as MediaToolDeps & MediaPublicUrlDeps, input),
      }),
    },
  ];
}
