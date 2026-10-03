import { after, describe } from "node:test";

import { sql } from "kysely";
import pg from "pg";
import { openPostgresKernel } from "@jini-ai/db/kernel/postgres";
import { openPgliteKernel } from "@jini-ai/db/kernel/pglite";
import { sqliteKernel } from "@jini-ai/db/kernel/sqlite";
import type { StorageDialect, StorageKernel } from "@jini-ai/db/kernel";
import { PGlite } from "@electric-sql/pglite";

import { type ChatDatabase, type ChatKernel, pgChatKernel } from "#src/platform/db/chat-kernel";
import { heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { migrateChatDatabase } from "#src/platform/db/migrations/index";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";

/**
 * @file `kernel/__tests__/dialect-matrix.ts`'s `describeEachDialect` for the CHAT database: one suite
 * on SQLite (a fresh `:memory:` `chat.db` per make, opened by `openChatDb` itself: every chat table,
 * foreign keys on) and PGlite (one instance per file, migrated by `migrateChatDatabase` into the
 * `ai_chat` schema and reached through `pgChatKernel`, as a site's store does; every chat table
 * emptied per make). Same rules as the content matrix: make before use, tests in
 * sequence.
 */

let sharedPg: StorageKernel<unknown> | undefined;
let migrated: Promise<unknown> | undefined;
let sharedRealPg: StorageKernel<unknown> | undefined;
let realPgMigrated: Promise<unknown> | undefined;

/** Explicit acceptance only: a real server, guarded by a disposable database-name prefix. */
function emptiedPostgresChatKernel(): ChatKernel {
  const connectionString = process.env.TOVU_CHAT_TEST_POSTGRES_URL;
  if (!connectionString || !/^jini_chat_test_/.test(new URL(connectionString).pathname.slice(1))) {
    throw new Error("TOVU_CHAT_TEST_POSTGRES_URL must name a disposable jini_chat_test_* database");
  }
  if (sharedRealPg === undefined) {
    sharedRealPg = openPostgresKernel<unknown>({ pg, connectionString });
    realPgMigrated = migrateChatDatabase(sharedRealPg);
  }
  const base = sharedRealPg;
  const pending = (realPgMigrated as Promise<unknown>).then(() =>
    base.execute(sql`TRUNCATE ai_chat.ai_chats, ai_chat.ai_chat_messages, ai_chat.assistant_agent_sessions, ai_chat.assistant_conversation_tool_approvals CASCADE`)
  );
  pending.catch(() => {});
  return heldUntil(pgChatKernel(base), pending);
}

/** A fresh in-memory SQLite `chat.db` behind its kernel. */
export function freshSqliteChatKernel(): ChatKernel {
  return sqliteKernel<ChatDatabase>(openChatDb(":memory:"));
}

/** The file's shared PGlite chat kernel, with every chat table emptied before its first call. */
export function emptiedPgChatKernel(): ChatKernel {
  if (sharedPg === undefined) {
    sharedPg = openPgliteKernel<unknown>({ PGlite });
    migrated = migrateChatDatabase(sharedPg);
  }
  const base = sharedPg;
  const pending = (migrated as Promise<unknown>).then(() =>
    base.execute(sql`TRUNCATE ai_chat.ai_chats, ai_chat.ai_chat_messages, ai_chat.assistant_agent_sessions, ai_chat.assistant_conversation_tool_approvals CASCADE`)
  );
  pending.catch(() => {});
  return heldUntil(pgChatKernel(base), pending);
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
      migrated = undefined;
    });
    body(() => make(emptiedPgChatKernel()), "postgres");
  });
  if (process.env.TOVU_CHAT_TEST_POSTGRES_URL !== undefined) {
    describe(`${title} [real postgres]`, () => {
      after(async () => {
        await sharedRealPg?.close();
        sharedRealPg = undefined;
        realPgMigrated = undefined;
      });
      body(() => make(emptiedPostgresChatKernel()), "postgres");
    });
  }
}
