import { isTerminalRunStatus, type ChatMessage } from "@jini-ai/chat-core";

/**
 * @file The admin's client for `/api/assistant/chats` — the browser half of durable transcripts.
 *
 * The interesting decision here is *when* to write. `ChatPane` calls `onMessagesChange` on every
 * streamed delta, and persisting each one would mean a database write per token: Open Design does
 * the equivalent (a full read-modify-write of the whole events array per token) and it is O(n) per
 * token on a transcript that only grows. {@link persistableMessages} instead selects the messages
 * that have reached a settled state — every user turn, and assistant turns whose run has finished
 * — so a streaming reply is written once, when it is done.
 *
 * The cost of that choice, stated plainly: if the browser dies mid-stream the partial assistant
 * reply is lost. That is the right trade for now because the run itself is server-side and can be
 * re-read; it stops being the right trade the moment the transcript becomes the only record, at
 * which point the daemon should persist as it streams rather than the browser persisting at all.
 */

const BASE = "/api/assistant/chats";

export interface AssistantConversation {
  id: string;
  title: string | null;
  titleSource: "fallback" | "generated" | "manual";
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * A non-2xx response, carrying the status code rather than only rendering it into a message.
 *
 * `useAssistantChats`'s write retry needs that distinction and nothing else does: a 503 or a 429 is
 * worth another attempt, a 400 or a 404 never will be. The previous bare
 * `Error(`${status} ${statusText}`)` forced any caller that cared to parse the number back out of
 * the string, which is the kind of thing that keeps working until someone changes the wording.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new HttpError(response.status, response.statusText);
  return (await response.json()) as T;
}

export async function listConversations(): Promise<AssistantConversation[]> {
  const { conversations } = await json<{ conversations: AssistantConversation[] }>(
    await fetch(BASE, { credentials: "same-origin" }),
  );
  /*
   * Coerced, not trusted. `json()` only guarantees the body parsed — not that it has the shape the
   * type annotation claims. A 200 whose body lacks `conversations` returned `undefined` from a
   * function typed `Promise<AssistantConversation[]>`, and `useAssistantChats`'s
   * `.catch(() => [])` does not help: there is no rejection to catch.
   *
   * That `undefined` reached `setConversations`, and `AssistantDock`'s header calls
   * `conversations.find(...)` — which threw and took down the ENTIRE admin, because the dock is
   * mounted once in `App.tsx` outside the routed content and therefore renders on every page. Found
   * as an intermittently failing route test whose real cause was this crash preventing `<main>` from
   * mounting at all.
   */
  return Array.isArray(conversations) ? conversations : [];
}

/** `firstMessage` seeds the local title heuristic; omit it for an untitled empty chat. */
export async function createConversation(firstMessage?: string): Promise<AssistantConversation> {
  const { conversation } = await json<{ conversation: AssistantConversation }>(
    await fetch(BASE, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(firstMessage === undefined ? {} : { firstMessage }),
    }),
  );
  return conversation;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await json(
    await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) throw new HttpError(response.status, response.statusText);
}

export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  const { messages } = await json<{ messages: ChatMessage[] }>(
    await fetch(`${BASE}/${encodeURIComponent(conversationId)}/messages`, { credentials: "same-origin" }),
  );
  // Same coercion, same reason as `listConversations` above: this feeds `ChatPane`'s
  // `initialMessages`, and an `undefined` transcript is not a state any consumer is typed for.
  return Array.isArray(messages) ? messages : [];
}

export async function saveMessage(conversationId: string, message: ChatMessage): Promise<void> {
  await json(
    await fetch(
      `${BASE}/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}`,
      {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      },
    ),
  );
}

/**
 * The subset of a live transcript that is worth writing: user turns, and assistant turns whose run
 * has reached a terminal status.
 *
 * An assistant message that is still `queued` or `running` is rewritten on every delta, so
 * persisting it would turn one reply into hundreds of writes for a row that is about to be
 * replaced anyway.
 */
export function persistableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message) => message.role === "user" || isTerminalRunStatus(message.runStatus),
  );
}
