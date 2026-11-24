/**
 * @file `WorkspaceChatPane`'s hook (`WorkspaceChatPane.tsx`): everything the fleet chat pane holds and every
 * handler it hands to its markup, so the component itself is markup only — this repo keeps functions
 * and raw React primitives out of `.tsx` component bodies.
 *
 * `workspaceConversationView` and `WORKSPACE_RUN_CONTEXT` are plain exports
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
import { captureFolderPathDrop } from '@jini-ai/ui/core';

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
  /** The `<aside>`'s capture-phase `onDropCapture` (`@jini-ai/ui/core` `captureFolderPathDrop`). */
  onDropCapture: (event: DragEvent<HTMLElement>) => void;
}

/**
 * Everything `WorkspaceChatPane` holds.
 *
 * The hooks run in the order the component itself called them before this extraction — transport,
 * conversations, delete confirmation, then the pane's own state, ref and drop callback — so moving
 * them here changed no hook's position.
 */
export function useWorkspaceChatPane(
  _input: Record<string, never> = {},
  {
    useTransport = useWorkspaceChatTransport,
    useConversations = useRunnerConversations,
    useDeleteConfirmation = useConversationDeleteConfirmation,
  }: {
    /** The three hook ports, defaulting to `App.hooks.ts`'s; each must keep its position stable. */
    useTransport?: typeof useWorkspaceChatTransport;
    useConversations?: typeof useRunnerConversations;
    useDeleteConfirmation?: typeof useConversationDeleteConfirmation;
  } = {},
): WorkspaceChatPaneState {
  const { transport, runtimeAccess, workingDirectoryAccess, getPathForFile, uploadAttachments } =
    useTransport();
  const conversations = useConversations();
  const deleteConfirmation = useDeleteConfirmation();
  // The working-directory picker (native folder dialog + MRU list) — unrelated to, and untouched
  // by, the drop handler below. A folder drop no longer feeds this: its path goes into the draft as text.
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  // Populated by `ChatPane` itself once mounted (`ChatPaneComposerHandle`, `@jini-ai/chat`). The
  // seam the folder drop uses to write a dropped folder's path into the draft as text.
  const composerHandle = useRef<ChatPaneComposerHandle | null>(null);
  const onDropCapture = useCallback(
    // Folder drop: `@jini-ai/ui/core` `captureFolderPathDrop`, port = preload `getPathForFile`,
    // composer = `ChatPane` `composerHandle`; quoted when a path has whitespace. Capture phase so a
    // dropped folder yields a path, not an upload (desktop backlog, "Chat composer: folder drop
    // should yield a path, not an upload").
    (event: DragEvent<HTMLElement>) => {
      captureFolderPathDrop({ event, port: getPathForFile === undefined ? undefined : { getPathForFile }, composer: composerHandle });
    },
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
