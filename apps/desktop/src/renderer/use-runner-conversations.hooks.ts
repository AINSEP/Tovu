/**
 * @file The fleet chat's persisted conversation threads and their delete confirmation. Split out
 * of `App.hooks.ts` (which still re-exports all of it) with no behaviour change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '@jini-ai/chat/core';
import type { ConversationListItem } from '@jini-ai/chat/react';
import { runnerInventoryBridge } from './runner-api.js';
import { persistableMessages } from './persistable-messages.js';
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
   * no-op below, rather than mistaking a mount echo for new content to save.
   */
  onMessagesChange: (messages: ChatMessage[]) => void;
}

/**
 * Owns the fleet chat's persisted conversation threads: which one is open, what's in it, and
 * writing new turns back to Runner's own `runner_conversations`/`runner_conversation_messages`
 * tables over IPC (`fleet-conversation-store.ts`). Structurally mirrors Tovu admin's
 * `useAssistantChats` (`use-assistant-chats.hooks.ts`) — the same hook shape solving the same
 * problem — simplified for a local Sqlite-backed IPC call instead of a flaky HTTP one: no write
 * retry ladder, since a failed local write is not a transient network blip worth re-attempting on
 * a timer, just something to log and let the next delta re-queue.
 *
 * `activeIdRef` mirrors `activeId` state and is written at the point of decision (never from an
 * effect): `onMessagesChange` is called from INSIDE `ChatPane`'s own effect, a child component, and
 * React runs a child's effects before its parent's in the same commit — an effect here mirroring
 * `activeId` would still be reading the outgoing value the moment a delta from the newly-mounted
 * pane arrives. Same hazard `use-assistant-chats.hooks.ts`'s `activeIdRef`/`commitActiveId` documents.
 */
