/**
 * Why: the owner wants ONE upload limit for the whole site (2026-10-29: "one consistent size limit
 * across Library, Media, chat attachments and assistant imports"). `apps/admin` is a browser bundle
 * that cannot import website server code, so the number lives here, where both sides can read it.
 * The server enforces Jini's `MAX_DOCUMENT_BYTES`; `apps/website/src/features/media/__tests__/
 * upload-limit-single-source.test.ts` fails if that value and this one ever differ.
 */

/** The largest single non-video file any surface accepts (Library, Media, chat attachments, assistant imports): 50 MiB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** The largest single VIDEO file the media store accepts: 500 MiB (owner 2026-11-24). Images and every other file stay at {@link MAX_UPLOAD_BYTES}. */
export const VIDEO_UPLOAD_LIMIT_BYTES = 500 * 1024 * 1024;

/** The two caps in the shape Jini's `uploadMedia`/`replaceMediaFile` take, so every call site passes both with one spread. */
export const UPLOAD_CAPS = { maxUploadBytes: MAX_UPLOAD_BYTES, maxVideoUploadBytes: VIDEO_UPLOAD_LIMIT_BYTES } as const;

/** The limit for one file of this content type: the video limit for `video/*`, 50 MiB otherwise.
 *  @complexity O(1). */
export function uploadLimitFor({ contentType }: { contentType: string }): number {
  return contentType.toLowerCase().startsWith("video/") ? VIDEO_UPLOAD_LIMIT_BYTES : MAX_UPLOAD_BYTES;
}

/** The most one chat message may carry in total: two files at the limit. */
export const MAX_UPLOAD_BATCH_BYTES = MAX_UPLOAD_BYTES * 2;
