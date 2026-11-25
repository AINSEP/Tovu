import { sql } from "kysely";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";
import type { KyselyKernel } from "@jini-ai/db/kernel";

export function chatPinnedStatements({ dialect }: { dialect: string }, _optional = {}): readonly string[] {
  const table = dialect === "sqlite" ? "ai_chats" : "ai_chat.ai_chats";
  return [
    dialect === "sqlite" ? "ALTER TABLE ai_chats ADD COLUMN pinned_at INTEGER" : "ALTER TABLE ai_chat.ai_chats ADD COLUMN IF NOT EXISTS pinned_at BIGINT",
    `CREATE INDEX IF NOT EXISTS idx_ai_chats_owner_cleanup ON ${table}(scope_id, owner_kind, owner_id, pinned_at, updated_at)`,
  ];
}

// Fresh and upgraded schemas must agree without rewriting historical migrations.
export const chatPinned = ({ checksum }: { checksum: string }, _optional = {}): MigrationStep<KyselyKernel<unknown>> => ({
  id: "0004_chat_pinned", checksum,
  async up(kernel) {
    const statements = chatPinnedStatements({ dialect: kernel.dialect }, {});
    const present = kernel.dialect === "sqlite"
      ? await kernel.query(sql`SELECT 1 FROM pragma_table_info('ai_chats') WHERE name='pinned_at'`)
      : [];
    if (present.length === 0) await kernel.execute(sql.raw(statements[0]!));
    await kernel.execute(sql.raw(statements[1]!));
  },
});
