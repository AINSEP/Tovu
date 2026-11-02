/**
 * @file The fleet chat's persisted conversation threads and their delete confirmation. Split out
 * of `App.hooks.ts` (which still re-exports all of it) with no behaviour change; the threads' logic
 * itself now lives in `runner-conversation-controller.ts`, and `useRunnerConversations` only binds
 * it to React.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatMessage } from '@jini-ai/chat/core';
import type { ConversationListItem } from '@jini-ai/chat/react';
import { runnerInventoryBridge } from './runner-api.js';
import { createRunnerConversationController } from './runner-conversation-controller.js';
import type { BridgeLookup } from './bridge-lookup.js';
import type { WorkspaceConversationSummary } from '../contracts/workspace-conversations.js';

export interface UseRunnerConversations {
  conversations: readonly WorkspaceConversationSummary[];
  activeId: string | null;
  /**
   * `ChatPane`'s `key`. Deliberately NOT `activeId`.
   *
   * `ChatPane` takes `initialMessages` only at MOUNT (`useConversation.ts`'s
   * `useState(options.initialMessages ?? [])`), so switching to a different conversation's
   * transcript means remounting the pane via a changed `key` — pushing new messages into a live
   * pane would fight its own state instead of replacing it. But `activeId` ALSO changes when an
   * untitled pane silently adopts a freshly created conversation mid-turn (see `onMessagesChange`
   * below), and re-keying on THAT would remount the pane out from under a reply it is currently
   * streaming. So the two stay separate: `paneKey` changes only on `select`/`create`/`remove`;
   * `activeId` tracks where the next write goes. Ported from Tovu admin's
   * `use-assistant-chats.hooks.ts`, which found this the hard way.
   */
  paneKey: string;
  /** Messages to seed the pane with. Changes identity only on a real conversation switch. */
  initialMessages: ChatMessage[];
  select: (id: string) => void;
  create: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  /**
   * `ChatPane`'s `onMessagesChange`. Fires once on MOUNT with whatever `initialMessages` seeded it
   * with (`useChatPane.hooks.ts`'s effect on `conversation.messages`), so a fresh pane with nothing
   * selected calls this with `[]` at mount — `persistableMessages([]).length === 0` makes that a
   * no-op in the controller (`runner-conversation-controller.ts`), rather than mistaking a mount
   * echo for new content to save.
   */
  onMessagesChange: (messages: ChatMessage[]) => void;
}

/**
 * Owns the fleet chat's persisted conversation threads: which one is open, what's in it, and
 * writing new turns back to Runner's own `runner_conversations`/`runner_conversation_messages`
 * tables over IPC (`fleet-conversation-store.ts`). Only the React binding: every rule and race
 * guard — and the reasoning behind each — lives in `createRunnerConversationController`
 * (`runner-conversation-controller.ts`), one controller per bridge, read here through
 * `useSyncExternalStore`.
 */
export function useRunnerConversations(
  _required: Record<string, never> = {},
  { getBridge = runnerInventoryBridge }: {
    getBridge?: BridgeLookup<'listConversations' | 'loadConversationMessages' | 'createConversation'
      | 'deleteConversation' | 'renameConversation' | 'saveConversationMessage'>;
  } = {},
): UseRunnerConversations {
  const bridge = useMemo(() => getBridge(), [getBridge]);
  const controller = useMemo(() => createRunnerConversationController({ bridge }), [bridge]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  useEffect(() => {
    void controller.refresh();
  }, [controller]);

  const { select, create, remove, rename, onMessagesChange } = controller;
  return { ...state, select, create, remove, rename, onMessagesChange };
}

export interface ConversationDeleteConfirmationState {
  /** The title of the conversation currently asking to be confirmed, or `null` when nothing is
   *  pending. Falls back to `'Untitled'` the same way `ConversationList` itself does. */
  pendingTitle: string | null;
  /**
   * `ConversationList`'s `confirmDelete` prop. Deliberately NOT `window.confirm` — this repo has
   * already paid for that lesson once, for project delete: a native modal blocks the whole
   * renderer, and in Electron that also freezes the IPC this window answers on (see
   * `useDeleteConfirmation`'s doc in `use-delete-confirmation.hooks.ts`). This returns a promise
   * that resolves only when the operator answers the inline confirmation `WorkspaceChatPane`
   * renders from `pendingTitle`.
   */
  confirmDelete: (item: ConversationListItem) => Promise<boolean>;
  /** Answers the pending confirmation, if any. A no-op when nothing is pending. */
  resolvePending: (confirmed: boolean) => void;
}

/**
 * The fleet chat's conversation-delete confirmation. `ConversationList` (`@jini-ai/chat/react`)
 * accepts a `confirmDelete` callback returning `boolean | Promise<boolean>` for exactly this
 * purpose — ours resolves it from a real operator click on `WorkspaceChatPane`'s own inline banner
 * rather than from a blocking native dialog. See commit `204f3e6` ("require operator confirmation
 * for project delete") for the precedent this follows.
 */
export function useConversationDeleteConfirmation(): ConversationDeleteConfirmationState {
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);

  const confirmDelete = useCallback((item: ConversationListItem): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // An unresolved earlier prompt loses to a newer one rather than leaving two pending — the
      // operator can only be looking at (and answering) one banner at a time.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setPendingTitle(item.title ?? 'Untitled');
    });
  }, []);

  const resolvePending = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setPendingTitle(null);
  }, []);

  return { pendingTitle, confirmDelete, resolvePending };
}
