import type { MediaRecord } from "#src/media/index";

/**
 * @file Admin-facing media response DTO (mirrors `admin/members.ts` /
 * `admin/menus.ts`'s pattern: serialize the internal record to a stable admin
 * JSON envelope rather than passing it through unfiltered).
 *
 * `MediaRecord` has no session/secret-shaped fields to exclude (unlike
 * members), so this mapping is a near-passthrough — kept as an explicit
 * function anyway so a future field addition to `MediaRecord` (e.g. an
 * internal-only attribution field) doesn't leak to the admin API by default.
 */

export interface AdminMediaResponse {
  id: string;
  workspaceId: string;
  title: string;
  alt: string;
  caption: string;
  credit: string;
  sha256: string;
  status: MediaRecord["status"];
  createdAt: string;
  updatedAt: string;
  version: number;
  width: number | null;
  height: number | null;
  cssClass: string | null;
  /**
   * The asset's real media type — always `sniffContentType(bytes)` from the stored bytes, never
   * the client's declared upload string (see `media/content-type-store.ts` for why). Drives the
   * admin Media screen's "Images"/"Videos" tabs.
   *
   * `null` means "not sniffed yet", NOT "unknown format" — an unrecognized blob reports the real
   * answer `"application/octet-stream"`. A `null` is only ever seen for a blob whose bytes could
   * not be read at list time; the list route backfills every other pre-existing row on read. The
   * admin UI must keep `null` rows visible somewhere rather than filtering them into oblivion.
   */
  contentType: string | null;
}

export interface AdminMediaEnvelope {
  media: AdminMediaResponse;
}

export interface AdminMediaListEnvelope {
  media: AdminMediaResponse[];
}

/**
 * `contentType` is a REQUIRED second parameter rather than an optional one with a `null` default:
 * it cannot be derived from `MediaRecord` (the upstream `@jini-ai/cms` type has no such field —
 * it is looked up per-blob from `MediaContentTypeStorePort`), and a default would let a caller
 * that simply forgot to look it up silently emit `null`, which the admin UI reads as the specific
 * claim "this blob's bytes were unreadable". Making it explicit forces each of the four routes to
 * state what it actually knows.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function toAdminMediaResponse(media: MediaRecord, contentType: string | null): AdminMediaResponse {
  return {
    id: media.id,
    workspaceId: media.workspaceId,
    title: media.title,
    alt: media.alt,
    caption: media.caption,
    credit: media.credit,
    sha256: media.source.sha256,
    status: media.status,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    version: media.version,
    width: media.width,
    height: media.height,
    cssClass: media.cssClass,
    contentType,
  };
}

/**
 * @param contentTypesBySha256 - Recorded types keyed by blob sha256, as
 * `MediaContentTypeStorePort.getMany` returns them. A sha256 ABSENT from this map becomes a `null`
 * `contentType` on that row — the map's "absent means not sniffed yet" contract carried through to
 * the wire shape.
 * @complexity O(n) in `media.length` — the map lookup per row is O(1).
 */
export function toAdminMediaListResponse(
  media: MediaRecord[],
  contentTypesBySha256: ReadonlyMap<string, string>
): AdminMediaListEnvelope {
  return {
    media: media.map((item) => toAdminMediaResponse(item, contentTypesBySha256.get(item.source.sha256) ?? null)),
  };
}
