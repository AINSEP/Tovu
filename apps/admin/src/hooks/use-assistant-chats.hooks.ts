import { useMemo, useState } from "react";
import { createAssistantChatsClient, type LastConversationStore, type AssistantChatsPort as SharedPort } from "@jini-ai/chat/react";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { AssistantChatsPort } from "./assistant-chats-port.hooks";
import { HttpError, type AssistantConversation } from "../lib/assistant-chats";
import { createAssistantLastConversationStore, defaultAssistantChatsPort } from "./assistant-chats-dependencies.hooks";
export interface UseAssistantChats {
  conversations: AssistantConversation[];
  activeId: string | null;
  /**
   * `ChatPane`'s `key`. Deliberately NOT `activeId`.
   *
   * Remounting the pane is correct for a user-initiated switch and destructive at any other time: it
   * re-seeds from `initialMessages` and discards whatever the pane currently holds. `activeId` now
   * also changes when an untitled pane silently adopts a freshly created conversation mid-run (see
   * `onMessagesChange`), and re-keying on that would wipe the reply being streamed. So the two are
   * separate: this changes only on `select`/`create`/`remove`, `activeId` tracks where writes go.
   */
  paneKey: string;
  /** Messages to seed the pane with. Changes identity only on a real conversation switch. */
  initialMessages: ChatMessage[];
  select: (id: string) => void;
  create: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  onMessagesChange: (messages: ChatMessage[]) => void;
  /**
   * This pane's conversation id, adopting one if none is active yet. Awaited by
   * `assistant-transport.ts`'s `startRun` so turn 1's run carries the identity its agent-CLI session
   * id gets filed under — see the hook's own implementation doc for the amnesia defect that needs it.
   * Resolves `null` (never rejects) when creation fails.
   */
  ensureConversationId: () => Promise<string | null>;
  /**
   * Writes one user turn durably, awaited by `assistant-transport.ts`'s `startRun` BEFORE it
   * dispatches the run — see the implementation's own doc for the defect (a failed run's user
   * message reaching no agent and no later prompt). Never rejects; a failed write releases the id
   * so the delta-driven `flush` can still pick it up.
   */
  persistUserTurn: (conversationId: string, message: ChatMessage) => Promise<void>;
}


const client = createAssistantChatsClient({ ports: {
  statusOf: ({ error }) => error instanceof HttpError ? error.status : undefined,
  sleep: ({ delayMs }) => new Promise(resolve => setTimeout(resolve, delayMs)),
  reportPermanent: ({ conversationId, messageId, error }) => console.error("[admin] message permanently rejected, not persisted", { conversationId, messageId, error }),
  requestRunPrefixes: ["byok:", "agui:"],
} }, {});

/** Adapt the existing host port; Jini owns all conversation state and retry behavior. */
function sharedPort(port: AssistantChatsPort): SharedPort {
  return {
    listConversations: () => port.listConversations(),
    createConversation: ({ firstMessage }) => firstMessage === undefined ? port.createConversation() : port.createConversation(firstMessage),
    renameConversation: ({ id, title }) => port.renameConversation(id, title),
    deleteConversation: ({ id }) => port.deleteConversation(id),
    loadMessages: ({ conversationId }) => port.loadMessages(conversationId),
    saveMessage: ({ conversationId, message }) => port.saveMessage(conversationId, message),
  };
}
export function giveUpOutcome(error: unknown) { return client.giveUpOutcome({ error }, {}); }
export function handleSaveFailure(error: unknown, conversationId: string, message: ChatMessage, attempt: number, isDisposed: () => boolean) { return client.handleSaveFailure({ error, conversationId, message, attempt, isDisposed }, {}); }
export function attemptSave(port: AssistantChatsPort, conversationId: string, message: ChatMessage, attempt: number, isDisposed: () => boolean) { return client.attemptSave({ port: sharedPort(port), conversationId, message, attempt, isDisposed }, {}); }
export function summarizeFlushOutcomes(results: Parameters<typeof client.summarizeFlushOutcomes>[0]["results"], isConversationStillActive: boolean) { return client.summarizeFlushOutcomes({ results, isConversationStillActive }, {}); }
export function resolveRememberedConversation(required: Parameters<typeof client.resolveRememberedConversation>[0]) { return client.resolveRememberedConversation(required, {}); }
export function useAssistantChats(port: AssistantChatsPort, options: { lastConversation?: LastConversationStore } = {}): UseAssistantChats {
  const chats = client.useAssistantChats({ port: sharedPort(port) }, options);
  // Keep existing component callbacks stable while Jini's boundary uses object-shaped calls.
  const actions = useMemo(() => ({
    select: (id: string) => chats.select({ id }, {}),
    create: () => chats.create({}, {}),
    remove: (id: string) => chats.remove({ id }, {}),
    rename: (id: string, title: string) => chats.rename({ id, title }, {}),
    onMessagesChange: (messages: ChatMessage[]) => chats.onMessagesChange({ messages }, {}),
    ensureConversationId: () => chats.ensureConversationId({}, {}),
    persistUserTurn: (conversationId: string, message: ChatMessage) => chats.persistUserTurn({ conversationId, message }, {}),
  }), [chats.select, chats.create, chats.remove, chats.rename, chats.onMessagesChange, chats.ensureConversationId, chats.persistUserTurn]);
  return { ...chats, ...actions };
}

/**
 * Binds the real `/api/assistant/chats` client — see `assistant-chats-dependencies.ts`.
 *
 * The wired half of the `useX(dependencies)` / `useWiredX()` pair, so a component composes this and
 * a test composes {@link useAssistantChats} with a fake. Deliberately free of logic of its own —
 * it only binds the real port and the real last-conversation store for the signed-in user:
 * anything that lived here would be untestable by construction, since the whole point of this
 * function is that it is the part nobody injects.
 */
export function useWiredAssistantChats(
  { principalId }: {
    /** The signed-in admin. Scopes the remembered last conversation to this workspace and user, so
     *  someone else signing in on the same browser never lands in this user's chat. Omitted, no
     *  conversation is remembered. */
    principalId?: string;
  } = {},
): UseAssistantChats {
  // A state initializer, not a memo: `useAssistantChats` captures the store once at mount anyway.
  const [lastConversation] = useState(() =>
    principalId ? createAssistantLastConversationStore({ principalId }) : undefined,
  );
  return useAssistantChats(defaultAssistantChatsPort, { lastConversation });
}
