import { useState } from "react";
import { createAssistantChatsClient } from "@jini-ai/chat/react";
import { useAssistantChats, type UseAssistantChats } from "@jini-ai/admin/shell/hooks/use-assistant-chats.hooks";
import { HttpError } from "../lib/assistant-chats";
import { createAssistantLastConversationStore, defaultAssistantChatsPort } from "./assistant-chats-dependencies.hooks";

/** The chat client bound to the host's `HttpError` and `[admin]` reporter; exported so tests drive the real client. */
export const assistantChatsClient = createAssistantChatsClient({ ports: {
  statusOf: ({ error }) => error instanceof HttpError ? error.status : undefined,
  sleep: ({ delayMs }) => new Promise(resolve => setTimeout(resolve, delayMs)),
  reportPermanent: ({ conversationId, messageId, error }) => console.error("[admin] message permanently rejected, not persisted", { conversationId, messageId, error }),
  requestRunPrefixes: ["byok:", "agui:"],
} }, {});

/**
 * Binds the real `/api/assistant/chats` client — see `apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts`.
 *
 * The wired half of the `useX(dependencies)` / `useWiredX()` pair, so a component composes this and
 * a test composes `useAssistantChats` with a fake. Deliberately free of logic of its own —
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
  return useAssistantChats({ port: defaultAssistantChatsPort, client: assistantChatsClient, lastConversation });
}
