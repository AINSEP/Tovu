import { sql } from "kysely";
import type { MigrationStep } from "../step.js";

/** Host-owned ADR-066 step. The partial covering index keeps idle probes off event overflow pages.
 * @returns DDL for the host's existing chat namespace; no data is rewritten.
 * @complexity O(messages) once at migration; subsequent probes read only active index entries.
 */
export function activeRunIndexStatement({ dialect }: { dialect: string }, _optional = {}): string {
  const table = dialect === "sqlite" ? "ai_chat_messages" : "ai_chat.ai_chat_messages";
  return `CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_active ON ${table}(role, run_status, id) WHERE run_status IN ('queued', 'running')`;
}

/** Apply through the chat migration ledger, never opportunistically from a runtime probe. */
export const activeRunIndex = ({ checksum }: { checksum: string }, _optional = {}): MigrationStep => ({
  id: "0003_active_run_index", checksum,
  async up(kernel) { await kernel.execute(sql.raw(activeRunIndexStatement({ dialect: kernel.dialect }, {}))); },
});
