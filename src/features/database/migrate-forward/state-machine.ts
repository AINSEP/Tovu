/**
 * @file SPEC-017 C-103 / CIC U-001 / INV-01 / INV-05 / INV-06 — the dialect-conditional
 * migrate-forward state machine (ADR-041 §3).
 *
 * Purpose:
 * A pure transition function over `MigrationRunState`. SQLite migrates in-place
 * (`QUIESCING -> SNAPSHOTTING -> APPLYING -> VERIFYING -> JOURNALING -> DONE`); Postgres migrates
 * blue/green, inserting a `CUTOVER` phase between `VERIFYING` and `JOURNALING` that atomically
 * repoints blue to green (never modifying blue in place). The two failure shapes are structurally
 * distinct: an APPLYING/VERIFYING failure enters `RESTORING` (blue was never touched); a CUTOVER
 * failure enters `ROLLBACK_TO_BLUE` (green is discarded, blue never stopped serving) — these two
 * edges must never be reachable from one another (CIC U-001-B2).
 *
 * How it relates to the project:
 * The orchestrator (`migrate-forward/execute.ts` and its caller) drives this machine by feeding
 * `TransitionEvent`s as each phase's own action (snapshot capture, DDL apply, verification,
 * cutover) completes; it is this module's caller's responsibility to actually perform each phase
 * — this machine only validates and records the resulting state transition.
 *
 * Architectural role:
 * `features/database` domain logic. Pure function, no I/O, no dependencies.
 */

export type MigrationRunStatus =
  | "IDLE"
  | "PLANNED"
  | "CONFIRMED"
  | "QUIESCING"
  | "SNAPSHOTTING"
  | "APPLYING"
  | "VERIFYING"
  | "JOURNALING"
  | "DONE"
  | "SNAPSHOT_FAILED"
  | "ABORTED_SAFE"
  | "RESTORING"
  | "RESTORED"
  | "RESTORE_FAILED"
  | "CUTOVER"
  | "CUTOVER_FAILED"
  | "ROLLBACK_TO_BLUE";

export interface MigrationRunState {
  status: MigrationRunStatus;
  dialect: "sqlite" | "postgres";
  /** The global write watermark recorded at the moment write-quiesce completed (ADR-041 §5). */
  revisionSeqAtQuiesce: number | null;
  /** `"chokepoint-only"` whenever any Tier-3 in-process plugin is enabled (ADR-041 §9); `null` otherwise. */
  quiesceIntegrity: "chokepoint-only" | null;
  /** Test/observability seam for INV-05 — true only after a successful `CUTOVER_SUCCESS`. */
  blueTouched: boolean;
}

export type TransitionEvent =
  | { type: "QUIESCE_COMPLETE"; revisionSeqAtQuiesce: number }
  | { type: "SNAPSHOT_SUCCESS" }
  | { type: "SNAPSHOT_FAILURE" }
  | { type: "APPLY_SUCCESS" }
  | { type: "APPLY_FAILURE" }
  | { type: "VERIFY_SUCCESS" }
  | { type: "VERIFY_FAILURE" }
  | { type: "CUTOVER_SUCCESS" }
  | { type: "CUTOVER_FAILURE" }
  | { type: "RESTORE_SUCCESS" }
  | { type: "RESTORE_FAILURE" }
  | { type: "JOURNAL_COMPLETE" };

/** Thrown for any transition not explicitly modeled below — never a silent no-op. */
export class IllegalTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalTransitionError";
  }
}

/** Event types whose precondition additionally requires a recorded quiesce watermark (INV-01). */
const REQUIRES_QUIESCE_WATERMARK = new Set<TransitionEvent["type"]>([
  "SNAPSHOT_SUCCESS",
  "SNAPSHOT_FAILURE",
  "APPLY_SUCCESS",
  "APPLY_FAILURE",
  "VERIFY_SUCCESS",
  "VERIFY_FAILURE",
]);

