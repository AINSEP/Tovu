/**
 * @file `WorkspaceChatPane`'s hook (`App.tsx`): everything the fleet chat pane holds and every
 * handler it hands to its markup, so the component itself is markup only — this repo keeps functions
 * and raw React primitives out of `.tsx` component bodies.
 *
 * `captureFolderDrop`, `workspaceConversationView` and `WORKSPACE_RUN_CONTEXT` are plain exports
 * rather than logic inside `useWorkspaceChatPane`'s body, for the reason `use-site-rename.hooks.ts`
 * gives: this package has no React renderer, so a decision left inside a hook body cannot be tested
 * here, while a plain function can (`use-workspace-chat-pane.hooks.test.ts`).
 *
 * The pane has no call site today — see the comment at the end of `App`'s JSX, and
 * `one-chat-fab-wiring.test.ts`. It is kept for the workspace-level chat panel that replaces the
 * removed FAB.
 */
import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { ChatPaneComposerHandle, ChatPaneRunContext } from '@jini-ai/chat/react/chat-pane';
import type { ConversationListItem } from '@jini-ai/chat/react';
import {
  useConversationDeleteConfirmation,
  useRunnerConversations,
  useWorkspaceChatTransport,
  type ConversationDeleteConfirmationState,
  type UseRunnerConversations,
} from './App.hooks.js';
import { folderPathsFromDataTransfer } from './folder-drop.js';

/**
 * The picker's model/reasoning choice reaches the transport through `runContext`, not through
 * `startRun`'s own arguments: `ChatTransport.StartRunInput` carries `agentId` but nothing about how
 * that agent should be configured, and `context` is the port's designated opaque per-host payload.
 *
 * An unset `model` or `reasoning` is left out of the context entirely rather than sent as
 * `undefined`. `satisfies` rather than a `ChatPaneRunContext` annotation so the constant keeps its
 * callable type — `ChatPaneRunContext` is a union with a plain object, which a test cannot call.
 */
export const WORKSPACE_RUN_CONTEXT = (({ selection }) => ({
  ...(selection.model === undefined ? {} : { model: selection.model }),
  ...(selection.reasoning === undefined ? {} : { reasoning: selection.reasoning }),
})) satisfies ChatPaneRunContext;

