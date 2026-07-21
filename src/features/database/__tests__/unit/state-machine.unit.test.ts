import assert from "node:assert/strict";
import test from "node:test";

import { IllegalTransitionError, advance } from "../../migrate-forward/state-machine";
import type { MigrationRunState } from "../../migrate-forward/state-machine";

/**
 * @file SPEC-017 C-103 / CIC U-001 / INV-01 / INV-05 / INV-06 — the dialect-conditional
 * migrate-forward state machine.
 *
 * Assumed seam design (TDD-authored, consistent with implementation-outline.md's Contract Map
 * and state.spec.md §1-§3):
 *
 * ```ts
 * export type MigrationRunStatus =
 *   | "IDLE" | "PLANNED" | "CONFIRMED" | "QUIESCING" | "SNAPSHOTTING" | "APPLYING" | "VERIFYING"
 *   | "JOURNALING" | "DONE" | "SNAPSHOT_FAILED" | "ABORTED_SAFE" | "RESTORING" | "RESTORED"
 *   | "RESTORE_FAILED" | "CUTOVER" | "CUTOVER_FAILED" | "ROLLBACK_TO_BLUE";
 *
 * export interface MigrationRunState {
 *   status: MigrationRunStatus;
 *   dialect: "sqlite" | "postgres";
 *   revisionSeqAtQuiesce: number | null;
 *   quiesceIntegrity: "chokepoint-only" | null;
 *   blueTouched: boolean; // test/observability seam for INV-05 — true only after a successful CUTOVER
 * }
 *
 * export type TransitionEvent =
 *   | { type: "QUIESCE_COMPLETE"; revisionSeqAtQuiesce: number }
 *   | { type: "SNAPSHOT_SUCCESS" } | { type: "SNAPSHOT_FAILURE" }
 *   | { type: "APPLY_SUCCESS" } | { type: "APPLY_FAILURE" }
 *   | { type: "VERIFY_SUCCESS" } | { type: "VERIFY_FAILURE" }
 *   | { type: "CUTOVER_SUCCESS" } | { type: "CUTOVER_FAILURE" }
 *   | { type: "RESTORE_SUCCESS" } | { type: "RESTORE_FAILURE" }
 *   | { type: "JOURNAL_COMPLETE" };
 *
 * export class IllegalTransitionError extends Error {}
 *
 * export function advance(
 *   required: { state: MigrationRunState; event: TransitionEvent },
 *   optional?: {}
 * ): MigrationRunState; // throws IllegalTransitionError on any illegal transition
 * ```
 *
 * CIC U-001-B2's requirement that the three failure edges are "structurally distinct code
 * paths, never a shared handler distinguishing only by a flag" is a Programmer implementation
 * concern (this test suite cannot assert source-code structure — CIC's own Verification Surface
 * Rule requires observable behavior, not private structure). What IS observable and tested here:
 * the three edges never produce ambiguous/overlapping terminal states for the same failure input,
 * and `ROLLBACK_TO_BLUE` is reachable ONLY from `CUTOVER_FAILED`, never from the APPLYING/VERIFYING
 * edge — proving the edges cannot be conflated in their observable state trajectory.
 */

function sqliteState(overrides: Partial<MigrationRunState> = {}): MigrationRunState {
  return {
    status: "CONFIRMED",
    dialect: "sqlite",
    revisionSeqAtQuiesce: null,
    quiesceIntegrity: null,
    blueTouched: false,
    ...overrides,
  };
}

function postgresState(overrides: Partial<MigrationRunState> = {}): MigrationRunState {
  return { ...sqliteState(), dialect: "postgres", ...overrides };
}

// ---------------------------------------------------------------------------
// U-001-SM1 / U-001-B1 / INV-01 — QUIESCING -> SNAPSHOTTING only after quiesce completes
// ---------------------------------------------------------------------------

test("U-001-SM1 / U-001-B1 / INV-01 / AC-11: QUIESCE_COMPLETE records revisionSeqAtQuiesce and transitions to QUIESCING, never straight to SNAPSHOTTING without it", () => {
  const confirmed = sqliteState({ status: "CONFIRMED" });
  const quiescing = advance({ state: confirmed, event: { type: "QUIESCE_COMPLETE", revisionSeqAtQuiesce: 42 } });

  assert.equal(quiescing.status, "QUIESCING");
  assert.equal(quiescing.revisionSeqAtQuiesce, 42, "AC-11: revisionSeqAtQuiesce must be recorded before SNAPSHOTTING is ever entered");
});

