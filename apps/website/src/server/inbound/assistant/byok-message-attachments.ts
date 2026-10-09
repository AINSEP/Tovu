import { prepareMessageAttachments } from "@jini-ai/daemon";
import { readChatAttachmentForOwner, type ChatAttachmentReadResult } from "#src/features/media/read-chat-attachment";
import { sniffContentType } from "#src/features/media/index";

/** CMS authorization adapter for the same byte preparation used by daemon runs. A preview read
 * does not claim files: BYOK is request-scoped and has no daemon run to own their cleanup.
 * `uploadDirectory` is the booted site's `RouteDeps.siteStoragePaths.chatAttachmentsDir`, passed in
 * rather than resolved here from env/`siteDir()`, which can name a different site (hardwiring audit #19). */
export function prepareByokMessageAttachments(
  { refs, principalId, uploadDirectory }: { refs: readonly string[]; principalId: string; uploadDirectory: string },
  { read = input => readChatAttachmentForOwner({ uploadDirectory }, input) }: {
    read?: (required: { ref: string; ownerId: string }) => Promise<ChatAttachmentReadResult>;
  } = {},
) {
  return prepareMessageAttachments({ refs, read: async ({ ref }) => {
    const result = await read({ ref, ownerId: principalId });
    if (!result.ok) throw new Error("Attachment is unavailable. Reattach it before sending.");
    return { name: ref, bytes: result.bytes, mimeType: sniffContentType({ bytes: result.bytes }) };
  } }, {});
}