/** Exactly what {@link captureFolderDrop} reads off a drop event, so a test can pass a plain object. */
export interface FolderDropEvent {
  dataTransfer: DataTransfer;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/**
 * The pane's capture-phase drop handler: a drop carrying at least one FOLDER is swallowed and the
 * folder path(s) go into the composer draft as text; any other drop passes through untouched.
 *
 * Capture phase, deliberately not a bubble-phase `onDrop`: this has to see the raw event BEFORE
 * `ChatPane`'s own drop handler (buried in its tree, attached in the bubble phase) would expand a
 * dropped folder into synthesized leaf files via the `FileSystemEntry` API — see
 * `folderPathsFromDataTransfer`'s doc for why that expansion loses the folder's own path.
 *
 * Unlike an earlier version of this handler, a recovered folder path now `preventDefault`s AND
 * `stopPropagation`s instead of passing the event through: letting `ChatPane` see it is exactly
 * the bug this exists to fix (TODO.md, "Chat composer: folder drop should yield a path, not an
 * upload") — the owner dropped a folder wanting a path and got "You can attach at most 10 files
 * to one message." The path goes into the composer as TEXT via `composerHandle.insertText`
 * instead; the fleet agent already has filesystem/Bash access on this machine and can act on it
 * directly. A drop that resolves to no folder at all (a loose file, a plain text drag) is left
 * alone on purpose: `ChatPane` now has `uploadAttachments` wired (`chat-attachments.ts`'s
 * `createLocalAttachmentUploader`), so that case is a real staged attachment, not an unhandled
 * drop — exactly the folder/file distinction this handler exists to preserve.
 *
 * @param event the drop, narrowed to the three members read.
 * @param getPathForFile the bridge's path lookup; `undefined` without a desktop bridge, which
 *   leaves every drop to `ChatPane`.
 * @param composerHandle populated by `ChatPane` once mounted. A folder drop while it is still
 *   `null` is swallowed all the same, and nothing is inserted.
 * @complexity O(n) in the number of dragged items (`folderPathsFromDataTransfer`).
 */
export function captureFolderDrop(
  event: FolderDropEvent,
  getPathForFile: ((file: File) => string) | undefined,
  composerHandle: RefObject<Pick<ChatPaneComposerHandle, 'insertText'> | null>,
): void {
  if (getPathForFile === undefined) return;
  const folders = folderPathsFromDataTransfer(event.dataTransfer, getPathForFile);
  if (folders.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  composerHandle.current?.insertText(folders.join(' '));
}

/** What `WorkspaceChatPane` hands `ConversationList` and `ChatPane` from `useRunnerConversations`. */
export interface WorkspaceConversationView {
  /** `ConversationList`'s `conversations`. */
  listItems: ConversationListItem[];
  /** Spread onto `ChatPane`: `{}` while nothing is active, so no `conversationId` prop is passed. */
  conversationIdProp: { conversationId?: string };
}

/**
 * The two values `WorkspaceChatPane` derives from `useRunnerConversations`.
 *
 * `listItems` is a shallow copy: `ConversationListItem[]` (mutable) is the package's own prop type,
 * while `useRunnerConversations` returns `readonly` for consistency with every other list in
 * `App.hooks.ts` (`useSitesPolling`'s `projects`, etc.), so the boundary copies here rather than
 * widening the hook's own contract for one caller.
 *
 * @complexity O(n) in the number of conversations (the copy).
 */
export function workspaceConversationView(
  conversations: Pick<UseRunnerConversations, 'conversations' | 'activeId'>,
): WorkspaceConversationView {
  return {
    listItems: [...conversations.conversations],
    conversationIdProp: conversations.activeId === null ? {} : { conversationId: conversations.activeId },
  };
}

export interface WorkspaceChatPaneState extends WorkspaceConversationView {
  transport: ReturnType<typeof useWorkspaceChatTransport>['transport'];
  runtimeAccess: ReturnType<typeof useWorkspaceChatTransport>['runtimeAccess'];
  workingDirectoryAccess: ReturnType<typeof useWorkspaceChatTransport>['workingDirectoryAccess'];
  uploadAttachments: ReturnType<typeof useWorkspaceChatTransport>['uploadAttachments'];
  conversations: UseRunnerConversations;
  deleteConfirmation: ConversationDeleteConfirmationState;
  /** The working-directory picker's value (native folder dialog + MRU list). */
  workingDirectory: string | null;
  setWorkingDirectory: Dispatch<SetStateAction<string | null>>;
  /** Handed to `ChatPane`, which populates it once mounted. */
  composerHandle: RefObject<ChatPaneComposerHandle | null>;
  /** The `<aside>`'s `onDropCapture` — see {@link captureFolderDrop}. */
  onDropCapture: (event: DragEvent<HTMLElement>) => void;
}

/**
 * Everything `WorkspaceChatPane` holds.
 *
 * The hooks run in the order the component itself called them before this extraction — transport,
 * conversations, delete confirmation, then the pane's own state, ref and drop callback — so moving
 * them here changed no hook's position.
 */
export function useWorkspaceChatPane(): WorkspaceChatPaneState {
  const { transport, runtimeAccess, workingDirectoryAccess, getPathForFile, uploadAttachments } =
    useWorkspaceChatTransport();
  const conversations = useRunnerConversations();
  const deleteConfirmation = useConversationDeleteConfirmation();
  // The working-directory picker (native folder dialog + MRU list) — unrelated to, and untouched
  // by, the drop handler below. A folder drop no longer feeds this: see `captureFolderDrop`'s doc.
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  // Populated by `ChatPane` itself once mounted (`ChatPaneComposerHandle`, `@jini-ai/chat`). The
  // seam `captureFolderDrop` uses to write a dropped folder's path into the draft as text.
  const composerHandle = useRef<ChatPaneComposerHandle | null>(null);
  const onDropCapture = useCallback(
    (event: DragEvent<HTMLElement>) => captureFolderDrop(event, getPathForFile, composerHandle),
    [getPathForFile],
  );

  return {
    transport,
    runtimeAccess,
    workingDirectoryAccess,
    uploadAttachments,
    conversations,
    deleteConfirmation,
    ...workspaceConversationView(conversations),
    workingDirectory,
    setWorkingDirectory,
    composerHandle,
    onDropCapture,
  };
}
