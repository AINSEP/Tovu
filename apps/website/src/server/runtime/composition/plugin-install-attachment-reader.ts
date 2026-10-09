import { readChatAttachmentForOwner } from "#src/features/media/read-chat-attachment";
import type { InstallAttachmentReader } from "#src/features/plugin-runtime/install-source";

/** BYOK uses the same principal-owned sidecar reader as video. The daemon additionally binds
 * refs to its accepted message: another pending upload owned by this principal is not this run's input.
 * `optional.uploadDirectory` is the booted site's `RouteDeps.siteStoragePaths.chatAttachmentsDir`,
 * which both production roots pass; it used to fall back to an env/`siteDir()` resolution that can
 * name a different site (hardwiring audit #19). Absent — hermetic compositions only — every read
 * refuses as `no-record` rather than guessing a directory. */
export function createPluginInstallAttachmentReader(
  _required: Record<string, never>,
  optional: { uploadDirectory?: string; getMessageAttachmentRefs?: (required: { runId: string }) => readonly string[] } = {},
): InstallAttachmentReader {
  return async ({ ref, ownerId, runId }, { maxBytes }) => {
    if (optional.getMessageAttachmentRefs && !optional.getMessageAttachmentRefs({ runId }).includes(ref)) return { ok: false, refusal: "no-record" };
    if (optional.uploadDirectory === undefined) return { ok: false, refusal: "no-record" };
    return readChatAttachmentForOwner({ uploadDirectory: optional.uploadDirectory }, { ref, ownerId, maxBytes });
  };
}
