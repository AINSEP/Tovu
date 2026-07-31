import { deriveConversationTitle, type ChatMessage } from "@jini-ai/chat-core";

import {
  createConversation,
  deleteConversation,
  HttpError,
  listConversations,
  loadMessages,
  renameConversation,
  saveMessage,
  type AssistantConversation,
} from "../lib/assistant-chats";
import type { AssistantChatsPort } from "./assistant-chats-port.hooks";

/**
 * @file The only place the real `/api/assistant/chats` client is reached from the hook layer.
 *
 * Keeping that import in exactly one file is the point of the split — it is what makes "does this
 * hook talk to the network?" answerable by looking at one line rather than by reading the hook.
 */

/**
 * The live implementation, as a module-level singleton.
 *
 * Matches `@jini-ai/ui`'s `defaultHtmlViewerDependencies`: one instance, so every wired hook in a
 * tree binds to the same object rather than each constructing its own.
 *
 * It is NOT what makes the hook safe. An earlier version of this comment claimed the singleton was
 * load-bearing because `port` sat in every `useCallback`'s dependency list — true at the time, and a
 * bad design: it made referential stability an unenforceable contract that the most natural way of
 * writing an injection (`() => useAssistantChats(createFakeAssistantChatsPort())`) violates, with an
 * infinite render loop as the penalty. `useAssistantChats` now reads its port through a ref and
 * depends on nothing, so an unstable port is merely unusual rather than fatal.
 */
export const defaultAssistantChatsPort: AssistantChatsPort = {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  loadMessages,
  saveMessage,
};

/** Seed state for {@link createFakeAssistantChatsPort}. */
export interface FakeAssistantChatsPortOptions {
  conversations?: AssistantConversation[];
  messages?: Record<string, ChatMessage[]>;
  /**
   * Called for every `saveMessage`, before the fake records it. Throw to simulate a failed write —
   * an `HttpError` for a server response, anything else for a transport failure. The call count is
   * how a test asserts that a retry actually happened.
   */
  onSaveMessage?: (conversationId: string, message: ChatMessage, attempt: number) => void;
}

/**
 * An in-memory {@link AssistantChatsPort} for tests and demos.
 *
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule. What it buys
 * over stubbing `fetch`: a test can describe the *failure* it wants ("the third write throws a 503")
 * instead of assembling a `Response` with the right status and hoping the client maps it the way it
 * is assumed to.
 *
 * Every conversation id is `fake-1`, `fake-2`, … in creation order, so assertions can name one
 * without first reading it back out.
 */
