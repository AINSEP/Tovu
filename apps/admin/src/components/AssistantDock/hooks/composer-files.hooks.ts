import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { describeUploadOverLimit } from "@jini-ai/core/text";
import { MAX_UPLOAD_BATCH_BYTES, MAX_UPLOAD_BYTES, uploadLimitForFile } from "@tovu/contracts/upload-limits";
import {
  withSizeRefusalCopy as withAdminSizeRefusalCopy,
  useAttachmentUploader as useAdminAttachmentUploader, useAttachmentValidator as useAdminAttachmentValidator,
  useFolderDropBridge as useAdminFolderDropBridge, useWorkingDirectoryAccess as useAdminWorkingDirectoryAccess,
} from "@jini-ai/admin/shell/components/AssistantDock/hooks/composer-files.hooks";
import type { ChatPaneWorkingDirectoryAccess } from "@jini-ai/admin/react/kit";
import { useMemo } from "react";
import type { UseFolderDrop } from "@jini-ai/admin/screens/fs-files/use-folder-drop.hooks";

import { CHAT_ATTACHMENT_ROUTE_RULES } from "@/lib/chat-attachment-liveness";
import { folderDropDeps } from "@/features/fs-files/api/fs-files-api";
import { fileSizeRefusal } from "@/features/media/upload-size-copy";

/**
 * The same limits the server enforces, read from the shared contract (`apps/admin` is a browser
 * bundle and cannot import website code) so a rejection surfaces here, before any bytes are sent.
 * One source for Library, Media, chat attachments and assistant imports (owner 2026-10-29); a video gets
 * the larger video limit, picked per file by {@link uploadLimitForFile} (owner 2026-11-24).
 */
export const CHAT_ATTACHMENT_MAX_BYTES = MAX_UPLOAD_BYTES;
export const CHAT_ATTACHMENT_MAX_BATCH_BYTES = MAX_UPLOAD_BATCH_BYTES;

/** The legacy plugin manifest name the skill-package detector still recognises. */
export const TOVU_LEGACY_MANIFEST_NAMES: readonly string[] = ["tovu.plugin.json"]; // the host's legacy plugin manifest alias

/**
 * Builds the `uploadAttachments` callback `AssistantDock.tsx` passes to `<ChatPane>`. Injectable
 * per `INFO.md`'s Components rule 3 (real I/O: every upload is a `fetch` to the daemon's own
 * `/api/attachments` route) — defaulted to the real hook on `AssistantDockProps`.
 *
 * `''` baseUrl: `createDaemonAttachmentUploader` builds `${baseUrl}/api/attachments`, so an empty
 * string resolves to the same bare `/api/attachments` relative path `AGENTS_URL`/the rescan route
 * below already use — same-origin, proxied by `apps/website/src/server/runtime/composition/modules/assistant.ts` to the agent
 * daemon, matching every other request this dock makes. Memoized for the same reason the transport
 * is: it owns internal per-uploader batch-quota state (`create-daemon-attachment-uploader.ts`'s
 * `batchUsage` map), so rebuilding it on every render would silently reset a turn's running quota
 * mid-upload.
 *
 * @returns The memoized uploader instance.
 * @example
 * const uploadAttachments = useAttachmentUploader({ t });
 */
type AttachmentUploader = ReturnType<typeof useAdminAttachmentUploader>;

/**
 * Wraps the uploader so a file over its own limit is refused with the host's copy: the ordinary 50 MB limit gets
 * the translated sentence, while the larger video limit keeps its plain "That file is N MB; the limit is M MB."
 * wording (converting cannot bring a file under it). The uploader would refuse the same first file with English
 * text, so checking here first changes only the wording, never which files are accepted.
 *
 * @complexity O(files) per call; the wrapped uploader's cost is unchanged.
 */
export function withSizeRefusalCopy(
  { uploader, t }: { uploader: AttachmentUploader; t: (key: string) => string },
  _optional: Record<string, never> = {},
): AttachmentUploader {
  return withAdminSizeRefusalCopy({
    uploader, t, limitForFile: uploadLimitForFile,
    describeRefusal: ({ t, limitBytes, fileBytes }) => fileSizeRefusal({ t, limitBytes, fallback: describeUploadOverLimit({ fileBytes, limitBytes }) }),
  });
}

export function useAttachmentUploader({ t }: { t: (key: string) => string }, _optional: Record<string, never> = {}): AttachmentUploader {
  const uploader = useAdminAttachmentUploader({ fetch }, { maxAttachmentBytes: CHAT_ATTACHMENT_MAX_BYTES, maxAttachmentBytesFor: uploadLimitForFile, maxBatchBytes: CHAT_ATTACHMENT_MAX_BATCH_BYTES });
  return useMemo(() => withSizeRefusalCopy({ uploader, t }), [uploader, t]);
}

/** Stable across renders (the shared hook memoizes on it); `fetch` resolves at probe time, as the pre-move `bind` at mount did for a stubbed global. */
const CHAT_ATTACHMENT_VALIDATOR_INPUT = { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args), ...CHAT_ATTACHMENT_ROUTE_RULES };

