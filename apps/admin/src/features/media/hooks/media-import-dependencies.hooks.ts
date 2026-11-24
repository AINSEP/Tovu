import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";
import { mediaApi } from "@/features/media/api/media-api";
import type { MediaImportPort } from "@jini-ai/cms/react/media";
import { KEYS } from "../rules";

/** The admin URL-import port is separate so existing upload/edit consumers need no new dependency.
 *  Its `listKey` is the media grid's cache identity, which the cms dialog invalidates after an import. */
export const defaultMediaImportPort = {
  importFromUrl: (required: { url: string }, optional: { alt?: string | undefined } = {}): Promise<{ media: AdminMedia }> =>
    mediaApi.importMediaFromUrl(required, optional),
  listKey: KEYS.list,
} satisfies MediaImportPort;
