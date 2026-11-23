import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlToolAttemptAuditSink, type SqlToolAttemptAuditSinkOptions, type ToolAuditErrorReporter } from "@jini-ai/diagnostics/tool-audit/repo";
import { createToolGapReader } from "@jini-ai/diagnostics/tool-audit/tool-gaps.repo";
import { TOOL_GAP_AUDIT_ID, decodeToolGapEntry } from "@jini-ai/daemon/tool-audit";
import type { ToolGapReadPort } from "@jini-ai/core/contracts/site/assistant-host-ports";

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

/** @overallScore 100 */
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
