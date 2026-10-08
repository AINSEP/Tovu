import type { ChatMessage } from "@jini-ai/chat/core";
import * as sharedMessages from "@jini-ai/chat/transports/http";
import { ApiError, authenticatedAdminRequest, type AuthenticatedAdminRequestOptions } from "./api";

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

const CHAT_REQUEST_OPTIONS: AuthenticatedAdminRequestOptions = {
  basePath: "/api/assistant/chats",
  requireJson: true,
  errorFactory: ({ response, error }) => new HttpError(response.status, response.statusText, { code: error.code, body: error.body }),
};

export type { AssistantConversation } from "@jini-ai/chat/transports/http";
import type { AssistantConversation } from "@jini-ai/chat/transports/http";

/**
 * A non-2xx response, carrying the status code rather than only rendering it into a message.
 *
 * `useAssistantChats`'s write retry needs that distinction and nothing else does: a 503 or a 429 is
 * worth another attempt, a 400 or a 404 never will be. The previous bare
 * `Error(`${status} ${statusText}`)` forced any caller that cared to parse the number back out of
 * the string, which is the kind of thing that keeps working until someone changes the wording.
 */
export class HttpError extends ApiError {
  constructor(status: number, statusText: string, { code, body }: { code?: string; body?: Record<string, unknown> } = {}) {
    super(`${status} ${statusText}`, status, code, body);
    this.name = "HttpError";
  }
}

export async function listConversations(): Promise<AssistantConversation[]> {
  const { conversations } = await authenticatedAdminRequest<{ conversations: AssistantConversation[] }>(
    { path: "", method: "GET" }, CHAT_REQUEST_OPTIONS,
  );
  /*
   * Coerced, not trusted. The transport only guarantees the body parsed — not that it has the shape the
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
  const { conversation } = await authenticatedAdminRequest<{ conversation: AssistantConversation }>(
    { path: "", method: "POST", body: firstMessage === undefined ? {} : { firstMessage } }, CHAT_REQUEST_OPTIONS,
  );
  return conversation;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await authenticatedAdminRequest(
    { path: `/${encodeURIComponent(id)}`, method: "PATCH", body: { title } }, CHAT_REQUEST_OPTIONS,
  );
}

export async function deleteConversation(id: string): Promise<void> {
  await authenticatedAdminRequest(
    { path: `/${encodeURIComponent(id)}`, method: "DELETE" }, { ...CHAT_REQUEST_OPTIONS, requireJson: false },
  );
}

export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  const { messages } = await authenticatedAdminRequest<{ messages: ChatMessage[] }>(
    { path: `/${encodeURIComponent(conversationId)}/messages`, method: "GET" }, CHAT_REQUEST_OPTIONS,
  );
  // Same coercion, same reason as `listConversations` above: this feeds `ChatPane`'s
  // `initialMessages`, and an `undefined` transcript is not a state any consumer is typed for.
  return Array.isArray(messages) ? messages : [];
}

export async function saveMessage(conversationId: string, message: ChatMessage): Promise<void> {
  await authenticatedAdminRequest(
    { path: `/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}`, method: "PUT", body: message },
    CHAT_REQUEST_OPTIONS,
  );
}
/** Compatibility adapter; shared message selection is owned by Jini. */
export function persistableMessages(messages: ChatMessage[]): ChatMessage[]  { return sharedMessages.persistableMessages({ messages }, {}); }
/** Compatibility adapter; shared message selection is owned by Jini. */
export function messageWriteKey(message: Pick<ChatMessage, "id" | "runId">): string  { return sharedMessages.messageWriteKey({ message }, {}); }
/** Compatibility adapter; shared message selection is owned by Jini. */
export function activeRunStub(messages: ChatMessage[]): ChatMessage | null  { return sharedMessages.activeRunStub({ messages }, {}); }
