import { createFfmpegMediaTranscoder, createFfmpegVideoFrameExtractor } from "@jini-ai/cms/media/node";
import { readChatAttachmentForOwner } from "#src/features/media/index";
import type { MediaVideoToolPorts } from "#src/features/media/view-video-tool";
import type { MediaConversionPorts } from "#src/features/media/tool-registrations";

/** Both CLI and BYOK catalogs receive the same owner reader and frame-extraction port. Directory
 * resolution is lazy so constructing a catalog never reads attachments or launches a process.
 * `uploadDirectory` is the booted site's `RouteDeps.siteStoragePaths.chatAttachmentsDir`, which both
 * production roots pass; it used to fall back to an env/`siteDir()` resolution that can name a
 * different site (hardwiring audit #19). Absent — hermetic compositions only — every read refuses
 * as `no-record` rather than guessing a directory. */
export function createMediaVideoToolPorts(
  _required: Record<string, never>,
  { uploadDirectory }: { uploadDirectory?: string } = {},
): MediaVideoToolPorts {
  return {
    extractor: createFfmpegVideoFrameExtractor({}, {}),
    readAttachment: async (input, { maxBytes }) => uploadDirectory === undefined
      ? { ok: false, refusal: "no-record" }
      : readChatAttachmentForOwner({ uploadDirectory }, { ...input, maxBytes }),
  };
}

/** The ffmpeg video converter for `media_convert_video`, built once here so the media feature never
 * names a binary. A host without ffmpeg still gets the tool; it answers in plain words that
 * conversion needs ffmpeg on this computer and changes nothing. Lazy: no process starts until a
 * conversion is asked for. */
export function createMediaConversionPorts(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): MediaConversionPorts {
  return { transcoder: createFfmpegMediaTranscoder({}, {}) };
}
