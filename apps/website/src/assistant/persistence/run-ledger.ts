import type { AgentEvent, ChatRunStatus } from "@jini-ai/chat/core";
import type { Database as SqliteDatabase } from "better-sqlite3";

import { runInterruptedNotice } from "#src/contracts/core/assistant-run-events";

/**
 * @file The run-status half of chat history: the writes that decide how an assistant turn ENDS.
 *
 * Purpose:
 * Two writers can finish the same assistant row. The browser saves a turn when its own stream
 * ends; the server finalizer (`assistant-run-finalizer.ts`) saves it when the daemon's stream ends,
 * whether or not a browser is still attached. Both write the same translation of the same run, so
 * the rule is simple: **for one run, the first terminal write wins**. A later write for that run —
 * a second terminal save, or a stub that arrives late — is ignored. A write for a DIFFERENT run id
 * (a retry reuses the message id with a new run) is a new turn and goes through as normal.
 *
 * Why here and not in the route: every check below is one synchronous `better-sqlite3` statement,
 * so no `await` sits between "is it settled?" and the write. Both writers live in the API process,
 * so that makes the rule race-free without a lock.
 *
 * Architectural role:
 * Holds the raw `chat.db` handle, like `tenant-scope.ts`. Nothing here returns message content to a
 * caller; the one cross-owner operation ({@link ChatRunLedger.reconcileInterrupted}) only ever
 * moves rows from `queued`/`running` to `failed`. No row is ever deleted.
 */

const TERMINAL_STATUSES = ["succeeded", "failed", "canceled"] as const;
const NOT_TERMINAL_SQL = `(run_status IS NULL OR run_status NOT IN ('succeeded','failed','canceled'))`;

/** The finished state of one run's row, as the finalizer saves it. */
export interface RunSettlement {
  readonly conversationId: string;
  readonly messageId: string;
  readonly runId: string;
  readonly status: Extract<ChatRunStatus, "succeeded" | "failed" | "canceled">;
  readonly content: string;
  readonly events: readonly AgentEvent[];
  readonly endedAt: number;
}

export interface ChatRunLedger {
  /**
   * Whether this run's row already holds a terminal status. `false` for an unknown row, another run
   * id, or a row still `queued`/`running`.
   */
  isSettled(conversationId: string, messageId: string, runId: string): boolean;
  /**
   * Writes the run's final content, events and status — only if the row still belongs to that run
   * and is not yet terminal. Returns `true` when this call was the one that settled it.
   */
  settle(settlement: RunSettlement): boolean;
  /**
   * Boot-time repair: marks every assistant row still `queued`/`running` as `failed`, keeping its
   * content and events and appending the plain restart notice. Returns how many rows it changed.
   *
   * Correct at boot because the agent daemon is a child of this process
   * (`daemon-supervisor.ts`): a run from before this boot cannot still be alive. BYOK and AG-UI turns
   * lived on a request to the old process, so the same holds for them.
   */
  reconcileInterrupted(now?: number): number;
}

function isTerminal(status: unknown): boolean {
  return typeof status === "string" && (TERMINAL_STATUSES as readonly string[]).includes(status);
}

function eventsWithNotice(eventsJson: string | null): AgentEvent[] {
  let events: unknown = [];
  try {
    events = eventsJson ? JSON.parse(eventsJson) : [];
  } catch {
    events = [];
  }
  return [...(Array.isArray(events) ? (events as AgentEvent[]) : []), runInterruptedNotice()];
}

/**
 * @param db the `chat.db` handle `createChatStoreFactory` also wraps.
 * @complexity each method is one indexed statement, except `reconcileInterrupted`, which is O(stuck rows).
 */
export function createChatRunLedger(db: SqliteDatabase): ChatRunLedger {
  // Prepared per call, not up front: the in-memory test root creates its tables lazily, and each of
  // these runs at most a few times per turn, so a cached statement would buy nothing.
  const sql = {
    readStatus: `SELECT run_status AS runStatus FROM ai_chat_messages WHERE id = ? AND conversation_id = ? AND run_id = ?`,
    settleRow: `UPDATE ai_chat_messages
        SET content = @content, events_json = @eventsJson, run_status = @status, ended_at = @endedAt
      WHERE id = @messageId AND conversation_id = @conversationId AND run_id = @runId
        AND role = 'assistant' AND ${NOT_TERMINAL_SQL}`,
    touchConversation: `UPDATE ai_chats SET updated_at = ? WHERE id = ?`,
    stuckRows: `SELECT id, events_json AS eventsJson FROM ai_chat_messages
      WHERE role = 'assistant' AND run_status IN ('queued','running')`,
    failStuckRow: `UPDATE ai_chat_messages
        SET run_status = 'failed', events_json = @eventsJson, ended_at = COALESCE(ended_at, @now)
      WHERE id = @id AND run_status IN ('queued','running')`,
  } as const;

  return {
    isSettled(conversationId, messageId, runId) {
      const row = db.prepare(sql.readStatus).get(messageId, conversationId, runId) as { runStatus: unknown } | undefined;
      return isTerminal(row?.runStatus);
    },

    settle(settlement) {
      const changed = db.prepare(sql.settleRow).run({
        messageId: settlement.messageId,
        conversationId: settlement.conversationId,
        runId: settlement.runId,
        status: settlement.status,
        content: settlement.content,
        eventsJson: JSON.stringify(settlement.events),
        endedAt: settlement.endedAt,
      }).changes;
      if (changed === 0) return false;
      db.prepare(sql.touchConversation).run(settlement.endedAt, settlement.conversationId);
      return true;
    },

    reconcileInterrupted(now = Date.now()) {
      const repair = db.transaction(() => {
        let count = 0;
        const failStuckRow = db.prepare(sql.failStuckRow);
        for (const row of db.prepare(sql.stuckRows).all() as { id: string; eventsJson: string | null }[]) {
          count += failStuckRow.run({ id: row.id, now, eventsJson: JSON.stringify(eventsWithNotice(row.eventsJson)) }).changes;
        }
        return count;
      });
      return repair();
    },
  };
}
