import { sql } from "kysely";
import type { StorageKernel } from "../../kernel/port.js";
import type { MigrationStep } from "../step.js";

// Attempt metadata belongs beside the message: deleting its conversation cancels recovery by
// deleting the binding. Keep the published Jini history schema independent of this prototype.
export function durableRunStatements({ dialect }: { dialect: string }, _optional = {}): readonly string[] {
  const prefix = dialect === "sqlite" ? "" : "ai_chat.";
  const time = dialect === "sqlite" ? "INTEGER" : "BIGINT";
  return [`CREATE TABLE IF NOT EXISTS ${prefix}assistant_run_attempts (
    message_id TEXT PRIMARY KEY REFERENCES ${prefix}ai_chat_messages(id) ON DELETE CASCADE,
    engine TEXT NOT NULL,
    accepted_json TEXT NOT NULL,
    recovery_count INTEGER NOT NULL DEFAULT 0,
    recovery_deadline ${time},
    recovery_elapsed_ms ${time} NOT NULL DEFAULT 0,
    attempt_started_at ${time} NOT NULL,
    last_progress_at ${time} NOT NULL,
    cancel_reason TEXT,
    session_id TEXT,
    session_confirmed INTEGER NOT NULL DEFAULT 0,
    child_pid INTEGER,
    child_started_at TEXT,
    attempt_base_json TEXT NOT NULL DEFAULT '[]'
  )`];
}

export const durableRunAttempts = ({ checksum }: { checksum: string }, _optional = {}): MigrationStep => ({
  id: "0002_durable_run_attempts", checksum,
  async up(kernel: StorageKernel<unknown>) {
    for (const statement of durableRunStatements({ dialect: kernel.dialect }, {})) await kernel.execute(sql.raw(statement));
  },
});
