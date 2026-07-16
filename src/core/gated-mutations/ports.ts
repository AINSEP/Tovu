import type { UUID } from "../ports";

/**
 * @file Port contracts for the `gated-mutations` package (SPEC-016, ADR-041 §5).
 *
 * Purpose:
 * Dependency-inversion seam for the plan→confirm→execute gateway (`gateway.ts`), the
 * transaction-scoped watermark (`watermark.ts`), and the dialect-neutral restore-point
 * capability surface (`db-ops.ts` adapters under `src/infra/*`).
 *
 * Interfaces and types only — no feature logic.
 */

/**
 * The three principal classes a gated mutation can be driven by. Deliberately narrower than
 * `identity.PrincipalKind` (which also has `"system"`) — kept local so `core/gated-mutations`
 * never imports `identity` (same "kept generic to avoid inverting the dependency direction"
 * rule `core/commands/command.ts`'s own `AuthorizeFn` doc comment documents).
 */
export type PrincipalKind = "user" | "agent" | "api_key";

/**
 * The shape of the SPEC-006 `authorize()` gate. Structurally identical to
 * `core/commands/command.ts`'s `AuthorizeFn` — redeclared locally (not imported) for the same
 * decoupling reason that file's own doc comment gives: composition roots bind a closure over
 * the real `identity.authorize()` and pass it in, so this package never depends on `identity`.
 */
export type AuthorizeFn = (params: {
  principalId: UUID;
  permission: string;
  workspaceId: UUID;
  entityType?: string;
  entityId?: UUID;
}) => Promise<{ allowed: boolean; reason: string }>;

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
