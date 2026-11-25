/**
 * Why: the owner wants ONE upload limit for the whole site (2026-10-29: "one consistent size limit
 * across Library, Media, chat attachments and assistant imports"). `apps/admin` is a browser bundle
 * that cannot import website server code, so the number lives here, where both sides can read it.
 * The server enforces Jini's `MAX_DOCUMENT_BYTES`; `apps/website/src/features/media/__tests__/
 * upload-limit-single-source.test.ts` fails if that value and this one ever differ.
 */
import { MEDIA_MAX_UPLOAD_BYTES } from "@jini-ai/core/contracts/site/media-upload-limits";

/** The largest single non-video file any surface accepts (Library, Media, chat attachments, assistant imports): 50 MiB. */
// Bound to the engine's one media policy value so staging, final import and the copy can never name different limits.
export const MAX_UPLOAD_BYTES = MEDIA_MAX_UPLOAD_BYTES;

/** The largest single VIDEO file the media store accepts: 500 MiB (owner 2026-11-24). Images and every other file stay at {@link MAX_UPLOAD_BYTES}. */
export const VIDEO_UPLOAD_LIMIT_BYTES = 500 * 1024 * 1024;

/** The two caps in the shape Jini's `uploadMedia`/`replaceMediaFile` take, so every call site passes both with one spread. */
export const UPLOAD_CAPS = { maxUploadBytes: MAX_UPLOAD_BYTES, maxVideoUploadBytes: VIDEO_UPLOAD_LIMIT_BYTES } as const;

/** The limit for one file of this content type: the video limit for `video/*`, 50 MiB otherwise.
 *  @complexity O(1). */
export function uploadLimitFor({ contentType }: { contentType: string }): number {
  return contentType.toLowerCase().startsWith("video/") ? VIDEO_UPLOAD_LIMIT_BYTES : MAX_UPLOAD_BYTES;
}

/** Extensions of the video types the media pipeline accepts; mirrors `@jini-ai/cms/media`'s video content types. */
const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set(["mp4", "webm", "mov", "m4v"]);

/**
 * The limit for a file known only by name and (browser-declared, possibly empty) type — a chat attachment
 * uploads as a fixed octet-stream, so its extension is the only type signal the server has before the bytes
 * are read. A video by either signal gets the video limit; the later media step sniffs the real bytes and
 * enforces 50 MiB on anything that is not actually a video.
 *
 * @complexity O(name length).
 */
export function uploadLimitForFile({ name, type }: { name: string; type: string }): number {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return VIDEO_EXTENSIONS.has(extension) ? VIDEO_UPLOAD_LIMIT_BYTES : uploadLimitFor({ contentType: type });
}

/** The most one chat message may carry in total: one video at its limit plus one other file at the general limit,
 *  so the batch cap never refuses a file the per-file cap allows. */
export const MAX_UPLOAD_BATCH_BYTES = VIDEO_UPLOAD_LIMIT_BYTES + MAX_UPLOAD_BYTES;
