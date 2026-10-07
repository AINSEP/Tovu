import { readChatAttachmentForOwner } from "#src/features/media/read-chat-attachment";
import type { InstallAttachmentReader } from "#src/features/plugin-runtime/install-source";
import { resolveChatAttachmentUploadDirectory } from "../../inbound/assistant/chat-attachment-directory.js";

/** BYOK uses the same principal-owned sidecar reader as video. The daemon additionally binds
 * refs to its accepted message: another pending upload owned by this principal is not this run's input. */
export function createPluginInstallAttachmentReader(
  _required: Record<string, never>,
  optional: { uploadDirectory?: string; getMessageAttachmentRefs?: (required: { runId: string }) => readonly string[] } = {},
): InstallAttachmentReader {
  return async ({ ref, ownerId, runId }, { maxBytes }) => {
    if (optional.getMessageAttachmentRefs && !optional.getMessageAttachmentRefs({ runId }).includes(ref)) return { ok: false, refusal: "no-record" };
    return readChatAttachmentForOwner({ uploadDirectory: optional.uploadDirectory ?? resolveChatAttachmentUploadDirectory() }, { ref, ownerId, maxBytes });
  };
}
