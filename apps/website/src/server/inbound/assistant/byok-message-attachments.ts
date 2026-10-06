import { prepareMessageAttachments } from "@jini-ai/daemon";
import { readChatAttachmentForOwner, type ChatAttachmentReadResult } from "#src/features/media/read-chat-attachment";
import { sniffContentType } from "#src/features/media/index";
import { resolveChatAttachmentUploadDirectory } from "./chat-attachment-directory.js";

/** CMS authorization adapter for the same byte preparation used by daemon runs. A preview read
 * does not claim files: BYOK is request-scoped and has no daemon run to own their cleanup. */
export function prepareByokMessageAttachments(
  { refs, principalId }: { refs: readonly string[]; principalId: string },
  { read = input => readChatAttachmentForOwner({ uploadDirectory: resolveChatAttachmentUploadDirectory() }, input) }: {
    read?: (required: { ref: string; ownerId: string }) => Promise<ChatAttachmentReadResult>;
  } = {},
) {
  return prepareMessageAttachments({ refs, read: async ({ ref }) => {
    const result = await read({ ref, ownerId: principalId });
    if (!result.ok) throw new Error("Attachment is unavailable. Reattach it before sending.");
    return { name: ref, bytes: result.bytes, mimeType: sniffContentType({ bytes: result.bytes }) };
  } }, {});
}
