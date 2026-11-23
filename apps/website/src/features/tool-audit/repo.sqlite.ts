import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlToolAttemptAuditSink, type SqlToolAttemptAuditSinkOptions, type ToolAuditErrorReporter } from "@jini-ai/diagnostics/tool-audit/repo";
import { createToolGapReader } from "@jini-ai/diagnostics/tool-audit/tool-gaps.repo";
// Shared phases/events/append contract belong to the daemon; Tovu owns durable storage adapters.
import { TOOL_GAP_AUDIT_ID, decodeToolGapEntry } from "@jini-ai/daemon/tool-audit";
import type { ToolGapReadPort } from "@jini-ai/core/contracts/site/assistant-host-ports";

/**
 * @file THE durable {@link ToolAttemptAuditSink} — persists agent tool-attempt phases into the
 * content database's `agent_tool_attempts` (`repo.memory.ts` is the in-memory half, per ADR-006's
 * rule-of-two). One Kysely query body for every dialect (storage plan §4, ADR-066); `repo.sqlite.ts`
 * is the thin subclass the composition root builds from the content db handle.
 *
 * Purpose:
 * Makes the attempt history outlive the daemon process. `@jini-ai/daemon`'s `ToolExecutor` holds its
 * own audit records in an in-process `Map`, so today every requested/denied/failed execution is
 * erased on restart — and the two cases it never records at all (unknown tool, throwing
 * authorization) leave nothing behind even while the process lives.
 *
 * Retention:
 * The table is append-only and would otherwise grow without bound, so {@link MAX_ROWS_PER_WORKSPACE}
 * administrator rows are kept per workspace; anonymous-visitor has an independent 20,000-row
 * bucket. Each bucket's excess is pruned oldest-first on write. The prune runs
 * opportunistically rather than in a background job — there is no scheduler in the daemon process,
 * and a scheduled pruner would be a new failure surface for a table nothing reads on a hot path.
 *
 * Architectural role:
 * Infrastructure adapter. `repo(.sqlite|.memory)?.ts` is the one path under `src/features/**`
 * dependency-cruiser permits to import `src/platform/db/**` directly.
 */

/**
 * @file The tool-attempt audit sink on a site's SQLite `content.db`: {@link SqlToolAttemptAuditSink}
 * (the one Kysely query body, now Jini `@jini-ai/diagnostics/tool-audit/repo`), kept as a named class
 * so the composition root that builds it from the content db handle stays as it is. The binding
 * supplies this site's table name and its error reporter, and the tool-gap reader's daemon
 * marker and decoder.
 */

/** This site's audit table name (the Jini adapters have no default). */
export const TOOL_ATTEMPT_TABLES = { toolAttempts: "agent_tool_attempts" } as const;

/** This site's default append-failure log line (the Jini sink has no console default). */
export const logToolAuditAppendFailure: ToolAuditErrorReporter = ({ error }) => console.error("[tool-audit] append failed", error);

/**
 * Content-database-backed audit sink.
 *
 * `append` deliberately never throws: the decorator that calls it treats audit as observation, and
 * a write failure must not turn a successful tool call into a failed one. A failure is reported to
 * `onError` (default: `console.error`) so it is loud in logs without being fatal in behavior.
 */
export class SqliteToolAttemptAuditSink extends SqlToolAttemptAuditSink {
  /**
   * @param required.store - The connection's kernel, or the content db handle it is derived from.
   * @param options.onError - Reported when a write fails. @default {@link logToolAuditAppendFailure}
   */
  constructor({ store }: { store: ContentKernel | ContentDb }, options: SqlToolAttemptAuditSinkOptions & { onError?: ToolAuditErrorReporter } = {}) {
    const { onError = logToolAuditAppendFailure, ...retention } = options;
    super({ kernel: schemaErasedKernel({ store }), tables: TOOL_ATTEMPT_TABLES, onError }, retention);
  }
}

/** The tool-gap reader over this site's audit table, with the daemon's gap marker and decoder. */
export function createSqliteToolGapReader({ store }: { store: ContentKernel | ContentDb }, _optional = {}): ToolGapReadPort {
  return createToolGapReader({ kernel: schemaErasedKernel({ store }), tables: TOOL_ATTEMPT_TABLES, toolGapAuditId: TOOL_GAP_AUDIT_ID, decodeToolGapEntry }, {});
}
