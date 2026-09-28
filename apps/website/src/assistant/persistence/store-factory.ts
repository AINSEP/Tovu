import { type ChatKernel, chatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "#src/platform/db/kernel/index";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { createChatRunLedger, type ChatRunLedger } from "./run-ledger.js";
import { createTenantScopedChatStore, type ChatStoreFactory } from "./tenant-scope.js";

/**
 * @file The two ways a composition root supplies chat history, kept together so the difference
 * between them is one line rather than one architecture.
 *
 * Both return the same {@link ChatStoreFactory} backed by the same chat-history store
 * (`chat-history-store.ts`, one Kysely body on the chat kernel). Only the database differs — the
 * real one writes into the site's chat database, the test one into an anonymous `:memory:`
 * `chat.db` that vanishes with the process.
 */

/**
 * Chat history backed by the host's own chat database.
 *
 * @param store the chat kernel, or the open `chat.db` handle (`openChatDb`, which creates the
 *   tables) whose kernel to use. The store and its run ledger share that one kernel.
 */
export function createChatStoreFactory(store: ChatKernel | SqliteConnectionSource): ChatStoreFactory {
  const kernel = chatKernel(store);
  const ledger = createChatRunLedger(kernel);
  return (principal) => createTenantScopedChatStore(kernel, principal, ledger);
}

/**
 * Chat history backed by a private in-memory database, for `server/app.ts`'s test composition
 * root.
 *
 * Opened lazily, matching `InMemoryPostSearchIndex`'s reasoning next to it: many tests build route
 * deps and never touch chat history, and those should not pay for a database. Once opened it lives
 * for the factory's lifetime, so a test can create a conversation in one request and read it back
 * in the next.
 *
 * The database is `openChatDb(":memory:")`: the same tables and pragmas as the real `chat.db`.
 */
export function createInMemoryChatStoreFactory(): ChatStoreFactory {
  return createInMemoryChatHistory().chatHistory;
}

/**
 * {@link createInMemoryChatStoreFactory}'s store plus the {@link ChatRunLedger} over the SAME lazy
 * database — the test root needs both, and two private databases would make the ledger blind to
 * every row the store wrote.
 */
export function createInMemoryChatHistory(): { chatHistory: ChatStoreFactory; chatRunLedger: ChatRunLedger } {
  let db: ChatKernel | undefined;
  // `openChatDb` turns `foreign_keys` on: without it the schema's `ON DELETE CASCADE` is inert, and
  // a test asserting that deleting a conversation removes its messages would pass against
  // production and fail here — or, worse, the reverse.
  const open = (): ChatKernel => (db ??= chatKernel(openChatDb(":memory:")));
  // One kernel per connection (memoized), so building a ledger per use costs nothing and keeps the
  // database lazy.
  const chatRunLedger: ChatRunLedger = {
    unlessSettled: (run, write) => createChatRunLedger(open()).unlessSettled(run, write),
    settle: (settlement) => createChatRunLedger(open()).settle(settlement),
    checkpoint: (progress) => createChatRunLedger(open()).checkpoint(progress),
    // A database nobody has opened yet holds no stuck rows, so boot-time reconcile does not open it.
    reconcileInterrupted: async (now) => (db ? createChatRunLedger(db).reconcileInterrupted(now) : 0),
  };
  return {
    chatHistory: (principal) => createTenantScopedChatStore(open(), principal, chatRunLedger),
    chatRunLedger,
  };
}
