import type { AgentEvent, ChatRunStatus } from "@jini-ai/chat/core";
import type { ExpressionBuilder } from "kysely";

import { runInterruptedNotice } from "#src/contracts/core/assistant-run-events";
import { type ChatDatabase, type ChatKernel, chatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "#src/platform/db/kernel/index";

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
 * How it stays race-free with async storage: every "is it settled?" check and the write it guards
 * run in ONE kernel transaction holding the run's lock ({@link runLockKey}), and {@link
 * ChatRunLedger.settle} takes the same lock. On SQLite that is `BEGIN IMMEDIATE` (the write lock);
 * on Postgres a transaction-scoped advisory lock, since a plain transaction does not serialize there.
 *
 * Architectural role:
 * ONE Kysely body over the chat kernel (`platform/db/chat-kernel.ts`), for every dialect. Nothing
 * here returns message content to a caller; the one cross-owner operation
 * ({@link ChatRunLedger.reconcileInterrupted}) only ever moves rows from `queued`/`running` to
 * `failed`. No row is ever deleted.
 */

const TERMINAL_STATUSES = ["succeeded", "failed", "canceled"] as const;

/** Which run of which assistant row. */
export interface RunRef {
  readonly conversationId: string;
  readonly messageId: string;
  readonly runId: string;
}

/** What a run has produced so far (the finalizer's in-flight save). */
export interface RunProgress extends RunRef {
  readonly content: string;
  readonly events: readonly AgentEvent[];
}

/** The finished state of one run's row, as the finalizer saves it. */
export interface RunSettlement extends RunProgress {
  readonly status: Extract<ChatRunStatus, "succeeded" | "failed" | "canceled">;
  readonly endedAt: number;
}

/** {@link ChatRunLedger.unlessSettled}'s result: the write's value, or that the run had settled. */
export type UnlessSettled<T> = { readonly written: true; readonly value: T } | { readonly written: false };

export interface ChatRunLedger {
  /**
   * Runs `write` only while `run`'s row holds no terminal status (an unknown row, another run id, or
   * a row still `queued`/`running` all count as unsettled), with no settle able to land in between.
   * `write` must reach the chat database through this ledger's kernel (the same connection, on
   * SQLite) so it joins the transaction.
   */
  unlessSettled<T>(run: RunRef, write: () => Promise<T>): Promise<UnlessSettled<T>>;
  /**
   * Writes the run's final content, events and status — only if the row still belongs to that run
   * and is not yet terminal. Resolves `true` when this call was the one that settled it.
   */
  settle(settlement: RunSettlement): Promise<boolean>;
  /**
   * Saves what a still-running run has produced so far (content and events; the status stays), so
   * a process that dies mid-run leaves its partial answer for {@link reconcileInterrupted} to keep.
   * A no-op once the row is terminal or belongs to another run. Resolves `true` when it wrote.
   */
  checkpoint(progress: RunProgress): Promise<boolean>;
  /**
   * Boot-time repair: marks every assistant row still `queued`/`running` as `failed`, keeping its
   * content and events and appending the plain restart notice. Resolves how many rows it changed.
   *
   * Correct at boot because the agent daemon is a child of this process
   * (`daemon-supervisor.ts`): a run from before this boot cannot still be alive. BYOK and AG-UI turns
   * lived on a request to the old process, so the same holds for them. No run lock: nothing else
   * writes these rows before the routes that serve them exist, and each row's update re-checks its
   * status.
   */
  reconcileInterrupted(now?: number): Promise<number>;
}

/** The lock every read-then-write on one run's row takes. */
export function runLockKey(run: RunRef): string {
  return `chat-run:${run.conversationId}:${run.messageId}`;
}

function isTerminal(status: unknown): boolean {
  return typeof status === "string" && (TERMINAL_STATUSES as readonly string[]).includes(status);
}

type MessagesBuilder = ExpressionBuilder<ChatDatabase, "ai_chat_messages">;

/** `run_status` is not terminal (NULL counts as not terminal). */
const notTerminal = (eb: MessagesBuilder) =>
  eb.or([eb("run_status", "is", null), eb("run_status", "not in", TERMINAL_STATUSES)]);

/** The assistant row of exactly this run. */
const isRunRow = (eb: MessagesBuilder, run: RunRef) =>
  eb.and([
    eb("id", "=", run.messageId),
    eb("conversation_id", "=", run.conversationId),
    eb("run_id", "=", run.runId),
    eb("role", "=", "assistant"),
  ]);

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
 * @param store the chat kernel, or the open `chat.db` handle `createChatStoreFactory` also wraps.
 * @complexity each method is one or two indexed statements, except `reconcileInterrupted`, which
 *   is O(stuck rows).
 */
export function createChatRunLedger(store: ChatKernel | SqliteConnectionSource): ChatRunLedger {
  const kernel = chatKernel(store);

  async function isSettled(run: RunRef): Promise<boolean> {
    const row = await kernel.run((db) =>
      db
        .selectFrom("ai_chat_messages")
        .select("run_status")
        .where("id", "=", run.messageId)
        .where("conversation_id", "=", run.conversationId)
        .where("run_id", "=", run.runId)
        .executeTakeFirst()
    );
    return isTerminal(row?.run_status);
  }

  return {
    unlessSettled(run, write) {
      return kernel.transaction(async () => {
        await kernel.lockKey(runLockKey(run));
        if (await isSettled(run)) return { written: false } as const;
        return { written: true, value: await write() } as const;
      });
    },

    settle(settlement) {
      return kernel.transaction(async () => {
        await kernel.lockKey(runLockKey(settlement));
        const result = await kernel.run((db) =>
          db
            .updateTable("ai_chat_messages")
            .set({
              content: settlement.content,
              events_json: JSON.stringify(settlement.events),
              run_status: settlement.status,
              ended_at: settlement.endedAt,
            })
            .where((eb) => eb.and([isRunRow(eb, settlement), notTerminal(eb)]))
            .executeTakeFirst()
        );
        if (Number(result.numUpdatedRows) === 0) return false;
        await kernel.run((db) =>
          db
            .updateTable("ai_chats")
            .set({ updated_at: settlement.endedAt })
            .where("id", "=", settlement.conversationId)
            .execute()
        );
        return true;
      });
    },

    async checkpoint(progress) {
      const result = await kernel.run((db) =>
        db
          .updateTable("ai_chat_messages")
          .set({ content: progress.content, events_json: JSON.stringify(progress.events) })
          .where((eb) => eb.and([isRunRow(eb, progress), notTerminal(eb)]))
          .executeTakeFirst()
      );
      return Number(result.numUpdatedRows) > 0;
    },

    reconcileInterrupted(now = Date.now()) {
      return kernel.transaction(async () => {
        const stuck = await kernel.run((db) =>
          db
            .selectFrom("ai_chat_messages")
            .select(["id", "events_json"])
            .where("role", "=", "assistant")
            .where("run_status", "in", ["queued", "running"])
            .execute()
        );
        let count = 0;
        for (const row of stuck) {
          const result = await kernel.run((db) =>
            db
              .updateTable("ai_chat_messages")
              .set((eb) => ({
                run_status: "failed",
                events_json: JSON.stringify(eventsWithNotice(row.events_json)),
                ended_at: eb.fn.coalesce("ended_at", eb.val(now)),
              }))
              .where("id", "=", row.id)
              .where("run_status", "in", ["queued", "running"])
              .executeTakeFirst()
          );
          count += Number(result.numUpdatedRows);
        }
        return count;
      });
    },
  };
}
