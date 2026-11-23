import { createFfmpegVideoFrameExtractor } from "@jini-ai/cms/media/node";
import { readChatAttachmentForOwner } from "#src/features/media/index";
import type { MediaVideoToolPorts } from "#src/features/media/view-video-tool";

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
    // The composition root is the one place that reads this process's environment: the engine's ffmpeg
    // discovery (PATH, FFMPEG_PATH, FFPROBE_PATH) takes it injected and never reads it itself.
    extractor: createFfmpegVideoFrameExtractor({ env: process.env }, {}),
    readAttachment: async (input, { maxBytes }) => uploadDirectory === undefined
      ? { ok: false, refusal: "no-record" }
      : readChatAttachmentForOwner({ uploadDirectory }, { ...input, maxBytes }),
  };
}
