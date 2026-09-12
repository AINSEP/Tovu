import { isTerminalRunStatus, type ChatMessage } from "@jini-ai/chat/core";

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
 *
 * A `failed`/`canceled` assistant turn with EMPTY content is kept deliberately, and this is the
 * place a future "stop writing those, they are just noise" change would land — don't (2026-09-11
 * chat-lifecycle repair, Defect 3). The row's `events_json` is the only durable record of why the
 * run died: the daemon's own event log is in-memory and gone with the process, so the stored
 * `"Run failed — the agent process exited without answering"` notice with its exit code and signal
 * is all that survives, and the pane renders it on reload. The real problem those rows caused was
 * being replayed into the NEXT run's prompt as if they were answers, and that is fixed on the read
 * side instead — see `assistant-transport.ts`'s `historyForTranscript`/`isAnsweredAssistantTurn`.
 * Deleting them here would trade a history bug for a forensics hole.
 */
export function persistableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message) => message.role === "user" || isTerminalRunStatus(message.runStatus),
  );
}

/**
 * The one message worth a durable "this run is in flight" stub write — the newest message, if it is
 * a non-terminal assistant turn that has acquired a `runId`. `null` when there is nothing to record.
 *
 * Exists for reattach (2026-09-11 investigation): {@link persistableMessages} above deliberately
 * never durably writes a `queued`/`running` assistant row (this file's own module doc explains why —
 * avoiding a write per streamed token), which means today a run's `runId` exists NOWHERE outside the
 * live browser tab that started it. Reload the tab, switch conversations and back, or lose the tab
 * to a crash mid-run, and the id needed to resume watching that run is gone even though the run
 * itself is still going server-side — there is nothing left for a reattach to find. `useAssistantChats`'s
 * `persistRunStub` calls this once per `onMessagesChange` delta and writes at most once per message
 * id (see that function's own doc), so this adds exactly one extra `PUT` per run, not one per token.
 *
 * Scoped to the LAST message only, not "any non-terminal assistant message anywhere in the array":
 * `useConversation.ts`'s `sendMessage`/`retry` always append the run's assistant placeholder last,
 * so a non-terminal row earlier in the array can only be a stale leftover from an earlier defect or
 * race — recording ITS id as "the current run" would point a future reattach at the wrong turn.
 *
 * `saveMessage`'s server-side route upserts by message id (`ON CONFLICT(id) DO UPDATE`,
 * `Jini/packages/sqlite`'s `chat-history/store.ts`), so this stub write and the message's eventual
 * terminal-state write (through the normal {@link persistableMessages} path) converge on the same
 * row rather than creating two — the terminal write simply overwrites `run_status`/`content`/
 * `events_json` in place once the run settles.
 *
 * @complexity O(1) — reads only the last array element, unlike {@link persistableMessages}'s O(n)
 *   scan, so calling this on every delta alongside the existing `flush` call costs nothing material.
 */
export function activeRunStub(messages: ChatMessage[]): ChatMessage | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant" || last.runId === undefined) return null;
  return isTerminalRunStatus(last.runStatus) ? null : last;
}
