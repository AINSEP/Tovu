/**
 * @file SPEC-016 / ADR-041: Tovu's dialect-neutral restore and watermark mirror contracts.
 * Generic approval and composite actor contracts are owned by Jini core/gated-mutations.
 * Actor workspace matching remains INV-06; read-time orphan tolerance and reconciliation
 * remain each dependent domain's responsibility (INV-07).
 */

// Jini owns generic approval contracts; the rest of this file is Tovu's DB/restore boundary.
// Generic scope separation: Jini/packages/core/src/gated-mutations/ports.ts (SPEC-016, ADR-041).
// publish_key must remain publish_key in the audit trail, rather than masquerade as a human user;
// composition binds its real identity/authorization evaluator without expanding approval privileges.
export type { PrincipalKind, InstanceAuthorizeFn } from "@jini-ai/core/gated-mutations";

/**
 * A cheap, possibly-stale read-side mirror of the authoritative watermark value (SPEC-016 U-004).
 * `staleness: "unrefreshable"` is the signal disclosure surfaces must check before rendering any
 * precise count (REQ-05) — it is set whenever `content.db` could not be opened to reconcile from.
 */
export interface MirrorStorePort {
  readonly value: number;
  readonly staleness: "fresh" | "unrefreshable";
  set(value: number): Promise<void>;
  markUnrefreshable(): Promise<void>;
}
