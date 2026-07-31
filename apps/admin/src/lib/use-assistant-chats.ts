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

  const refresh = useCallback(async () => {
    const next = await listConversations().catch(() => []);
    setConversations(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback((id: string) => {
    setActiveId(id);
    void loadMessages(id)
      .then((messages) => {
        // Guard the stale response: a slow load for the conversation the user has already
        // navigated away from must not overwrite the one they are now looking at.
        if (activeIdRef.current !== id) return;
        setInitialMessages(messages);
        writtenRef.current.set(id, new Set(messages.map((m) => m.id)));
      })
      .catch(() => {
        if (activeIdRef.current === id) setInitialMessages([]);
      });
  }, []);

  const create = useCallback(async () => {
    const conversation = await createConversation();
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
