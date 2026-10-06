import { createFfmpegVideoFrameExtractor } from "@jini-ai/cms/media";
import { readChatAttachmentForOwner } from "#src/features/media/read-chat-attachment";
import type { MediaVideoToolPorts } from "#src/features/media/view-video-tool";
import { resolveChatAttachmentUploadDirectory } from "../../inbound/assistant/chat-attachment-directory.js";

/** Both CLI and BYOK catalogs receive the same owner reader and frame-extraction port. Directory
 * resolution is lazy so constructing a catalog never reads attachments or launches a process. */
export function createMediaVideoToolPorts(
  _required: Record<string, never>,
  { uploadDirectory }: { uploadDirectory?: string } = {},
): MediaVideoToolPorts {
  return {
    extractor: createFfmpegVideoFrameExtractor({}, {}),
    readAttachment: (input, { maxBytes }) => readChatAttachmentForOwner(
      { uploadDirectory: uploadDirectory ?? resolveChatAttachmentUploadDirectory() },
      { ...input, maxBytes },
    ),
  };
}
