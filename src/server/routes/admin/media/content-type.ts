import { sniffContentType, type MediaRecord } from "#src/media/index";
import type { MediaRouteDeps } from "./deps.js";

/**
 * @file Content-type resolution shared by the four admin media routes that return a media DTO.
 *
 * `toAdminMediaResponse` takes `contentType` as a required parameter because it cannot be derived
 * from `MediaRecord` (`@jini-ai/cms`'s type has no such field — see `media/content-type-store.ts`
 * for why the type lives in a side port). This module is the one place that answers it, so the
 * list route and the three single-record routes cannot drift into disagreeing about what a `null`
 * means.
 */

/** The deps slice this module reads — the store plus the two ports the read-path backfill needs. */
type ContentTypeDeps = Pick<
  MediaRouteDeps,
  "workspaceId" | "mediaContentTypeStore" | "assetBlobRepo" | "blobStore"
>;

/**
 * Resolves every listed asset's content type, sniffing and PERSISTING the type of any blob that
 * does not have one recorded yet.
 *
 * Why backfill on read rather than in the migration that added the column: the type is
 * `sniffContentType(bytes)`, and the bytes live in the blob STORE (a filesystem/S3 concern), not
 * in SQL — a migration cannot reach them. Nor is there anything else to derive a type from: the
 * original filename is never stored at all (`uploadMedia`'s `deriveTitleFromFilename` strips the
 * extension before saving `media.title`), so an extension- or filename-based guess is not merely
 * less accurate here, it is impossible. Magic bytes are the only available source, and they are
 * the exact source `original.ts` already trusts when it serves those same bytes — so a backfilled
 * type is the real answer, not an inference.
 *
 * This converges: each blob is sniffed at most once ever, and only blobs still missing a type are
 * read. After one load of the Media screen a pre-existing library is fully typed, so there is no
 * permanent "untyped" bucket for old uploads to fall into. The cost is bounded by the number of
 * un-backfilled blobs, not by list size, and is paid once.
 *
 * A blob whose bytes cannot be read is skipped rather than failing the whole list — one unreadable
 * asset must not blank the operator's entire media library. Its row goes out with a `null`
 * `contentType`, which the admin UI keeps visible rather than filtering away.
 *
 * @complexity O(n) map lookups plus one blob read per not-yet-sniffed blob.
 */
export async function resolveContentTypes(
  deps: ContentTypeDeps,
  media: readonly MediaRecord[]
): Promise<Map<string, string>> {
  const sha256s = [...new Set(media.map((item) => item.source.sha256))];
  const recorded = await deps.mediaContentTypeStore.getMany({ workspaceId: deps.workspaceId, sha256s });

  for (const sha256 of sha256s) {
    if (recorded.has(sha256)) continue;
    try {
      const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256 });
      if (!blob) continue;
      const contentType = sniffContentType(await deps.blobStore.get({ storageKey: blob.storageKey }));
      await deps.mediaContentTypeStore.set({ workspaceId: deps.workspaceId, sha256, contentType });
      recorded.set(sha256, contentType);
    } catch {
      // Unreadable blob (missing file, permissions, storage outage). Left unrecorded so a later
      // list retries, and this one row goes out untyped.
      continue;
    }
  }
  return recorded;
}

/**
 * One asset's recorded content type, or `null` if none is recorded yet.
 *
 * Deliberately does NOT backfill, unlike {@link resolveContentTypes}: this serves the write routes
 * (`upload`/`update`/`trash`), whose job is to report the result of the write the caller just made.
 * Reading a blob's bytes to enrich a PATCH response would add unrelated storage I/O to every
 * metadata edit, and the admin UI invalidates and refetches the list after each write anyway — so
 * the backfill happens a moment later on the read path, where it belongs.
 *
 * @complexity O(1) — a single-key batch lookup.
 */
export async function readRecordedContentType(
  deps: Pick<MediaRouteDeps, "workspaceId" | "mediaContentTypeStore">,
  sha256: string
): Promise<string | null> {
  const recorded = await deps.mediaContentTypeStore.getMany({
    workspaceId: deps.workspaceId,
    sha256s: [sha256],
  });
  return recorded.get(sha256) ?? null;
}
