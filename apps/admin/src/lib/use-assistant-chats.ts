import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@jini-ai/chat-core";

import {
  createConversation,
  deleteConversation,
  listConversations,
  loadMessages,
  persistableMessages,
  renameConversation,
  saveMessage,
  type AssistantConversation,
} from "./assistant-chats";

/**
 * @file Owns the admin assistant's conversation state: which chat is open, what is in it, and what
 * has already been written.
 *
 * `ChatPane` is deliberately left as the uncontrolled component it already is — it takes
 * `initialMessages` and a `conversationId` and manages the live transcript itself. This hook only
 * supplies those two props and listens to `onMessagesChange`, which is why switching conversations
 * remounts the pane via its `key` rather than trying to push new messages into a running one.
 */
export interface UseAssistantChats {
  conversations: AssistantConversation[];
  activeId: string | null;
  /** Messages to seed the pane with. Changes identity only on a real conversation switch. */
  initialMessages: ChatMessage[];
  select: (id: string) => void;
  create: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  onMessagesChange: (messages: ChatMessage[]) => void;
}

export function useAssistantChats(): UseAssistantChats {
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  /**
   * Message ids already written, keyed by conversation.
   *
   * Without this, every `onMessagesChange` would re-`PUT` the entire settled transcript — the
   * callback fires on each delta, and the settled prefix only grows. Keyed by conversation so
   * switching away and back does not resurrect stale ids.
   */
  const writtenRef = useRef<Map<string, Set<string>>>(new Map());
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  /**
   * Monotonic token identifying the most recent switch intent.
   *
   * `activeId` cannot serve as the staleness guard any more, because `select` now resolves the
   * transcript *before* publishing the id (see below) — at the moment a load returns, `activeId`
   * still names the previous conversation. Every switch-initiating path bumps this and then
   * verifies it is still the newest before committing.
   */
  const switchSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const next = await listConversations().catch(() => []);
    setConversations(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Publishes `activeId` and `initialMessages` in one commit, and only once the transcript is in
   * hand.
   *
   * Setting `activeId` first is what the obvious version does, and it is wrong in a way that is
   * invisible in tests: `activeId` is `ChatPane`'s `key`, so assigning it remounts the pane
   * *immediately*, while `initialMessages` still holds the conversation being navigated away from.
   * `ChatPane` reads `initialMessages` at mount only, so the fresh transcript — arriving a tick
   * later — was silently discarded and the pane displayed the previous chat's messages under the
   * new chat's title.
   *
   * The display fault was the mild half. The pane then reported that stale transcript through
   * `onMessagesChange`, and because `writtenRef` for the newly selected conversation was still
   * empty, every one of those messages was queued as an unsaved message *belonging to the new
   * conversation*. Observed live: selecting an empty chat fired four `PUT`s carrying the previous
   * chat's messages. They 404'd only because those message ids already existed under their real
   * conversation — an accident of the primary key, not a safeguard. Seeding `writtenRef` in the
   * same commit as the id is what actually closes that hole.
   *
   * React batches both setters (and the ref write precedes them), so the pane remounts exactly
   * once, already knowing what it holds and what has been persisted.
   */
  const select = useCallback((id: string) => {
    const seq = ++switchSeqRef.current;
    const commit = (messages: ChatMessage[]) => {
      // A slower load for a conversation the user has since navigated away from must not land.
      if (switchSeqRef.current !== seq) return;
      writtenRef.current.set(id, new Set(messages.map((m) => m.id)));
      setInitialMessages(messages);
      setActiveId(id);
    };
    void loadMessages(id)
      .then(commit)
      // A failed load still switches, to an empty pane: leaving the user on the previous
      // conversation while its title says otherwise is the worse of the two failures.
      .catch(() => commit([]));
  }, []);

  const create = useCallback(async () => {
    const conversation = await createConversation();
    // Same guard as `select`, in the other direction: a switch still in flight when "New" is
    // clicked would otherwise resolve afterwards and drop its transcript into the new empty chat.
    switchSeqRef.current += 1;
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setInitialMessages([]);
    writtenRef.current.set(conversation.id, new Set());
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      writtenRef.current.delete(id);
      const remaining = await refresh();
      if (activeIdRef.current !== id) return;
      // Land on the next most recent chat rather than an empty pane with no way back.
      const next = remaining[0]?.id ?? null;
      setActiveId(next);
      setInitialMessages([]);
      if (next) select(next);
    },
    [refresh, select],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      // Optimistic: a rename that only appears after a round-trip feels broken during the edit.
      setConversations((current) =>
        current.map((c) => (c.id === id ? { ...c, title, titleSource: "manual" as const } : c)),
      );
      await renameConversation(id, title).catch(() => undefined);
      void refresh();
    },
    [refresh],
  );

  const onMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      const conversationId = activeIdRef.current;
      if (!conversationId) return;
      const written = writtenRef.current.get(conversationId) ?? new Set<string>();
      writtenRef.current.set(conversationId, written);

      const pending = persistableMessages(messages).filter((m) => !written.has(m.id));
      if (pending.length === 0) return;

      // Marked before the request resolves so a second `onMessagesChange` arriving mid-flight —
      // which it will, since deltas keep coming — does not queue the same message twice.
      for (const message of pending) written.add(message.id);

      void Promise.all(pending.map((message) => saveMessage(conversationId, message)))
        .then(() => {
          // The first turn is what gives an untitled chat its name server-side, and it changes
          // `messageCount` on every turn, so the list needs re-reading rather than patching.
          void refresh();
        })
        .catch(() => {
          // A failed write must not be remembered as written, or it can never be retried.
          for (const message of pending) written.delete(message.id);
        });
    },
    [refresh],
  );

  return { conversations, activeId, initialMessages, select, create, remove, rename, onMessagesChange };
}
