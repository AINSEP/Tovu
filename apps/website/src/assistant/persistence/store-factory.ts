import Database from "better-sqlite3";
import { ensureChatHistoryTables } from "@jini-ai/sqlite";
import type { Database as SqliteDatabase } from "better-sqlite3";

import { createChatRunLedger, type ChatRunLedger } from "./run-ledger.js";
import { createTenantScopedChatStore, type ChatStoreFactory } from "./tenant-scope.js";

/**
 * @file The two ways a composition root supplies chat history, kept together so the difference
 * between them is one line rather than one architecture.
 *
 * Both return the same {@link ChatStoreFactory} backed by the same `@jini-ai/sqlite` adapter. Only
 * the database differs — the real one writes into `content.db`, the test one into an anonymous
 * `:memory:` handle that vanishes with the process.
 */

/**
 * Chat history backed by the host's own database.
 *
 * The handle comes from `ContentDb.$client`, and the tables it uses were created by migration
 * `0023`, NOT by this package — see that migration's header on why `content.db` has exactly one
 * migrator.
 */
export function createChatStoreFactory(db: SqliteDatabase): ChatStoreFactory {
  const ledger = createChatRunLedger(db);
  return (principal) => createTenantScopedChatStore(db, principal, ledger);
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
 * This calls `ensureChatHistoryTables` — the one place in Tovu that does. A root with no migration
 * system is precisely the case that function exists for.
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
  let db: SqliteDatabase | undefined;
  const open = (): SqliteDatabase => {
    if (!db) {
      db = new Database(":memory:");
      // Without this the schema's `ON DELETE CASCADE` is inert, and a test asserting that deleting
      // a conversation removes its messages would pass against production and fail here — or,
      // worse, the reverse.
      db.pragma("foreign_keys = ON");
      ensureChatHistoryTables(db);
    }
    return db;
  };
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
