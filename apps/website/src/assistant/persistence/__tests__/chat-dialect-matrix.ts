import { after, describe } from "node:test";

import Database from "better-sqlite3";
import { ensureChatHistoryTables } from "@jini-ai/sqlite";
import { sql } from "kysely";

import type { ChatDatabase, ChatKernel } from "#src/platform/db/chat-kernel";
import { heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openPgliteKernel, type StorageDialect, sqliteKernel } from "#src/platform/db/kernel/index";
import { ensurePgChatSchema } from "#src/platform/db/pglite/chat-schema";

/**
 * @file `kernel/__tests__/dialect-matrix.ts`'s `describeEachDialect` for the CHAT database: one suite
 * on SQLite (a fresh `:memory:` `chat.db` per make, tables from `@jini-ai/sqlite`'s own DDL, foreign
 * keys on as `openChatDb` sets them) and PGlite (one instance per file, `pglite/chat-schema.ts`,
 * both chat tables emptied per make). Same rules as the content matrix: make before use, tests in
 * sequence.
 */

let sharedPg: ChatKernel | undefined;

/** A fresh in-memory SQLite `chat.db` behind its kernel. */
export function freshSqliteChatKernel(): ChatKernel {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  ensureChatHistoryTables(client);
  return sqliteKernel<ChatDatabase>(client);
}

/** The file's shared PGlite chat kernel, with both chat tables emptied before its first call. */
export function emptiedPgChatKernel(): ChatKernel {
  sharedPg ??= openPgliteKernel<ChatDatabase>({ prepare: ensurePgChatSchema });
  const pending = sharedPg.execute(sql`TRUNCATE ai_chats, ai_chat_messages CASCADE`);
  pending.catch(() => {});
  return heldUntil(sharedPg, pending);
}

export function describeEachChatDialect<R>(
  title: string,
  make: (kernel: ChatKernel) => R,
  body: (make: () => R, dialect: StorageDialect) => void
): void {
  describe(`${title} [sqlite]`, () => body(() => make(freshSqliteChatKernel()), "sqlite"));
  describe(`${title} [pglite]`, () => {
    after(async () => {
      await sharedPg?.close();
      sharedPg = undefined;
    });
    body(() => make(emptiedPgChatKernel()), "postgres");
  });
}
