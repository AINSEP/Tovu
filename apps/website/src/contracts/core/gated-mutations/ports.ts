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
export type { AuthorizeFn } from "@jini-ai/cms/core";

/**
 * A site's restore-point mechanism, evaluated per dialect (SQLite: always cheap file-snapshot;
 * Postgres: dump/blue-green tooling, or an externally-managed PITR system, or nothing at all).
 */
export interface RestoreCapability {
  costClass: "cheap" | "expensive" | "unavailable";
  kind: "file-snapshot" | "logical-dump" | "external";
}

/** Dialect-neutral restore-point capability surface (SPEC-016 C-007). */
export interface DbOpsPort {
  /** Pure, side-effect-free static check of what this site's restore mechanism can do. */
  getCapabilities(): Promise<{ restorePoint: RestoreCapability }>;
  /** Captures a real restore-point artifact, stamped with the watermark value at capture time. */
  captureRestorePoint(required: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }>;
  /**
   * Physically restores the live database from a previously-captured artifact (ADR-045 §3
   * restore ceremony, closing the "ledger-only" disclosed gap). A real (SQLite) adapter performs
   * an atomic file swap and reports `restartRequired: true` — the running process keeps its own
   * open file handle to the now-unlinked old data until it restarts and reopens the path fresh.
   * A test/dev double with no real file to restore into reports `restartRequired: false`.
   */
  restoreFromArtifact(required: { artifactRef: string }): Promise<{ restartRequired: boolean }>;
}

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
