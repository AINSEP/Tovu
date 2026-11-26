import { readOwnerChatAttachment as readChatAttachmentForOwner } from "#src/features/media/chat-attachment-reader-host";
import { isNativeMessageImage, prepareMessageAttachments } from "@jini-ai/daemon";
import type { ChatAttachmentReadResult } from "@jini-ai/core/contracts/headless/chat-attachment";
import { sniffContentType } from "#src/features/media/index";
import { MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";

export class AttachmentUnavailableError extends Error {}

/** CMS authorization adapter for the same byte preparation used by daemon runs. A preview read
 * does not claim files: BYOK is request-scoped and has no daemon run to own their cleanup.
 * `uploadDirectory` is the booted site's `RouteDeps.siteStoragePaths.chatAttachmentsDir`, passed in
 * rather than resolved here from env/`siteDir()`, which can name a different site (hardwiring audit #19). */
export function prepareByokMessageAttachments(
  { refs, principalId, uploadDirectory }: { refs: readonly string[]; principalId: string; uploadDirectory: string },
  { read = (input, options) => readChatAttachmentForOwner({ uploadDirectory, ...input }, options) }: {
    read?: (required: { ref: string; ownerId: string }, optional: NonNullable<Parameters<typeof readChatAttachmentForOwner>[1]>) => Promise<ChatAttachmentReadResult>;
  } = {},
) {
  return prepareMessageAttachments({ refs, read: async ({ ref }) => {
    const result = await read({ ref, ownerId: principalId }, {
      selectRead: ({ prefix }) => isNativeMessageImage({ mimeType: sniffContentType({ bytes: prefix }) }) ? "full" : "prefix",
      maxFullBytes: MAX_UPLOAD_BYTES,
    });
    if (!result.ok) throw new AttachmentUnavailableError("Attachment is unavailable. Reattach it before sending.");
    return { name: ref, bytes: result.bytes, mimeType: sniffContentType({ bytes: result.bytes }) };
  } }, {});
}
