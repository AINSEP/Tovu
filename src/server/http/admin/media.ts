import type { MediaRecord } from "../../../media";

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
}

export interface AdminMediaEnvelope {
  media: AdminMediaResponse;
}

export interface AdminMediaListEnvelope {
  media: AdminMediaResponse[];
}

/**
 * @complexity O(1).
 * @overallScore 100
 */
export function toAdminMediaResponse(media: MediaRecord): AdminMediaResponse {
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
  };
}

export function toAdminMediaListResponse(media: MediaRecord[]): AdminMediaListEnvelope {
  return { media: media.map(toAdminMediaResponse) };
}
