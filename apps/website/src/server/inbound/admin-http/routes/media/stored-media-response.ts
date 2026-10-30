import type { MediaRecord } from "#src/features/media/index";
import { resolveMediaPublicUrls } from "#src/features/media/public-urls";
import { toAdminMediaResponse, type AdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import { resolveMediaByteSizes } from "./byte-size.js";
import type { MediaRouteDeps } from "./deps.js";

/**
 * The `{ media }` body upload and replace both return for the asset they just stored, under the
 * content type they verified from its bytes.
 *
 * An accepted SVG is sanitized before storage, so the uploaded byte length is not what was stored:
 * its size is read back from the blob store (null when the store cannot tell). Every other type is
 * stored byte-for-byte, so the uploaded length is exact and needs no extra read.
 *
 * @complexity O(1) — one public-URL lookup, plus one blob size lookup for SVG.
 */
export async function toStoredMediaResponse(
  { deps, media, contentType, byteLength }: { deps: MediaRouteDeps; media: MediaRecord; contentType: string; byteLength: number },
): Promise<{ media: AdminMediaResponse }> {
  const publicUrl = (await resolveMediaPublicUrls(deps, [media])).get(media.id) ?? null;
  const byteSize = contentType === "image/svg+xml"
    ? (await resolveMediaByteSizes({ deps, media: [media] })).get(media.source.sha256) ?? null
    : byteLength;
  return { media: toAdminMediaResponse({ media, contentType, publicUrl, byteSize }) };
}
