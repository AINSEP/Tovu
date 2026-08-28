/**
 * @file Vocabulary for the durable agent tool-attempt audit trail.
 *
 * Purpose:
 * `@jini-ai/daemon`'s `ToolExecutor` keeps its audit records in an in-process `Map` and mints them
 * only after authorization resolves, so two categories of attempt leave no trace at all: an unknown
 * `toolId` (it throws before the record exists) and an authorization that throws. Everything else
 * it does record is lost on restart. This package is the durable counterpart Tovu writes itself.
 *
 * How it relates to the project:
 * `assistant/tool-executor-audit.ts` wraps the real `ToolExecutor` and appends through the
 * {@link ToolAttemptAuditSink} port defined here; `repo.sqlite.ts` persists into `content.db`'s
 * `agent_tool_attempts`. This module is what keeps the two decoupled — the decorator has no
 * knowledge of SQLite, and the tests drive it through `repo.memory.ts`.
 *
 * What this is NOT: the record of a mutation. `content_type_revisions` already holds actor
 * provenance for every successful content-type write and remains authoritative for that. Execution
 * telemetry must never be read as if it proved a write happened.
 *
 * Architectural role:
 * `features/tool-audit` domain vocabulary. No dependencies.
 */

/**
 * The lifecycle phases an attempt can record.
 *
 * The first six mirror `ToolExecutor`'s own `ToolExecutionPhase`/result statuses so the two can be
 * correlated. `unknown-tool` is Tovu's own addition, for the case Jini cannot report because it
 * throws before creating a record.
 */
export const TOOL_ATTEMPT_PHASES = [
  "requested",
  "completed",
  "denied",
  "confirmation-denied",
  "timed-out",
  "cancelled",
  "failed",
  "unknown-tool",
] as const;

export type ToolAttemptPhase = (typeof TOOL_ATTEMPT_PHASES)[number];

/** One appended row. `executionId` is null when the attempt failed before Jini minted one. */
export interface ToolAttemptEvent {
  /** Tovu's own correlation id, minted before authorization runs, so every phase of one attempt joins. */
  attemptId: string;
  /** Jini's `ToolExecutionResult.executionId`, when the attempt got far enough to have one. */
  executionId: string | null;
  workspaceId: string;
  runId: string;
  toolId: string;
  principalId: string;
  phase: ToolAttemptPhase;
  /** ISO-8601 timestamp. */
  at: string;
  /**
   * Redacted metadata only — never raw input. Carries things like the input's top-level key names
   * or an error's class, so a reader can tell attempts apart without the payload being retained.
   */
  detail?: string | null;
}

/**
 * The append-only port the executor decorator writes through.
 *
 * `append` returns `void` rather than a `Result`, and implementations must not throw: this is
 * observation, not a gate. An audit failure must never convert into a failed tool call — see
 * `assistant/tool-executor-audit.ts`, which is what enforces that, and the test that pins it.
 */
export interface ToolAttemptAuditSink {
  append(event: ToolAttemptEvent): Promise<void>;
}
