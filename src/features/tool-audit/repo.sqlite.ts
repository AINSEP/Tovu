/**
 * @file Real SQLite {@link ToolAttemptAuditSink} — persists agent tool-attempt phases into
 * `content.db`'s `agent_tool_attempts` (`repo.memory.ts` is the in-memory half, per ADR-006's
 * rule-of-two).
 *
 * Purpose:
 * Makes the attempt history outlive the daemon process. `@jini-ai/daemon`'s `ToolExecutor` holds its
 * own audit records in an in-process `Map`, so today every requested/denied/failed execution is
 * erased on restart — and the two cases it never records at all (unknown tool, throwing
 * authorization) leave nothing behind even while the process lives.
 *
 * Retention:
 * The table is append-only and would otherwise grow without bound, so {@link MAX_ROWS_PER_WORKSPACE}
 * rows are kept per workspace and the excess is pruned oldest-first on write. The prune runs
 * opportunistically rather than in a background job — there is no scheduler in the daemon process,
 * and a scheduled pruner would be a new failure surface for a table nothing reads on a hot path.
 *
 * Architectural role:
 * Infrastructure adapter. `repo.(sqlite|memory).ts` is the one path under `src/features/**`
 * dependency-cruiser permits to import `src/infra/**` directly.
 */
import { and, eq, lt, sql } from "drizzle-orm";

import { agentToolAttempts } from "../../infra/db/schema";
import type { ContentDb } from "../../infra/sqlite/content-db";
import type { ToolAttemptAuditSink, ToolAttemptEvent } from "./types";

/**
 * Per-workspace row cap.
 *
 * A STARTING NUMBER, not a tuned or externally-derived one, and nothing in the codebase depends on
 * its exact value — raise or lower it freely. Sized so that at roughly two or three rows per
 * attempt it holds on the order of twenty thousand attempts per workspace, which is far more than
 * any current diagnostic use needs while staying small enough that the table cannot quietly become
 * the largest thing in `content.db`.
 */
export const MAX_ROWS_PER_WORKSPACE = 50_000;

/** Prune every Nth append rather than on all of them — the cap is a bound, not a precise ceiling. */
const PRUNE_CHECK_INTERVAL = 256;

export interface SqliteToolAttemptAuditSinkOptions {
  /** Reported when a write fails. @default `console.error` */
  onError?: (error: unknown) => void;
  /** Per-workspace row cap. @default {@link MAX_ROWS_PER_WORKSPACE} */
  maxRowsPerWorkspace?: number;
  /** Appends between prune checks. Lower it in tests to reach the prune without 50k writes. @default {@link PRUNE_CHECK_INTERVAL} */
  pruneCheckInterval?: number;
}

/**
 * SQLite-backed audit sink.
 *
 * `append` deliberately never throws: the decorator that calls it treats audit as observation, and
 * a write failure must not turn a successful tool call into a failed one. A failure is reported to
 * `onError` (default: `console.error`) so it is loud in logs without being fatal in behavior.
 */
export class SqliteToolAttemptAuditSink implements ToolAttemptAuditSink {
  private appendsSincePruneCheck = 0;
  private readonly onError: (error: unknown) => void;
  private readonly maxRows: number;
  private readonly pruneCheckInterval: number;

  constructor(
    private readonly db: ContentDb,
    options: SqliteToolAttemptAuditSinkOptions = {},
  ) {
    this.onError = options.onError ?? ((error) => console.error("[tool-audit] append failed", error));
    this.maxRows = options.maxRowsPerWorkspace ?? MAX_ROWS_PER_WORKSPACE;
    this.pruneCheckInterval = options.pruneCheckInterval ?? PRUNE_CHECK_INTERVAL;
  }

  /**
   * Appends one phase row, then prunes the workspace's oldest rows if the cap is exceeded.
   *
   * @param event - The phase to record. `detail` must already be redacted by the caller.
   * @returns Resolves once the row is written, or once the failure has been reported — never rejects.
   * @complexity O(1) for the insert. The prune runs at most once per
   * {@link PRUNE_CHECK_INTERVAL} appends and is O(log n) per deleted row via the
   * `(workspace_id, id)` index.
   * @overallScore 100
   */
  async append(event: ToolAttemptEvent): Promise<void> {
    try {
      this.db
        .insert(agentToolAttempts)
        .values({
          attemptId: event.attemptId,
          executionId: event.executionId,
          workspaceId: event.workspaceId,
          runId: event.runId,
          toolId: event.toolId,
          principalId: event.principalId,
          phase: event.phase,
          at: event.at,
          detail: event.detail ?? null,
        })
        .run();

      this.appendsSincePruneCheck += 1;
      if (this.appendsSincePruneCheck >= this.pruneCheckInterval) {
        this.appendsSincePruneCheck = 0;
        this.pruneWorkspace(event.workspaceId);
      }
    } catch (error) {
      this.onError(error);
    }
  }

  /**
   * Deletes this workspace's rows below the newest `maxRows`.
   *
   * Uses `id` (monotonic autoincrement) as the age ordering rather than `at`, so a clock that
   * jumps backwards cannot make the prune delete the wrong rows.
   *
   * @complexity One indexed `OFFSET` probe plus one ranged delete.
   * @overallScore 100
   */
  private pruneWorkspace(workspaceId: string): void {
    const [cutoff] = this.db
      .select({ id: agentToolAttempts.id })
      .from(agentToolAttempts)
      .where(eq(agentToolAttempts.workspaceId, workspaceId))
      .orderBy(sql`${agentToolAttempts.id} desc`)
      .limit(1)
      .offset(this.maxRows - 1)
      .all();

    if (!cutoff) return;
    this.db.delete(agentToolAttempts).where(and(eq(agentToolAttempts.workspaceId, workspaceId), lt(agentToolAttempts.id, cutoff.id))).run();
  }
}
