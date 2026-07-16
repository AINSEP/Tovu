import type { ClockPort } from "./ports";

/**
 * @file CIC U-001 (SPEC-019 `critical-internal-constraints.md`) — site-wide gated-operation
 * mutual exclusion (C-309; REQ-13, INV-03; GOV-ADR-002).
 *
 * Purpose:
 * The single, shared primitive both `features/storage` (SPEC-017, migrate-forward) and
 * `features/recovery` (SPEC-019, restore) MUST consult before starting a gated operation. Two
 * domains racing to mutate the same site's `content.db` must never both be "in flight" — the
 * primitive tracks in-flight state per `siteId` only, never per-domain, so it cannot be defeated
 * by two domain-local checks that happen to look similar (U-001-B1).
 *
 * How it relates to the project:
 * `executeMigrateForward` and `executeRestore` both call `acquireOperationLock` as the provably
 * first side-effecting step of their own orchestration (U-001-ORD1), and `releaseOperationLock`
 * once the operation concludes (success or failure).
 *
 * Architectural role:
 * Core primitive. In-process only (module-singleton registry) — a site's operations are already
 * serialized to a single process by `content.db`'s own single-writer model; this primitive adds
 * the cross-domain intent-level guard on top of that.
 */

export interface OperationLockHandle {
  siteId: string;
  operationKind: string;
  /** ISO-8601 UTC. */
  acquiredAt: string;
}

export interface OperationLockError {
  code: "OPERATION_IN_FLIGHT";
  message: string;
}

export type AcquireOperationLockResult =
  | { ok: true; value: OperationLockHandle }
  | { ok: false; error: OperationLockError };

/** Module-singleton in-flight registry — one entry per `siteId` (CIC U-001-B1). */
const activeLocksBySiteId = new Map<string, OperationLockHandle>();

/**
 * Atomic check-and-set (U-001-B2): the presence check and the registry write happen in the same
 * synchronous span with no intervening `await`, so concurrent callers on Node's single-threaded
 * event loop (see the cross-domain property tests) cannot race a read-then-write gap — exactly
 * one caller ever observes an empty slot for a given `siteId`.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export async function acquireOperationLock(
  required: { deps: { clock: ClockPort }; input: { siteId: string; operationKind: string } },
  _optional: Record<string, never> = {}
): Promise<AcquireOperationLockResult> {
  const { deps, input } = required;

  if (activeLocksBySiteId.has(input.siteId)) {
    return {
      ok: false,
      error: {
        code: "OPERATION_IN_FLIGHT",
        message: `an operation is already in flight for site '${input.siteId}'`,
      },
    };
  }

  const handle: OperationLockHandle = {
    siteId: input.siteId,
    operationKind: input.operationKind,
    acquiredAt: deps.clock.nowIso(),
  };
  activeLocksBySiteId.set(input.siteId, handle);
  return { ok: true, value: handle };
}

/**
 * Frees `input.siteId`'s lock. Idempotent — releasing a site with no held lock is a no-op, never
 * an error.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export async function releaseOperationLock(
  required: { deps: { clock: ClockPort }; input: { siteId: string; handle: OperationLockHandle } },
  _optional: Record<string, never> = {}
): Promise<void> {
  activeLocksBySiteId.delete(required.input.siteId);
}
