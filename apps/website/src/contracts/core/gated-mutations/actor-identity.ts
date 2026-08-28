/**
 * @file SPEC-016 C-006 / REQ-16–REQ-18 / INV-06 / INV-07 — composite actor-identity population.
 *
 * Purpose:
 * Every gated-mutation-adjacent row that records "who did this" carries a composite
 * `(actorWorkspaceId, actorId)` pair, plus an optional `(delegatedByWorkspaceId, delegatedById)`
 * pair identifying the human/owning-user behind an agent or api_key action. This module is the
 * single population helper for that shape (REQ-16/REQ-17) and its workspace-match guard (INV-06).
 *
 * How it relates to the project:
 * A pure population helper — no I/O itself (C-006's Effect Boundary). Callers perform the actual
 * row write with the object this returns. Read-time orphan tolerance (INV-07) is each dependent
 * domain's own read-path/reconciliation-sweep concern, not this package's.
 *
 * Architectural role:
 * Core primitive shared by every domain that records actor references on gated-mutation rows.
 */

/** Thrown when a composite actor-identity pair's workspace does not match the referencing row's workspace (INV-06). */
export class WorkspaceMismatchError extends Error {}

/**
 * Populates a composite actor-identity reference, rejecting any workspace mismatch fail-fast
 * (INV-06) rather than persisting a cross-workspace reference silently.
 *
 * @complexity O(1), pure — no I/O, no DB-level FK metadata (AC-24/REQ-17).
 * @overallScore 100
 */
export function appendActorReference(
  required: {
    referencingRowWorkspaceId: string;
    actorWorkspaceId: string;
    actorId: string;
    delegatedByWorkspaceId?: string | null;
    delegatedById?: string | null;
  },
  _optional: Record<string, never> = {}
): {
  actorWorkspaceId: string;
  actorId: string;
  delegatedByWorkspaceId: string | null;
  delegatedById: string | null;
} {
  const { referencingRowWorkspaceId, actorWorkspaceId, actorId, delegatedByWorkspaceId, delegatedById } = required;

  if (actorWorkspaceId !== referencingRowWorkspaceId) {
    throw new WorkspaceMismatchError(
      `actor workspace '${actorWorkspaceId}' does not match referencing row workspace '${referencingRowWorkspaceId}'`
    );
  }
  if (delegatedByWorkspaceId != null && delegatedByWorkspaceId !== referencingRowWorkspaceId) {
    throw new WorkspaceMismatchError(
      `delegator workspace '${delegatedByWorkspaceId}' does not match referencing row workspace '${referencingRowWorkspaceId}'`
    );
  }

  return {
    actorWorkspaceId,
    actorId,
    delegatedByWorkspaceId: delegatedByWorkspaceId ?? null,
    delegatedById: delegatedById ?? null,
  };
}
