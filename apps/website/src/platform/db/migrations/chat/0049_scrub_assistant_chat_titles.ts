import { sql } from "kysely";
import { redactUserText } from "@jini-ai/chat/core";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";
import type { KyselyKernel } from "@jini-ai/db/kernel";

/** The write path's title policy, applied unchanged so a scrubbed row matches a fresh rename.
 * @returns The stored form of `title`.
 * @complexity O(title length), no I/O.
 */
export function scrubbedChatTitle({ title }: { title: string }, _optional = {}): string {
  return redactUserText({ text: title }).text.trim();
}

/** Host-owned ADR-066 data step (B140). The live write-path guard does not reach old rows, so the
 * same redactor runs once in the chat ledger: existing titles are cleaned without changing their
 * provenance (`title_source`, timestamps) or moving unrelated data. Only rows whose title changes
 * are written, keyed by id, so a rerun over scrubbed data writes nothing. Titles are never logged.
 * @complexity O(chats) once at migration, inside the runner's per-step transaction.
 */
export const scrubAssistantChatTitles = ({ checksum }: { checksum: string }, _optional = {}): MigrationStep<KyselyKernel<unknown>> => ({
  id: "0049_scrub_assistant_chat_titles", checksum,
  async up(kernel) {
    const table = sql.table(kernel.dialect === "sqlite" ? "ai_chats" : "ai_chat.ai_chats");
    const rows = await kernel.query<{ id: string; title: string }>(sql`SELECT id, title FROM ${table} WHERE title IS NOT NULL`);
    for (const row of rows) {
      const title = scrubbedChatTitle({ title: row.title }, {});
      if (title !== row.title) await kernel.execute(sql`UPDATE ${table} SET title = ${title} WHERE id = ${row.id}`);
    }
  },
});
