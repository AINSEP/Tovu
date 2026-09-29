import { sql } from "kysely";

import { tableExists } from "../kernel/dialect.js";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationContext, MigrationStep } from "./step.js";

/**
 * @file Step `0002_drop_empty_legacy_chat_tables`: the `content.db` half of the two-database split
 * (`0fb84ae0`). Legacy migrations `0023`/`0051` still create the AI chat tables in every SQLite
 * content database, but the chat lives in `chat.db` from the first write on. This drops each of
 * the three that holds NO rows; one with rows (a pre-split install's real history) is left for
 * `sqlite/chat-orphan-check.ts` to keep flagging for a human. Conditional on a row count, which is
 * why it was never a `.sql` migration (SQLite has no `DROP TABLE ... WHERE`).
 *
 * Postgres/PGlite: nothing. Their baseline never had these tables in `public` (chat is in
 * `ai_chat`, ADR-067).
 *
 * Names are written out, not imported from `chat-orphan-check.ts`: the pinned checksum hashes this
 * file.
 */

export const DROP_EMPTY_LEGACY_CHAT_TABLES_ID = "0002_drop_empty_legacy_chat_tables";

const LEGACY_CHAT_TABLES = ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"];

async function up(kernel: StorageKernel<unknown>, context: MigrationContext): Promise<void> {
  if (kernel.dialect !== "sqlite") return;
  for (const table of LEGACY_CHAT_TABLES) {
    if (!(await tableExists(kernel, table))) continue;
    const [row] = await kernel.query<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.table(table)}`);
    if (Number(row?.n ?? 0) > 0) {
      context.note(`kept legacy chat table ${table}: it has rows`);
      continue;
    }
    await kernel.execute(sql`DROP TABLE ${sql.table(table)}`);
  }
}

export const dropEmptyLegacyChatTables = (checksum: string): MigrationStep => ({ id: DROP_EMPTY_LEGACY_CHAT_TABLES_ID, checksum, up });
