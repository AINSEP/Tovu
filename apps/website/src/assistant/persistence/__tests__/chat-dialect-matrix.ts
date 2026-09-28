import { after, describe } from "node:test";

import { sql } from "kysely";

import type { ChatDatabase, ChatKernel } from "#src/platform/db/chat-kernel";
import { heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openPgliteKernel, type StorageDialect, sqliteKernel } from "#src/platform/db/kernel/index";
import { ensurePgChatSchema } from "#src/platform/db/pglite/chat-schema";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";

/**
 * @file `kernel/__tests__/dialect-matrix.ts`'s `describeEachDialect` for the CHAT database: one suite
 * on SQLite (a fresh `:memory:` `chat.db` per make, opened by `openChatDb` itself: every chat table,
 * foreign keys on) and PGlite (one instance per file, `pglite/chat-schema.ts`, every chat table
 * emptied per make). Same rules as the content matrix: make before use, tests in
 * sequence.
 */

let sharedPg: ChatKernel | undefined;

/** A fresh in-memory SQLite `chat.db` behind its kernel. */
export function freshSqliteChatKernel(): ChatKernel {
  return sqliteKernel<ChatDatabase>(openChatDb(":memory:"));
}

/** The file's shared PGlite chat kernel, with every chat table emptied before its first call. */
export function emptiedPgChatKernel(): ChatKernel {
  sharedPg ??= openPgliteKernel<ChatDatabase>({ prepare: ensurePgChatSchema });
  const pending = sharedPg.execute(sql`TRUNCATE ai_chats, ai_chat_messages, assistant_agent_sessions, assistant_conversation_tool_approvals CASCADE`);
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
