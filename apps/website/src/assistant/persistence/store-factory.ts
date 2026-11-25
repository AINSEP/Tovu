import { type ChatKernel, chatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "@jini-ai/db/kernel/sqlite";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { createChatRunLedger, type ChatRunLedger } from "./run-ledger.js";
import { createLazyChatRunLedger, type ChatStoreFactory } from "@jini-ai/chat/store/runtime";
import { createTenantScopedChatStore } from "./tenant-scope.js";
import { createChatBulkDeletion } from "@jini-ai/chat/store/sqlite";
import type { ChatOwnerScope } from "@jini-ai/chat/store";

/** Conversation ids a client currently has open; `undefined` keeps every candidate as "unknown". */
export type OpenConversations = () => Promise<ReadonlySet<string> | undefined>;
/** One owner's preview/apply bulk chat deletion (Jini `createChatBulkDeletion`). */
export type ChatBulkDeletion = ReturnType<typeof createChatBulkDeletion>;
/** Builds the bulk deletion for exactly one owner scope. */
export type ChatBulkDeletionFor = (required: { scope: ChatOwnerScope; openConversations: OpenConversations }) => ChatBulkDeletion;

/**
 * Per-owner bulk chat deletion over the site's chat kernel — the same kernel `createChatStoreFactory`
 * uses, so a delete joins the store's own locks. Never mounted without an owner scope.
 * @complexity O(1) per call; the deletion's own preview/apply are bounded by its preview limit.
 */
export function createChatBulkDeletionFor({ store, now }: { store: ChatKernel | SqliteConnectionSource; now: () => number }, _optional = {}): ChatBulkDeletionFor {
  const kernel = chatKernel({ store });
  // Tovu's chat schema is a superset of Jini's (it adds the tool-approvals table), and Kysely's
  // kernel type is invariant in its schema. The deletion reads and writes only Jini's own chat
  // tables, which this kernel carries unchanged, so the narrowing is safe at this one seam.
  const jiniKernel = kernel as unknown as Parameters<typeof createChatBulkDeletion>[0]["kernel"];
  return ({ scope, openConversations }) => createChatBulkDeletion({ kernel: jiniKernel, scope, now, openConversations });
}

/**
 * @file The two ways a composition root supplies chat history, kept together so the difference
 * between them is one line rather than one architecture.
 *
 * Both supply the same {@link ChatStoreFactory} backed by the same chat-history store
 * (`chat-history-store.ts`, Jini adapters borrowing the chat kernel). Only the database differs — the
 * real one writes into the site's chat database, the test one into an anonymous `:memory:`
 * `chat.db` that vanishes with the process.
 */

/**
 * Chat history backed by the host's own chat database.
 *
 * @param required.store the chat kernel, or the open `chat.db` handle (`openChatDb`, which creates the
 *   tables) whose kernel to use. The store and its run ledger share that one kernel.
 */
export function createChatStoreFactory({ store }: { store: ChatKernel | SqliteConnectionSource }, _optional = {}): ChatStoreFactory {
  const kernel = chatKernel({ store });
  const ledger = createChatRunLedger({ store: kernel });
  return (principal) => createTenantScopedChatStore({ db: kernel, principal: principal }, { ledger: ledger });
}

/**
 * Chat history backed by a private in-memory database, for `apps/website/src/server/runtime/composition/app.ts`'s test composition
 * root.
 *
 * Opened lazily, matching `InMemoryPostSearchIndex`'s reasoning next to it: many tests build route
 * deps and never touch chat history, and those should not pay for a database. Once opened it lives
 * for the factory's lifetime, so a test can create a conversation in one request and read it back
 * in the next.
 *
 * The database is `openChatDb(":memory:")`: the same tables and pragmas as the real `chat.db`.
 * The {@link ChatRunLedger} shares this SAME lazy database — the test root needs both, and two
 * private databases would make the ledger blind to every row the store wrote.
 */
export function createInMemoryChatHistory(): { chatHistory: ChatStoreFactory; chatRunLedger: ChatRunLedger } {
  let db: ChatKernel | undefined;
  // `openChatDb` turns `foreign_keys` on: without it the schema's `ON DELETE CASCADE` is inert, and
  // a test asserting that deleting a conversation removes its messages would pass against
  // production and fail here — or, worse, the reverse.
  const open = (): ChatKernel => (db ??= chatKernel({ store: openChatDb({ filePath: ":memory:" }) }));
  // One kernel per connection (memoized), so building a ledger per use costs nothing and keeps the
  // database lazy; Jini's lazy ledger never opens it for boot-time probes.
  const chatRunLedger: ChatRunLedger = createLazyChatRunLedger({ peek: () => db, open,
    ledgerFor: ({ kernel }) => createChatRunLedger({ store: kernel }) });
  return {
    chatHistory: (principal) => createTenantScopedChatStore({ db: open(), principal: principal }, { ledger: chatRunLedger }),
    chatRunLedger,
  };
}