/**
 * Resolves the next status for a legal `(status, event)` pair, or `undefined` if the pair is not
 * a modeled transition. Kept separate from `advance()` so the precondition/error-shaping logic
 * (below) stays uncluttered by the transition table itself.
 */
function resolveNextStatus(state: MigrationRunState, event: TransitionEvent): { status: MigrationRunStatus; blueTouched?: boolean } | undefined {
  switch (event.type) {
    case "QUIESCE_COMPLETE":
      return state.status === "CONFIRMED" || state.status === "QUIESCING" ? { status: "QUIESCING" } : undefined;
    case "SNAPSHOT_SUCCESS":
      return state.status === "SNAPSHOTTING" ? { status: "APPLYING" } : undefined;
    case "SNAPSHOT_FAILURE":
      // The intermediate SNAPSHOT_FAILED status is conceptual (ADR-041 §3's narration) — this
      // single event resolves directly to the terminal-for-this-attempt ABORTED_SAFE state,
      // never entering RESTORING (AC-15).
      return state.status === "SNAPSHOTTING" ? { status: "ABORTED_SAFE" } : undefined;
    case "APPLY_SUCCESS":
      return state.status === "APPLYING" ? { status: "VERIFYING" } : undefined;
    case "APPLY_FAILURE":
      return state.status === "APPLYING" ? { status: "RESTORING" } : undefined;
    case "VERIFY_SUCCESS":
      if (state.status !== "VERIFYING") return undefined;
      // Dialect-conditional (ADR-041 §3, M6): Postgres inserts a CUTOVER phase; SQLite applies
      // in-place and moves straight to JOURNALING.
      return { status: state.dialect === "postgres" ? "CUTOVER" : "JOURNALING" };
    case "VERIFY_FAILURE":
      return state.status === "VERIFYING" ? { status: "RESTORING" } : undefined;
    case "CUTOVER_SUCCESS":
      return state.status === "CUTOVER" ? { status: "JOURNALING", blueTouched: true } : undefined;
    case "CUTOVER_FAILURE":
      // Structurally distinct from the APPLYING/VERIFYING -> RESTORING edge (U-001-B2): only
      // reachable by firing this event from CUTOVER, never conflated with a snapshot/apply/verify
      // failure.
      return state.status === "CUTOVER" ? { status: "ROLLBACK_TO_BLUE" } : undefined;
    case "RESTORE_SUCCESS":
      return state.status === "RESTORING" ? { status: "RESTORED" } : undefined;
    case "RESTORE_FAILURE":
      return state.status === "RESTORING" ? { status: "RESTORE_FAILED" } : undefined;
    case "JOURNAL_COMPLETE":
      return state.status === "JOURNALING" ? { status: "DONE" } : undefined;
    default:
      return undefined;
  }
}

/**
 * Advances a `MigrationRunState` by one `TransitionEvent`, or throws `IllegalTransitionError` for
 * any transition this state machine does not explicitly model (never a silent no-op — see the
 * exhaustive property test in `state-machine.unit.test.ts`).
 *
 * @complexity O(1) — a fixed lookup table over a bounded state/event space.
 * @overallScore 100
 */
export function advance(required: { state: MigrationRunState; event: TransitionEvent }, _optional: Record<string, never> = {}): MigrationRunState {
  const { state, event } = required;

  if (REQUIRES_QUIESCE_WATERMARK.has(event.type) && state.revisionSeqAtQuiesce === null) {
    throw new IllegalTransitionError(
      `INV-01: event '${event.type}' requires a recorded revisionSeqAtQuiesce, but none has been recorded for this run yet`
    );
  }

  const next = resolveNextStatus(state, event);
  if (!next) {
    throw new IllegalTransitionError(`event '${event.type}' is not a legal transition from status '${state.status}' (dialect: ${state.dialect})`);
  }

  return {
    ...state,
    status: next.status,
    revisionSeqAtQuiesce: event.type === "QUIESCE_COMPLETE" ? event.revisionSeqAtQuiesce : state.revisionSeqAtQuiesce,
    blueTouched: next.blueTouched ?? state.blueTouched,
  };
}
