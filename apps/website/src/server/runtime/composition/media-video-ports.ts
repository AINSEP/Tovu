import { prepareMessageAttachments } from "@jini-ai/daemon";
import { readOwnerChatAttachment as readChatAttachmentForOwner } from "#src/features/media/chat-attachment-reader-host";
import { createFfmpegMediaTranscoder } from "@jini-ai/agent-plugins/ffmpeg-transcode/adapter";
import { createFfmpegVideoCodecProbe, createFfmpegVideoFrameExtractor, createVideoExtractionLock, findVideoBinaries, runLowPriorityVideoProcess } from "@jini-ai/cms/media/node";
import { VIDEO_CONVERSION_MESSAGES, VIDEO_TRANSCODE_MAX_INPUT_BYTES, sniffContentType } from "@jini-ai/cms/media";
import type { MediaVideoToolPorts } from "@jini-ai/cms/media/site/view-video-tool";
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
    prepareImages: prepareMessageAttachments,
    extractor: createFfmpegVideoFrameExtractor({}, {}),
    readAttachment: async (input, { maxBytes }) => uploadDirectory === undefined
      ? { ok: false, refusal: "no-record" }
      : readChatAttachmentForOwner({ uploadDirectory, ...input }, { maxBytes }),
  };
}

/** The ffmpeg video converter for `media_convert_video` and the import hook, built once per host root
 * here so the media feature never names a binary. A host without ffmpeg still gets the tool; it answers
 * in plain words that conversion needs ffmpeg on this computer and changes nothing. Lazy: binary
 * discovery and the process launch only happen when a conversion is asked for. `env` is the host's
 * binary-discovery environment (`FFMPEG_PATH`, `PATH`), supplied by the composition root and never
 * read from ambient state here. */
export function createMediaConversionPorts({ env }: { env: NodeJS.ProcessEnv }, _optional: Record<string, never> = {}): MediaConversionPorts {
  // One lock for both: a codec probe never competes with a running conversion for the same machine.
  const lock = createVideoExtractionLock({});
  return {
    // Compatibility depends on the codec, not the filename or container, so only ffprobe's answer is recorded.
    videoCodecProbe: createFfmpegVideoCodecProbe({ findBinaries: findVideoBinaries, runProcess: runLowPriorityVideoProcess, lock, env }, {}),
    transcoder: createFfmpegMediaTranscoder({
      findBinaries: findVideoBinaries,
      runProcess: runLowPriorityVideoProcess,
      lock,
      sniffContentType,
      maxInputBytes: VIDEO_TRANSCODE_MAX_INPUT_BYTES,
      messages: VIDEO_CONVERSION_MESSAGES,
      env,
    }, {}),
  };
}