export function createFakeAssistantChatsPort(options: FakeAssistantChatsPortOptions = {}): AssistantChatsPort & {
  /** Every message that was successfully written, keyed by conversation — the durable state. */
  readonly saved: Map<string, ChatMessage[]>;
  /** Total `saveMessage` calls including re-attempts, so a retry is observable. */
  readonly saveAttempts: () => number;
  /**
   * Every message id `saveMessage` was called with, in order and WITH duplicates.
   *
   * A total count cannot distinguish "three messages written once" from "one message written three
   * times", which is precisely the difference between a working retry policy and a message being
   * re-queued forever on every delta.
   */
  readonly attemptedIds: () => string[];
} {
  const conversations = [...(options.conversations ?? [])];
  const messages = new Map<string, ChatMessage[]>(Object.entries(options.messages ?? {}));
  const saved = new Map<string, ChatMessage[]>();
  let created = 0;
  let attempts = 0;
  const attemptedIds: string[] = [];

  return {
    saved,
    saveAttempts: () => attempts,
    attemptedIds: () => [...attemptedIds],

    async listConversations() {
      return [...conversations];
    },

    async createConversation(firstMessage?: string) {
      created += 1;
      const conversation: AssistantConversation = {
        id: `fake-${created}`,
        // Same derivation the real POST route uses, so the fake cannot disagree with production
        // about what counts as a title. Note this path is unused by the hook: both `create()` and
        // lazy adoption call with no `firstMessage`, which is exactly why append-time naming
        // (in `saveMessage` below) is the mechanism that actually matters here.
        title: firstMessage ? deriveConversationTitle(firstMessage) || null : null,
        titleSource: "fallback",
        messageCount: 0,
        createdAt: created,
        updatedAt: created,
      };
      conversations.unshift(conversation);
      return conversation;
    },

    async renameConversation(id: string, title: string) {
      const index = conversations.findIndex((c) => c.id === id);
      if (index >= 0) conversations[index] = { ...conversations[index]!, title, titleSource: "manual" };
    },

    async deleteConversation(id: string) {
      const index = conversations.findIndex((c) => c.id === id);
      if (index >= 0) conversations.splice(index, 1);
      messages.delete(id);
      saved.delete(id);
    },

    /**
     * The transcript, in the order the real store would return it.
     *
     * `messages` is the single source of truth here — seeded entries and everything written since,
     * one ordered list. An earlier version kept writes in a separate `saved` map and concatenated
     * the two at read time, which got both halves wrong: reading only the seed made the fake
     * read-after-write incoherent (save `m1`, reselect, get an empty transcript — something the real
     * port never does), and concatenating moved an UPDATED message to the end. The server orders by
     * `position`, assigned once on first insert, so re-writing `m1` leaves it first; the fake
     * returned `[m2, m1]` and a reselected pane came back with its transcript reordered.
     */
    async loadMessages(conversationId: string) {
      return [...(messages.get(conversationId) ?? [])];
    },

    async saveMessage(conversationId: string, message: ChatMessage) {
      attempts += 1;
      attemptedIds.push(message.id);
      /*
       * Rejects a write to a conversation that does not exist, the way the real route does — it
       * answers 404 when the store cannot find the row for this caller.
       *
       * The permissive version made this fake strictly weaker than production in the one place it
       * mattered: writing to a deleted conversation SUCCEEDED here, so a test could not distinguish
       * "landed on a live conversation" from "landed on a dead one", and an external review found a
       * real `remove()` race that this fake was actively hiding.
       */
      const index = conversations.findIndex((conversation) => conversation.id === conversationId);
      if (index < 0) throw new HttpError(404, "Not Found");
      // Before recording, so a throwing hook leaves the fake's durable state untouched — which is
      // exactly what a real failed `PUT` does, and what makes "was it actually persisted?" a
      // meaningful question to ask this fake afterwards.
      options.onSaveMessage?.(conversationId, message, attempts);

      // Upsert IN PLACE, preserving first-insert order — see `loadMessages`.
      const existing = messages.get(conversationId) ?? [];
      const at = existing.findIndex((m) => m.id === message.id);
      messages.set(
        conversationId,
        at >= 0 ? [...existing.slice(0, at), message, ...existing.slice(at + 1)] : [...existing, message],
      );
      const written = saved.get(conversationId) ?? [];
      const writtenAt = written.findIndex((m) => m.id === message.id);
      saved.set(
        conversationId,
        writtenAt >= 0
          ? [...written.slice(0, writtenAt), message, ...written.slice(writtenAt + 1)]
          : [...written, message],
      );

      /*
       * Naming happens on APPEND, mirroring `src/server/modules/assistant-chats.ts` — and this fake
       * has to model it, because it is the ONLY way any conversation this hook creates ever gets a
       * name. Both `create()` and lazy adoption call `createConversation()` with no `firstMessage`,
       * so the create-time seed never fires on any path the hook actually takes. Without this, no
       * test using the fake could observe whether the switcher ever stops saying "Untitled" — a
       * blind spot over the exact mechanism a previous round had to fix a real bug in.
       *
       * Same guard as the route: first USER message only, and only while the title is still empty,
       * so a manual rename is never clobbered. `deriveConversationTitle` is the real thing rather
       * than an approximation, so the fake cannot disagree with production about what a title is.
       */
      const conversation = conversations[index]!;
      if (message.role === "user" && !conversation.title) {
        const derived = deriveConversationTitle(typeof message.content === "string" ? message.content : "");
        if (derived) conversations[index] = { ...conversation, title: derived, titleSource: "fallback" };
      }
      // `messageCount`/`updatedAt` are list-visible after a write on the real route too.
      const current = conversations[index]!;
      conversations[index] = {
        ...current,
        messageCount: at >= 0 ? current.messageCount : current.messageCount + 1,
        updatedAt: current.updatedAt + 1,
      };
    },
  };
}
