/**
 * @file The desktop chat's ONE conversation store (SPEC-051 REQ-18): app-level, independent of
 * every site's own `/api/assistant/chats`. Backs the six `workspace:conversations:*` channels the
 * pane's `useRunnerConversations` already calls.
 *
 * A single JSON file under the app's userData, written atomically through `durable-json-file.ts`.
 * The spec names "the app-level sqlite store"; no such store was ever ported from Tovu-Runner, and a
 * JSON file is the smallest thing that persists across restarts with the exact contract shape —
 * swapping it for sqlite later changes only this module (the `ConversationStore` port is the seam).
 */
import type { ChatMessage } from "@jini-ai/chat/core";
import type { WorkspaceConversationSummary } from "./contracts/workspace-conversations.ts";
import { readJsonFile, writeJsonFileAtomic } from "./durable-json-file.ts";

interface StoredConversation {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface ConversationStore {
  list(): WorkspaceConversationSummary[];
  create(): WorkspaceConversationSummary;
  rename(required: { id: string; title: string }): void;
  remove(required: { id: string }): void;
  loadMessages(required: { conversationId: string }): ChatMessage[];
  /** Upsert by `message.id` — the pane re-saves a message as it settles, never duplicates it. */
  saveMessage(required: { conversationId: string; message: ChatMessage }): void;
}

/** File ports, injected so the store is testable against a temp dir or an in-memory fake. */
interface ConversationStorePorts {
  read: (filePath: string) => ReturnType<typeof readJsonFile>;
  write: (filePath: string, value: unknown) => void;
  now: () => number;
  newId: () => string;
}

/** Summary row for one conversation. Pure. @complexity O(1). */
function summarize(conversation: StoredConversation): WorkspaceConversationSummary {
  const { id, title, createdAt, updatedAt } = conversation;
  return { id, title, messageCount: conversation.messages.length, createdAt, updatedAt };
}

/**
 * A title from the first user message, so the list is readable without a rename. Pure.
 * @complexity O(n) in the message's text length.
 */
function titleFrom(message: ChatMessage): string | null {
  if (message.role !== "user") return null;
  const firstLine = message.content.trim().split("\n")[0] ?? "";
  return firstLine === "" ? null : firstLine.slice(0, 60);
}

/**
 * Builds the store over one file.
 * @param required `filePath` — the JSON file (created on first write).
 * @param optional ports; defaults are the real filesystem and clock.
 * @complexity each call is O(n) in the stored conversations (the whole file is read and rewritten);
 *   fine at one operator's chat history, and the reason this is a JSON file only until it isn't.
 */
function createConversationStore(
  required: { filePath: string },
  optional: Partial<ConversationStorePorts> = {},
): ConversationStore {
  const ports: ConversationStorePorts = {
    read: readJsonFile,
    write: writeJsonFileAtomic,
    now: Date.now,
    newId: () => crypto.randomUUID(),
    ...optional,
  };
  const load = (): StoredConversation[] => {
    const read = ports.read(required.filePath);
    if (read.state !== "ok") return [];
    const rows = (read.value as { conversations?: unknown } | null)?.conversations;
    return Array.isArray(rows) ? (rows as StoredConversation[]) : [];
  };
  const save = (rows: StoredConversation[]) => ports.write(required.filePath, { conversations: rows });
  const mutate = (id: string, change: (row: StoredConversation) => void) => {
    const rows = load();
    const row = rows.find((candidate) => candidate.id === id);
    if (row === undefined) throw new Error(`Conversation ${id} does not exist.`);
    change(row);
    row.updatedAt = ports.now();
    save(rows);
  };

  return {
    list: () => load().map(summarize).sort((a, b) => b.updatedAt - a.updatedAt),
    create: () => {
      const now = ports.now();
      const row: StoredConversation = { id: ports.newId(), title: null, createdAt: now, updatedAt: now, messages: [] };
      save([...load(), row]);
      return summarize(row);
    },
    rename: ({ id, title }) => mutate(id, (row) => { row.title = title; }),
    remove: ({ id }) => save(load().filter((row) => row.id !== id)),
    loadMessages: ({ conversationId }) => load().find((row) => row.id === conversationId)?.messages ?? [],
    saveMessage: ({ conversationId, message }) => mutate(conversationId, (row) => {
      const index = row.messages.findIndex((existing) => existing.id === message.id);
      if (index === -1) row.messages.push(message);
      else row.messages[index] = message;
      row.title ??= titleFrom(message);
    }),
  };
}

export { createConversationStore, titleFrom };
export type { ConversationStore, ConversationStorePorts, StoredConversation };
