import type { UUID } from "@jini-ai/cms/core";

/**
 * @file Port contracts for the `gated-mutations` package (SPEC-016, ADR-041 §5).
 *
 * Purpose:
 * Dependency-inversion seam for the plan→confirm→execute gateway (`gateway.ts`), the
 * transaction-scoped watermark (`watermark.ts`), and the dialect-neutral restore-point
 * capability surface (`db-ops.ts` adapters under `src/platform/db/*`).
 *
 * Interfaces and types only — no feature logic.
 */

/**
 * The principal classes a gated mutation can be driven by. Deliberately narrower than
 * `identity.PrincipalKind` (which also has `"system"`) — kept local so `core/gated-mutations`
 * never imports `identity` (same "kept generic to avoid inverting the dependency direction"
 * rule `core/commands/command.ts`'s own `AuthorizeFn` doc comment documents).
 *
 * `"publish_key"` is a publishing installation pushing content into this one over the
 * publish-trust handshake (`features/publish-trust/`). It is listed here so a gated ceremony can
 * RECORD what actually drove it: before this member existed, `routes/publish-content/import.ts`
 * passed the literal `"user"` for every caller, so an automated cross-site publish was written
 * into the audit trail as a human. Adding a member widens nothing — the only behavioral branch on
 * this type is `gateway.ts`'s `principalKind === "agent"` confirm refusal, which a new member does
 * not reach — and every authorization decision still runs through `AuthorizeFn`.
 */
export type PrincipalKind = "user" | "agent" | "api_key" | "publish_key";

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
 * The instance-scope counterpart to `AuthorizeFn` — deliberately has no `workspaceId` param.
 * `db/schema.ts`'s RBAC tables (`principals`/`roles`/`policies`/`policy_permissions`/...) are all
 * `workspace_id NOT NULL`, so `AuthorizeFn`'s underlying evaluator (`@jini-ai/cms/identity`'s
 * `authorize()`) can only ever resolve a principal within one specific workspace: passing it any
 * `workspaceId` value for an instance-wide mutation (one that touches every workspace in
 * `content.db` at once, e.g. a whole-database migration) either matches no principal (nobody can
 * ever approve it) or matches a real single workspace (a workspace-scoped admin can approve an
 * operation whose blast radius crosses every tenant — an authorization bypass). This type exists
 * so `GatedMutationHooks.scopeKind: "instance"` (`gateway.ts`) routes to a genuinely separate
 * evaluator instead of overloading the workspace-scoped one with a value it was never designed to
 * accept — the same "separate global surface, not an overloaded scope column" shape
 * `setting_values_global`/`setting_values_workspace` already use in `db/schema.ts`.
 */
export type InstanceAuthorizeFn = (params: {
  principalId: UUID;
  permission: string;
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
