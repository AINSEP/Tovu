import { partitionChatPackages } from "./chat-package-kind";
import { captureSkillDrop } from "@/features/skills/skill-drop";
import { useCallback, useEffect, useMemo, type DragEvent } from "react";
import { createDaemonAttachmentUploader, type ChatPaneAgent, type ChatPaneWorkingDirectoryAccess } from "@jini-ai/chat/react";
import { type ExecutionConfig } from "@jini-ai/ui";

import { createChatAttachmentValidator } from "@/lib/chat-attachment-liveness";
import { ADMIN_UPLOAD_MAX_BYTES, isUploadTooLarge, uploadTooLargeMessage } from "@/lib/upload-limit";
import { createBrowserWorkingDirectoryAccess } from "@/lib/browser-working-directory-access";
import { useFolderDrop, type UseFolderDrop, type UseFolderDropInput } from "@/features/fs-files/hooks/use-folder-drop.hooks";

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
 * const uploadAttachments = useAttachmentUploader();
 */
/**
 * Mirrors the website daemon's own per-file/per-turn caps so a rejection surfaces here, before any
 * bytes are sent, rather than only after the daemon's own enforcement rejects them. The per-file
 * cap is the admin's one upload limit (`lib/upload-limit.ts`, P10-M2), shared with Library and
 * Media; see that file for why it is a hand-kept copy of the server's `TOVU_MAX_UPLOAD_BYTES`.
 * The batch cap must stay equal to `agent-daemon-server.ts`'s `ATTACHMENT_MAX_BATCH_BYTES`
 * (100 MiB, `TOVU_MAX_UPLOAD_BYTES * 2`) — update both together if either changes.
 */
const CHAT_ATTACHMENT_MAX_BATCH_BYTES = ADMIN_UPLOAD_MAX_BYTES * 2;

type AttachmentUpload = ReturnType<typeof createDaemonAttachmentUploader>;

/**
 * Refuses any file over the admin upload limit with the admin's own words, before `upload` runs.
 * `@jini-ai/chat`'s uploader also checks the size, but says "Each attachment must be 50 MB or
 * smaller." with no way forward; checking first keeps chat, Library and Media saying the same thing.
 * @returns An uploader with the same signature that forwards the composer's batch options untouched.
 * @throws Error carrying {@link uploadTooLargeMessage} when any file is over the limit.
 * @complexity O(files) time, O(1) space.
 */
export function withUploadSizeLimit({ upload }: { upload: AttachmentUpload }, { locale = "en" }: { locale?: string } = {}): AttachmentUpload {
  return async (files, options) => {
    if (files.some((file) => isUploadTooLarge({ size: file.size }))) throw new Error(uploadTooLargeMessage({ locale }));
    // Same reason as `useSkillAwareAttachmentUploader`: an explicit `undefined` options argument is
    // not the same call the composer made, so forward exactly what it passed.
    return options === undefined ? upload(files) : upload(files, options);
  };
}

/** @param input.locale - the viewer's admin locale for the size refusal; English when omitted. */
export function useAttachmentUploader({ locale = "en" }: { locale?: string } = {}): AttachmentUpload {
  return useMemo(
    () => withUploadSizeLimit({
      upload: createDaemonAttachmentUploader({ baseUrl: "", fetch }, {
        maxAttachmentBytes: ADMIN_UPLOAD_MAX_BYTES,
        maxBatchBytes: CHAT_ATTACHMENT_MAX_BATCH_BYTES,
      }),
    }, { locale }),
    [locale],
  );
}

/**
 * Routes skill packages to the install proposal; ordinary files retain their uploader result.
 * @returns A stable callback, refreshed when either injected dependency changes.
 * @complexity O(files) selection time and O(1) routing space; upload costs belong to the adapters.
 */
export function useSkillAwareAttachmentUploader(
  { uploadAttachments, proposeFiles }: {
    uploadAttachments: ReturnType<typeof createDaemonAttachmentUploader>;
    proposeFiles: (files: readonly File[]) => Promise<void>;
  },
  _optional: Record<string, never> = {},
): ReturnType<typeof createDaemonAttachmentUploader> {
  return useCallback(async (files, options) => {
    const { skills, attachments } = await partitionChatPackages({ files });
    if (skills.length > 0) await proposeFiles(skills);
    if (attachments.length === 0) return [];
    // The composer owns the message batch and cancellation lifetime. Dropping these options
    // makes separate attach actions create different batches, which the daemon cannot claim.
    return options === undefined ? uploadAttachments(attachments) : uploadAttachments(attachments, options);
  }, [uploadAttachments, proposeFiles]);
}

/**
 * Allows skill selection until the selected local runtime explicitly reports no tools.
 * @returns Whether the current runtime can receive skill guidance.
 * @complexity O(agents) time, O(1) space.
 */
export function resolveSkillsAvailable(
  { executionMode, selectedAgentId, agents }: {
    executionMode: ExecutionConfig["mode"];
    selectedAgentId: string;
    agents: readonly Pick<ChatPaneAgent, "id" | "supportsTools">[] | undefined;
  },
): boolean {
  return executionMode === "byok" || agents?.find(agent => agent.id === selectedAgentId)?.supportsTools !== false;
}

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
export function useAttachmentValidator(): ReturnType<typeof createChatAttachmentValidator> {
  return useMemo(() => createChatAttachmentValidator(), []);
}

/**
 * Builds the composer's native working-directory access — see
 * `@/lib/browser-working-directory-access`'s module doc for the File System Access API details
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
  return useMemo(() => createBrowserWorkingDirectoryAccess(), []);
}

export function useAttachmentUploaderSeam({ override }: { override: typeof useAttachmentUploader | undefined }, { locale }: { locale?: string } = {}
): ReturnType<typeof createDaemonAttachmentUploader> {
  return (override ?? useAttachmentUploader)(locale === undefined ? {} : { locale });
}

export function useAttachmentValidatorSeam({ override }: { override: typeof useAttachmentValidator | undefined }, _options: Record<string, never> = {}
): ReturnType<typeof createChatAttachmentValidator> {
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
  { input, onReady }: {
    input: UseFolderDropInput;
    onReady: ((handleDropCapture: (event: DragEvent<HTMLElement>) => void) => void) | undefined;
  },
  { proposeSkillFiles, onSkillDropError, useFolder = useFolderDrop }: {
    useFolder?: typeof useFolderDrop;
    proposeSkillFiles?: (files: readonly File[], paths?: readonly string[]) => Promise<void>;
    onSkillDropError?: (message: string) => void;
  } = {},
): UseFolderDrop {
  const folderDrop = useFolder(input);
  const handleDropCapture = useCallback((event: DragEvent<HTMLElement>) => {
    if (proposeSkillFiles && captureSkillDrop({ event, proposeFiles: proposeSkillFiles, fallback: folderDrop.handleDropCapture }, onSkillDropError ? { onError: onSkillDropError } : {})) return;
    folderDrop.handleDropCapture(event);
  }, [proposeSkillFiles, folderDrop.handleDropCapture, onSkillDropError]);
  useEffect(() => { onReady?.(handleDropCapture); }, [onReady, handleDropCapture]);
  return { ...folderDrop, handleDropCapture };
}