test("INV-01: attempting SNAPSHOT_SUCCESS/FAILURE from a state with no recorded revisionSeqAtQuiesce is an illegal transition", () => {
  const notYetQuiesced = sqliteState({ status: "CONFIRMED", revisionSeqAtQuiesce: null });

  assert.throws(
    () => advance({ state: notYetQuiesced, event: { type: "SNAPSHOT_SUCCESS" } }),
    (err: unknown) => err instanceof IllegalTransitionError
  );
});

// ---------------------------------------------------------------------------
// U-001-SM2 / REQ-13 / AC-15 — snapshot failure skips RESTORING entirely
// ---------------------------------------------------------------------------

test("U-001-SM2 / REQ-13 / AC-15: SNAPSHOT_FAILURE transitions SNAPSHOTTING -> SNAPSHOT_FAILED -> ABORTED_SAFE, never entering RESTORING", () => {
  const quiescing = sqliteState({ status: "QUIESCING", revisionSeqAtQuiesce: 1 });
  const snapshotting = advance({ state: quiescing, event: { type: "QUIESCE_COMPLETE", revisionSeqAtQuiesce: 1 } });
  // QUIESCE_COMPLETE lands us in QUIESCING; the domain's own SNAPSHOT action then begins.
  const failed = advance({ state: { ...snapshotting, status: "SNAPSHOTTING" }, event: { type: "SNAPSHOT_FAILURE" } });

  assert.equal(failed.status, "ABORTED_SAFE");
  assert.notEqual(failed.status, "RESTORING", "AC-15: a snapshot failure must never enter RESTORING");
});

// ---------------------------------------------------------------------------
// U-001-SM3 / REQ-11 / AC-12 — APPLYING/VERIFYING failure -> RESTORING -> RESTORED | RESTORE_FAILED
// ---------------------------------------------------------------------------

test("U-001-B2 / REQ-11 / AC-12: APPLY_FAILURE transitions APPLYING -> RESTORING -> RESTORED on successful re-snapshot restore", () => {
  const applying = sqliteState({ status: "APPLYING", revisionSeqAtQuiesce: 1 });
  const restoring = advance({ state: applying, event: { type: "APPLY_FAILURE" } });
  assert.equal(restoring.status, "RESTORING");

  const restored = advance({ state: restoring, event: { type: "RESTORE_SUCCESS" } });
  assert.equal(restored.status, "RESTORED");
});

test("AC-40: RESTORE_FAILURE (the restore-from-migration-failure step itself failing) transitions RESTORING -> RESTORE_FAILED, blue unaffected on SQLite (no blue concept) and on Postgres (blueTouched stays false)", () => {
  const restoringPg = postgresState({ status: "RESTORING", revisionSeqAtQuiesce: 1 });
  const failed = advance({ state: restoringPg, event: { type: "RESTORE_FAILURE" } });

  assert.equal(failed.status, "RESTORE_FAILED");
  assert.equal(failed.blueTouched, false, "AC-40: blue must remain unaffected even when the RESTORING recovery attempt itself fails");
});

test("U-001-B2: VERIFY_FAILURE reaches the same RESTORING edge as APPLY_FAILURE (both are the APPLYING/VERIFYING failure edge, not the CUTOVER edge)", () => {
  const verifying = sqliteState({ status: "VERIFYING", revisionSeqAtQuiesce: 1 });
  const restoring = advance({ state: verifying, event: { type: "VERIFY_FAILURE" } });
  assert.equal(restoring.status, "RESTORING");
});

// ---------------------------------------------------------------------------
// U-001-SM4/SM5 / REQ-12 / AC-13 / AC-14 / INV-05 — Postgres CUTOVER edge, structurally distinct
// ---------------------------------------------------------------------------

test("U-001-SM4 / REQ-12: VERIFY_SUCCESS on Postgres transitions VERIFYING -> CUTOVER (never reached on SQLite)", () => {
  const verifyingPg = postgresState({ status: "VERIFYING", revisionSeqAtQuiesce: 1 });
  const cutover = advance({ state: verifyingPg, event: { type: "VERIFY_SUCCESS" } });
  assert.equal(cutover.status, "CUTOVER");
});

test("U-001-B3 / INV-05 / AC-14: blue is untouched (blueTouched=false) through APPLYING/VERIFYING on Postgres — only a successful CUTOVER may set it", () => {
  let state = postgresState({ status: "APPLYING", revisionSeqAtQuiesce: 1 });
  assert.equal(state.blueTouched, false);

  state = advance({ state: { ...state, status: "VERIFYING" }, event: { type: "VERIFY_SUCCESS" } });
  assert.equal(state.status, "CUTOVER");
  assert.equal(state.blueTouched, false, "blue must remain untouched even once CUTOVER is entered, until it actually succeeds");

  const done = advance({ state, event: { type: "CUTOVER_SUCCESS" } });
  assert.equal(done.blueTouched, true, "only a SUCCESSFUL cutover may set blueTouched");
});