/**
 * Builds the `validateAttachments` callback `AssistantDock.tsx` passes to `<ChatPane>` — the host
 * half of restoring a persisted composer draft's ATTACHMENTS. Injectable per `INFO.md`'s Components
 * rule 3 for the same reason {@link useAttachmentUploader} above is: every probe is a real `fetch`
 * to `/api/attachments/:ref`, which a fake bypasses entirely.
 *
 * Without this prop `@jini-ai/chat` restores such a draft's TEXT only: it persists the attachment
 * references, but hands back none that no host has vouched for, because the staged bytes sit under
 * the daemon's one-hour `retentionMs` and a chip for a pruned file looks intact and dies at send.
 * See `lib/chat-attachment-liveness.ts` for the full rule and why a HEAD answers it.
 *
 * Memoized for the same reason the uploader is: `ChatPane` reads this on a draft restore at mount,
 * and a new identity each render would make that a moving dependency.
 *
 * @returns The memoized validator instance.
 * @example
 * const validateAttachments = useAttachmentValidator();
 */
export function useAttachmentValidator(): ReturnType<typeof useAdminAttachmentValidator> {
  return useAdminAttachmentValidator({ input: CHAT_ATTACHMENT_VALIDATOR_INPUT });
}

/** Where the recent-folder names already live; host-owned and unchanged so existing lists survive. */
const RECENT_DIRECTORY_NAMES_STORAGE_KEY = "tovu.assistant.recentWorkingDirectoryNames";

/**
 * Builds the composer's native working-directory access — see
 * `@jini-ai/admin/shell/lib/browser-working-directory-access`'s module doc for the File System Access API details
 * and its known folder-NAME-not-path limitation. Injectable per `INFO.md`'s Components rule 3
 * (this is a browser API, `window.showDirectoryPicker`) — defaulted to the real hook on
 * `AssistantDockProps`.
 *
 * Memoized for the same reason `useAttachmentUploader` above is: the returned object's identity
 * feeds `ChatPane`'s own `workingDirectoryAccess`-changed effect
 * (`useChatPaneWorkingDirectory.hooks.ts`), so a new object on every render would re-run that
 * effect's directory validation on every render too.
 *
 * @returns The memoized access object, or `undefined` on a browser with no native picker (Safari,
 * Firefox) — `ChatPane` falls back to its own text-input popover when this is `undefined`.
 * @example
 * const workingDirectoryAccess = useWorkingDirectoryAccess();
 */
export function useWorkingDirectoryAccess(): ChatPaneWorkingDirectoryAccess | undefined {
  return useAdminWorkingDirectoryAccess({ recentDirectoryNamesStorageKey: RECENT_DIRECTORY_NAMES_STORAGE_KEY, orFallbackSync });
}

export function useAttachmentUploaderSeam({ override, t }: { override: typeof useAttachmentUploader | undefined; t: (key: string) => string }, _options: Record<string, never> = {}
): ReturnType<typeof useAttachmentUploader> {
  return (override ?? useAttachmentUploader)({ t });
}

export function useAttachmentValidatorSeam({ override }: { override: typeof useAttachmentValidator | undefined }, _options: Record<string, never> = {}
): ReturnType<typeof useAttachmentValidator> {
  return (override ?? useAttachmentValidator)();
}

export function useWorkingDirectoryAccessSeam({ override }: { override: typeof useWorkingDirectoryAccess | undefined }, _options: Record<string, never> = {}
): ChatPaneWorkingDirectoryAccess | undefined {
  return (override ?? useWorkingDirectoryAccess)();
}

/**
 * Bridges `useFolderDrop`'s imperative `handleDropCapture` out of `AssistantDock` to the wrapping
 * `<aside onDropCapture={...}>` in `App.tsx` (SPEC-053) — `AssistantDock.tsx` itself holds "props
 * interface + JSX, and nothing else" per this file's own header, so the `useEffect` that publishes
 * the handler through a caller-supplied ref lives here, not there. Not a `use*Seam` wrapper like its
 * neighbors above: `useFolderDrop` is this feature's own new hook, not an existing DOM/IO hook this
 * component previously called bare, so there is no "real hook to default to when no override is
 * given" to resolve — `useComposerVoiceInput` (a bare call in `AssistantDock.tsx`, no seam) is the
 * closer precedent, not the eight/nine `use*Seam` hooks.
 *
 * @param input.input - {@link UseFolderDropInput} — passed straight through to `useFolderDrop`.
 * @param input.onReady - `AssistantDockProps.onFolderDropCaptureReady`. Invoked once per identity change
 *   of `handleDropCapture` (which itself only changes if `input.composerHandle` or `useFolderDrop`'s
 *   internal callbacks change — effectively once per mount). `undefined` when the caller (e.g. a
 *   test rendering `AssistantDock` directly) does not care to receive it.
 * @returns {@link UseFolderDrop} — `AssistantDock.tsx` renders `notice`/`dismiss`/`retry` from this
 *   directly; `handleDropCapture` is consumed only via `onReady` above, never by `AssistantDock.tsx`
 *   itself (nothing there needs to call it directly).
 * @complexity Time/space: O(1) beyond what `useFolderDrop` itself costs.
 */
export function useFolderDropBridge(
  { input, onReady }: Omit<Parameters<typeof useAdminFolderDropBridge>[0], "folderDropDeps">,
  options: Parameters<typeof useAdminFolderDropBridge>[1] = {},
): UseFolderDrop {
  return useAdminFolderDropBridge({ input, onReady, folderDropDeps }, options);
}