export function useRunnerConversations(
  _required: Record<string, never> = {},
  { getBridge = runnerInventoryBridge }: {
    getBridge?: BridgeLookup<'listConversations' | 'loadConversationMessages' | 'createConversation'
      | 'deleteConversation' | 'renameConversation' | 'saveConversationMessage'>;
  } = {},
): UseRunnerConversations {
  const bridge = useMemo(() => getBridge(), [getBridge]);

  const [conversations, setConversations] = useState<readonly WorkspaceConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paneKey, setPaneKey] = useState('new');
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const activeIdRef = useRef<string | null>(null);
  /** Message ids already saved, keyed by conversation — without this every delta would re-save the
   *  whole settled transcript, since the callback fires on each one and the settled prefix only grows. */
  const writtenRef = useRef<Map<string, Set<string>>>(new Map());
  /** Guards `select`/`create` against a slower one resolving after a faster, later one already won. */
  const switchSeqRef = useRef(0);
  /** In-flight lazy conversation creation, so concurrent deltas before it resolves adopt ONE conversation, not many. */
  const adoptingRef = useRef<Promise<string | null> | null>(null);
  /** Bumped whenever an in-flight adoption stops belonging to the pane that started it (a `select`/
   *  `create`/`remove` since). An adoption re-checks this before publishing `activeId`. */
  const adoptionGenRef = useRef(0);
  /** Makes each fresh, nothing-selected pane key distinct — `paneKey: 'new'` alone would fail to
   *  remount a pane that had lazily adopted (and is now having that same conversation deleted). */
  const paneNonceRef = useRef(0);
  /** Mirrors the last `conversations` this hook committed, for `remove`'s fallback when its own
   *  `refresh()` lands stale — see `refresh`'s own note. */
  const conversationsRef = useRef<readonly WorkspaceConversationSummary[]>([]);
  /** Conversations this hook deleted. The store refuses writes to them, so a message the old pane
   *  settles before `remove`'s follow-up `select` lands is dropped with the thread it belonged to. */
  const deletedRef = useRef(new Set<string>());
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const resetAdoption = useCallback(() => {
    adoptingRef.current = null;
    adoptionGenRef.current += 1;
  }, []);

  const refresh = useCallback(async (): Promise<readonly WorkspaceConversationSummary[]> => {
    if (bridge === undefined) return conversationsRef.current;
    try {
      const list = await bridge.listConversations();
      setConversations(list);
      return list;
    } catch (err) {
      console.error('tovu-runner: could not load fleet chat conversations —', err);
      return conversationsRef.current;
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commitActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const select = useCallback(
    (id: string) => {
      if (bridge === undefined) return;
      switchSeqRef.current++;
      const seq = switchSeqRef.current;
      const commit = (messages: ChatMessage[]) => {
        // A slower load for a conversation the operator has since navigated away from must not land.
        if (switchSeqRef.current !== seq) return;
        writtenRef.current.set(id, new Set(messages.map((m) => m.id)));
        setInitialMessages(messages);
        commitActive(id);
        // A deliberate switch is exactly when remounting the pane IS the intent.
        setPaneKey(id);
        resetAdoption();
      };
      void bridge
        .loadConversationMessages(id)
        .then(commit)
        // A failed load still switches, to an empty pane — leaving the operator on the previous
        // conversation while the switcher already says otherwise is the worse of the two failures.
        .catch((err) => {
          console.error(`tovu-runner: could not load fleet chat conversation ${id} —`, err);
          commit([]);
        });
    },
    [bridge, commitActive, resetAdoption],
  );

  const create = useCallback(async () => {
    if (bridge === undefined) return;
    // Claimed BEFORE the request and re-checked after, so a selection made after the click (while
    // the create is still in flight) wins rather than yanking the operator back into a new, empty
    // pane the moment the slower create resolves.
    switchSeqRef.current++;
    const seq = switchSeqRef.current;
    const conversation = await bridge.createConversation();
    setConversations((current) => [conversation, ...current]);
    if (switchSeqRef.current !== seq) return;
    commitActive(conversation.id);
    setInitialMessages([]);
    setPaneKey(conversation.id);
    writtenRef.current.set(conversation.id, new Set());
    resetAdoption();
  }, [bridge, commitActive, resetAdoption]);

  const remove = useCallback(
    async (id: string) => {
      if (bridge === undefined) return;
      await bridge.deleteConversation(id);
      writtenRef.current.delete(id);
      deletedRef.current.add(id);
      // The delete succeeded, so the thread leaves the switcher now — and is filtered out of what
      // `refresh` returns, whose failure fallback is the list still on screen (deleted row included).
      setConversations((current) => current.filter((c) => c.id !== id));
      const list = (await refresh()).filter((c) => c.id !== id);
      if (activeIdRef.current !== id) return;
      const next = list[0]?.id ?? null;
      if (next === null) {
        // Nothing left to land on. Bump the token so a switch already in flight cannot resurrect a
        // transcript into what is about to become an empty pane.
        switchSeqRef.current += 1;
        commitActive(null);
        setInitialMessages([]);
        paneNonceRef.current += 1;
        setPaneKey(`new-${paneNonceRef.current}`);
        // This is the one place `activeId` goes back to `null`, which is the only state that
        // re-enters the lazy-adoption path below — without this reset, the fresh pane would
        // inherit the deleted conversation's adoption and never persist again.
        resetAdoption();
        return;
      }
      // `select`, deliberately, not a raw `setActiveId(next)` — see `select`'s own doc: only
      // `select` publishes id, transcript and written-ids together, in the order that keeps a
      // remount from ever showing an empty pane under a non-empty switcher entry.
      select(next);
    },
    [bridge, refresh, commitActive, resetAdoption, select],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      if (bridge === undefined) return;
      // Optimistic: a rename that only appears after a round trip feels broken mid-edit.
      setConversations((current) => current.map((c) => (c.id === id ? { ...c, title } : c)));
      try {
        await bridge.renameConversation({ id, title });
      } catch (err) {
        console.error(`tovu-runner: could not rename fleet chat conversation ${id} —`, err);
      }
      void refresh();
    },
    [bridge, refresh],
  );

  /** Writes whatever in `messages` has settled and is not already stored, into `conversationId`. */
  const flush = useCallback(
    (conversationId: string, messages: ChatMessage[]) => {
      if (bridge === undefined || deletedRef.current.has(conversationId)) return;
      // Always registered by now: every id that can reach here got its set when it became flushable
      // — `select`'s commit, `create` and lazy adoption each register one before `activeId` (or the
      // adoption's own flush) can name it — and `remove` drops a set only after marking the id
      // deleted, which the guard above returns on first. (This used to fall back to a fresh set,
      // which no path could reach.)
      const written = writtenRef.current.get(conversationId) as Set<string>;
      const pending = persistableMessages(messages).filter((m) => !written.has(m.id));
      if (pending.length === 0) return;
      // Marked before the request resolves so a second `onMessagesChange` arriving mid-flight —
      // which it will, since deltas keep coming — does not queue the same message twice.
      for (const message of pending) written.add(message.id);
      for (const message of pending) {
        void bridge.saveConversationMessage({ conversationId, message }).catch((err) => {
          console.error('tovu-runner: could not persist a fleet chat message —', err);
          // Un-marked so a later delta gets one more chance, rather than a single failed write
          // silently dropping this message from the durable transcript forever.
          written.delete(message.id);
        });
      }
      // The first turn is what gives an untitled conversation its auto-generated title, and every
      // turn changes `messageCount`/`updatedAt` — re-read rather than patch, so the switcher stays
      // honest without this hook re-deriving the store's own title/ordering rules.
      void refresh();
    },
    [bridge, refresh],
  );

  const onMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      const conversationId = activeIdRef.current;
      if (conversationId !== null) {
        flush(conversationId, messages);
        return;
      }

      // No conversation is active — the DEFAULT state, not an edge case: nothing selects one on
      // mount, so typing straight into a freshly opened fleet chat (without first clicking "New" or
      // picking from history) lands here. Adopt one lazily, at the first moment there is actually
      // something worth saving, rather than littering the switcher with an empty row per app open.
      if (bridge === undefined || persistableMessages(messages).length === 0) return;

      const generation = adoptionGenRef.current;
      // Claimed only if nothing is already in flight, so two deltas arriving before the create
      // resolves await the SAME creation, not two. (Not `adoptingRef.current ??= …` — Biome's
      // `noAssignInExpressions` refuses an assignment inside the expression that reads it back.)
      if (adoptingRef.current === null) {
        adoptingRef.current = bridge
          .createConversation()
          .then((conversation) => {
            setConversations((current) => [conversation, ...current]);
            writtenRef.current.set(conversation.id, new Set());
            // Superseded: the row exists and shows up in the switcher, but the pane that asked for
            // it is gone (the operator switched away while this was in flight) — pointing
            // `activeId` at it now would route the NEXT pane's writes here. The flush below still
            // runs regardless: these messages came from the pane that asked for this conversation,
            // and dropping them would be exactly the data loss lazy adoption exists to prevent.
            if (adoptionGenRef.current === generation) commitActive(conversation.id);
            return conversation.id;
          })
          .catch((err) => {
            console.error('tovu-runner: could not create a fleet chat conversation —', err);
            return null;
          });
      }
      const adoption = adoptingRef.current;

      void adoption.then((id) => {
        if (id === null) {
          // Cleared so a later turn can retry — leaving a rejected promise in place would wedge
          // persistence for the rest of the session.
          if (adoptingRef.current === adoption) adoptingRef.current = null;
          return;
        }
        flush(id, messages);
      });
    },
    [bridge, flush, commitActive],
  );

  return { conversations, activeId, paneKey, initialMessages, select, create, remove, rename, onMessagesChange };
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