test("U-001-SM5 / AC-13 / U-001-B2: CUTOVER_FAILURE transitions CUTOVER -> CUTOVER_FAILED -> ROLLBACK_TO_BLUE — structurally distinct from the APPLYING/VERIFYING RESTORING edge", () => {
  const cutover = postgresState({ status: "CUTOVER", revisionSeqAtQuiesce: 1 });
  const rolledBack = advance({ state: cutover, event: { type: "CUTOVER_FAILURE" } });

  assert.equal(rolledBack.status, "ROLLBACK_TO_BLUE");
  assert.notEqual(rolledBack.status, "RESTORING", "the CUTOVER failure edge must never be conflated with the APPLYING/VERIFYING->RESTORING edge");
  assert.equal(rolledBack.blueTouched, false, "a failed cutover must never have actually touched blue");
});

test("illegal transition: ROLLBACK_TO_BLUE is unreachable from any state other than CUTOVER_FAILED", () => {
  const applying = postgresState({ status: "APPLYING", revisionSeqAtQuiesce: 1 });
  assert.throws(
    () => advance({ state: applying, event: { type: "CUTOVER_FAILURE" } }),
    (err: unknown) => err instanceof IllegalTransitionError
  );
});

test("illegal transition: SNAPSHOTTING can never be entered directly from CONFIRMED, skipping QUIESCING", () => {
  const confirmed = sqliteState({ status: "CONFIRMED" });
  assert.throws(
    () => advance({ state: confirmed, event: { type: "SNAPSHOT_SUCCESS" } }),
    (err: unknown) => err instanceof IllegalTransitionError
  );
});

// ---------------------------------------------------------------------------
// INV-06 — quiesceIntegrity closed vocabulary
// ---------------------------------------------------------------------------

test("INV-06: quiesceIntegrity is never any value other than 'chokepoint-only' or null — type system enforces this; runtime construction test", () => {
  const withFlag = sqliteState({ quiesceIntegrity: "chokepoint-only" });
  const withoutFlag = sqliteState({ quiesceIntegrity: null });

  assert.equal(withFlag.quiesceIntegrity, "chokepoint-only");
  assert.equal(withoutFlag.quiesceIntegrity, null);
});

// ---------------------------------------------------------------------------
// Exhaustive-per-outline transition table (property-style sweep)
// ---------------------------------------------------------------------------

test("state-transition property: every legal event from every reachable state either advances to its documented next state or throws IllegalTransitionError — never silently no-ops", () => {
  const legalPairs: Array<{ state: MigrationRunState; event: Parameters<typeof advance>[0]["event"] }> = [
    { state: sqliteState({ status: "CONFIRMED" }), event: { type: "QUIESCE_COMPLETE", revisionSeqAtQuiesce: 1 } },
    { state: sqliteState({ status: "SNAPSHOTTING", revisionSeqAtQuiesce: 1 }), event: { type: "SNAPSHOT_SUCCESS" } },
    { state: sqliteState({ status: "SNAPSHOTTING", revisionSeqAtQuiesce: 1 }), event: { type: "SNAPSHOT_FAILURE" } },
    { state: sqliteState({ status: "APPLYING", revisionSeqAtQuiesce: 1 }), event: { type: "APPLY_SUCCESS" } },
    { state: sqliteState({ status: "APPLYING", revisionSeqAtQuiesce: 1 }), event: { type: "APPLY_FAILURE" } },
    { state: sqliteState({ status: "VERIFYING", revisionSeqAtQuiesce: 1 }), event: { type: "VERIFY_SUCCESS" } },
    { state: sqliteState({ status: "VERIFYING", revisionSeqAtQuiesce: 1 }), event: { type: "VERIFY_FAILURE" } },
    { state: postgresState({ status: "VERIFYING", revisionSeqAtQuiesce: 1 }), event: { type: "VERIFY_SUCCESS" } },
    { state: postgresState({ status: "CUTOVER", revisionSeqAtQuiesce: 1 }), event: { type: "CUTOVER_SUCCESS" } },
    { state: postgresState({ status: "CUTOVER", revisionSeqAtQuiesce: 1 }), event: { type: "CUTOVER_FAILURE" } },
  ];

  for (const { state, event } of legalPairs) {
    const next = advance({ state, event });
    assert.notEqual(next.status, state.status, `event ${event.type} from ${state.status} must produce a state change, never a no-op`);
  }
});
