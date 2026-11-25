import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import {
  useAttachmentUploader as useAdminAttachmentUploader, useAttachmentValidator as useAdminAttachmentValidator,
  useFolderDropBridge as useAdminFolderDropBridge, useWorkingDirectoryAccess as useAdminWorkingDirectoryAccess,
} from "@jini-ai/admin/shell/components/AssistantDock/hooks/composer-files.hooks";
import type { ChatPaneWorkingDirectoryAccess } from "@jini-ai/admin/react/kit";
import type { UseFolderDrop } from "@jini-ai/admin/screens/fs-files/use-folder-drop.hooks";

import { CHAT_ATTACHMENT_ROUTE_RULES } from "@/lib/chat-attachment-liveness";
import { folderDropDeps } from "@/features/fs-files/api/fs-files-api";

/**
 * Mirrors the website daemon's own per-file/per-turn caps so a rejection surfaces here, before any
 * bytes are sent, rather than only after the daemon's own enforcement rejects them. `apps/admin` is
 * a separate browser bundle from `apps/website` (no shared import today — see `tsconfig.json`'s
 * `@tovu/*` aliases for the narrow, dependency-free exceptions that DO cross that boundary), so
 * these are duplicated literals, not an import, matching this codebase's existing convention for a
 * client-side check that mirrors a server-side one it cannot reach (see `rules.ts`'s
 * `MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES` doc for the same "keep identical, by hand" pattern).
 *
 * Owner-directed (2026-09-21): must stay equal to `@jini-ai/cms/media`'s `MAX_DOCUMENT_BYTES`, which the website imports as
 * `TOVU_MAX_UPLOAD_BYTES` (50 MiB) and `agent-daemon-server.ts`'s `ATTACHMENT_MAX_BATCH_BYTES`
 * (100 MiB, `TOVU_MAX_UPLOAD_BYTES * 2`) — update both together if either changes.
 */
const CHAT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
const CHAT_ATTACHMENT_MAX_BATCH_BYTES = CHAT_ATTACHMENT_MAX_BYTES * 2;

/** The legacy plugin manifest name the skill-package detector still recognises. */
export const TOVU_LEGACY_MANIFEST_NAMES: readonly string[] = ["tovu.plugin.json"]; // the host's legacy plugin manifest alias

/** The shared uploader hook bound to this host's `fetch` and the website daemon's caps above. */
export function useAttachmentUploader(): ReturnType<typeof useAdminAttachmentUploader> {
  return useAdminAttachmentUploader({ fetch }, { maxAttachmentBytes: CHAT_ATTACHMENT_MAX_BYTES, maxBatchBytes: CHAT_ATTACHMENT_MAX_BATCH_BYTES });
}

/** Stable across renders (the shared hook memoizes on it); `fetch` resolves at probe time, as the pre-move `bind` at mount did for a stubbed global. */
const CHAT_ATTACHMENT_VALIDATOR_INPUT = { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args), ...CHAT_ATTACHMENT_ROUTE_RULES };

/** The shared validator hook bound to this host's read-back route — see `lib/chat-attachment-liveness.ts` for the full rule and why a HEAD answers it. */
export function useAttachmentValidator(): ReturnType<typeof useAdminAttachmentValidator> {
  return useAdminAttachmentValidator({ input: CHAT_ATTACHMENT_VALIDATOR_INPUT });
}

/** Where the recent-folder names already live; host-owned and unchanged so existing lists survive. */
const RECENT_DIRECTORY_NAMES_STORAGE_KEY = "tovu.assistant.recentWorkingDirectoryNames";

/** The shared native working-directory hook bound to this host's recent-folder storage key. */
export function useWorkingDirectoryAccess(): ChatPaneWorkingDirectoryAccess | undefined {
  return useAdminWorkingDirectoryAccess({ recentDirectoryNamesStorageKey: RECENT_DIRECTORY_NAMES_STORAGE_KEY, orFallbackSync });
}

export function useAttachmentUploaderSeam({ override }: { override: typeof useAttachmentUploader | undefined }, _options: Record<string, never> = {}
): ReturnType<typeof useAttachmentUploader> {
  return (override ?? useAttachmentUploader)();
}

export function useAttachmentValidatorSeam({ override }: { override: typeof useAttachmentValidator | undefined }, _options: Record<string, never> = {}
): ReturnType<typeof useAttachmentValidator> {
  return (override ?? useAttachmentValidator)();
}

export function useWorkingDirectoryAccessSeam({ override }: { override: typeof useWorkingDirectoryAccess | undefined }, _options: Record<string, never> = {}
): ChatPaneWorkingDirectoryAccess | undefined {
  return (override ?? useWorkingDirectoryAccess)();
}

/** The shared folder-drop bridge bound to this host's file-system ports. */
export function useFolderDropBridge(
  { input, onReady }: Omit<Parameters<typeof useAdminFolderDropBridge>[0], "folderDropDeps">,
  options: Parameters<typeof useAdminFolderDropBridge>[1] = {},
): UseFolderDrop {
  return useAdminFolderDropBridge({ input, onReady, folderDropDeps }, options);
}
