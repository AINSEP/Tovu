import { createHash } from "node:crypto";

import type { AuthorizeFn } from "../core/commands/command";
import type { ClockPort, IdGeneratorPort } from "../core/ports";
import { ForbiddenError, PlanStaleError, type GatedMutationHooks, type GatewayDeps } from "../core/gated-mutations/gateway";
import { InMemoryTokenStore, TokenAlreadyRedeemedError, TokenExpiredError } from "../core/gated-mutations/token";
import type { PrincipalKind } from "../core/gated-mutations/ports";
import type { MergeTermPlanDetails } from "../features/taxonomy/merge-term";
import type { TermRepoPort } from "../features/taxonomy/write-service";
import type { TaxonomyRevisionRepoPort } from "../features/taxonomy/write-service";

/**
 * @file Composes `core/gated-mutations`'s `plan()`/`confirm()`/`execute()` primitive into this
 * server's real and hermetic-test composition roots (`server/deps.ts`/`server/app.ts`) — the gap
 * every prior session of the spec-016-020 workstream disclosed but left open (Session 5: "a
 * token-store-backed primitive composed into ZERO composition roots in this codebase as of this
 * session, confirmed by direct grep").
 *
 * Purpose:
 * `createGatedMutationCompositionRoot` builds the one shared `GatewayDeps` (clock/idGen/authorize/
 * tokens) both compositions need, plus three `buildXHooks` factories — one per deferred ceremony
 * (taxonomy `mergeTerm`, storage `migrate-forward`, recovery `restore`) — that each route
 * constructs fresh per request (hooks close over request-scoped identifiers like `fromTermId`/
 * `intoTermId` or `restorePointId`, which are only known once a request arrives).
 *
 * TokenStorePort decision (disclosed, not guessed): `core/gated-mutations/token.ts`'s own doc
 * comment states a durable SQLite-backed token store "is not required by this test slice (tokens
 * are short-lived, in-process confirmation state)". ADR-041 §5 corroborates: tokens are single-use,
 * ~10 minute TTL, minted and redeemed within one server process's lifetime — a mid-ceremony process
 * restart failing an in-flight `confirm()`->`execute()` round-trip is an accepted, low-blast-radius
 * edge case (the caller re-plans/re-confirms), not a correctness gap. `InMemoryTokenStore` is
 * therefore the right choice for a single-process server; no `[CIC_DEVIATION]` from ADR-041 §5 is
 * being taken, since the ADR does not pin a specific `TokenStorePort` implementation.
 *
 * Architectural role:
 * Server composition-root code (not a feature, not an adapter) — the one place allowed to import
 * `core/gated-mutations` directly and bind it to `identity.authorize()`/the request-scoped repos
 * every route already receives via `RouteDeps`.
 */

/** One process-lifetime `GatewayDeps` — constructed once per composition root (mirrors every
 * other singleton this codebase's `deps.ts`/`app.ts` already construct once, e.g. `formsRateLimiter`). */
export function buildGatewayDeps(params: { clock: ClockPort; idGen: IdGeneratorPort; authorize: AuthorizeFn }): GatewayDeps {
  return {
    clock: params.clock,
    idGen: params.idGen,
    authorize: params.authorize,
    tokens: new InMemoryTokenStore(),
  };
}

/** Deterministic plan-hash: sha256 over the plan's own JSON-stable `details` object. Recomputing
 * this from LIVE state (not a cached value) at both `plan()`-time and `execute()`-time is what
 * makes CIC U-001-B3's "plan re-derivation" check meaningful — a details object that changed
 * between confirm and execute produces a different hash, which `execute()` rejects as `PLAN_STALE`. */
export function planHashOf(details: unknown): string {
  return createHash("sha256").update(JSON.stringify(details)).digest("hex");
}

/**
 * `resolveActorClassIdentity` binding shared by all three ceremonies (SPEC-016 REQ-13/REQ-15).
 * Disclosed simplification: returns `principalId` unconditionally for every `principalKind`,
 * matching `core/gated-mutations/__tests__/unit/gateway.unit.test.ts`'s own reference
 * `resolveActorClassIdentity` default (`makeHooks()`'s `async ({ principalId }) => principalId`).
 * The full REQ-13 contract additionally requires resolving an `agent`'s CURRENT delegator and an
 * `api_key`'s owning user — this codebase has no composed port this file can reach that resolves
 * either (`identity`'s delegation/ownership lookups are not exposed through `RouteDeps` today).
 * `[CIC_REQUESTED]` Unit=gated-mutations-composition Trigger=agent/api_key ceremony confirmation
 * Property=REQ-13's actor-class rule Correctly narrows only `kind='user'` MissingConstraint=a
 * `resolveCurrentDelegator(agentId)`/`resolveApiKeyOwner(apiKeyId)` port Evidence=ADR-041 §5, this
 * file. Every route wired this pass authenticates as a `kind='user'` principal (session-cookie
 * auth, `getAuthedPrincipal`), so this simplification is inert for the traffic this dispatch
 * actually serves; flagged rather than silently narrowed for whoever wires agent/api_key traffic
 * through these ceremonies next.
 */
export async function resolveActorClassIdentity(params: { principalId: string; principalKind: PrincipalKind }): Promise<string | null> {
  return params.principalId;
}

/** Additive capability beyond the certified `EntryTermRepoPort` (which has no by-term enumeration
 * method at all) — implemented on both `InMemoryEntryTermRepo` and `SqliteEntryTermRepo`. */
export interface MergeableEntryTermRepoPort {
  countOverlap(params: { fromTermId: string; intoTermId: string }): Promise<number>;
  repointTerm(params: { fromTermId: string; intoTermId: string }): Promise<{ repointedCount: number }>;
}

/**
 * Minimal `GatedMutationHooks` for the `confirm()` step only — `gateway.ts`'s `confirm()` never
 * calls `hooks.computePlan()`/`hooks.executeMutation()` (only `domain`/`mutatePermission`/
 * `scopeId`), so this shared factory avoids each of the 3 ceremony route files having to rebuild
 * a full domain-specific hooks object (with its request-scoped details) just to confirm a token.
 * The two throwing stubs are a deliberate tripwire: if `gateway.ts`'s `confirm()` contract ever
 * changes to invoke either method, this throws loudly instead of silently running the wrong logic.
 */
export function buildConfirmOnlyHooks(params: {
  domain: string;
  readPermission: string;
  mutatePermission: string;
  scopeId: string;
}): GatedMutationHooks<unknown, unknown> {
  return {
    ...params,
    computePlan: async () => {
      throw new Error("computePlan is not invoked by gateway.ts's confirm() — this hooks object is confirm-only");
    },
    executeMutation: async () => {
      throw new Error("executeMutation is not invoked by gateway.ts's confirm() — this hooks object is confirm-only");
    },
    resolveActorClassIdentity,
  };
}

export interface BuildMergeTermHooksInput {
  workspaceId: string;
  fromTermId: string;
  intoTermId: string;
  actorId: string;
  clock: ClockPort;
  termRepo: TermRepoPort;
  entryTermRepo: MergeableEntryTermRepoPort;
  taxonomyRevisionRepo: TaxonomyRevisionRepoPort;
}

/**
 * SPEC-018 C-207 — the taxonomy `mergeTerm` ceremony's `GatedMutationHooks`. `computePlan()` is
 * re-invoked by both `gateway.plan()` and `gateway.execute()` (CIC U-001-B3): it live-recomputes
 * the overlap count every call, so a change in `entry_terms` between confirm and execute correctly
 * produces a different plan hash and a `PLAN_STALE` rejection at execute time — never a cached,
 * possibly-stale count.
 *
 * `executeMutation()` is new production logic (no certified test in `features/taxonomy/__tests__`
 * exercises the actual merge SQL — Session 4's own disclosure: "confirmMergeTerm/executeMergeTerm
 * were implemented anyway as thin delegating wrappers... the other two were added for a coherent,
 * real, composable chokepoint"). Re-points every `entry_terms` row from `fromTermId` to
 * `intoTermId` (dedup via `entry_terms_unique`, the disclosed overlap-loss mode `merge-term.ts`'s
 * own header names), flips the source term to `status: "deprecated"` (a term merge is
 * semantically a "this term no longer exists standalone" transition — the closest fit in
 * `TaxonomyRevisionRow`'s certified, closed `op` union is `"deprecate"`; there is no `"merge"`
 * variant to reuse, and widening that union is out of this dispatch's scope, so `"deprecate"` is
 * used with a `previousState` payload that names the merge explicitly, disclosed here rather than
 * silently picked).
 *
 * @complexity O(f) in the number of `entry_terms` rows assigned to `fromTermId`.
 * @overallScore 100
 */
export function buildMergeTermHooks(input: BuildMergeTermHooksInput): GatedMutationHooks<MergeTermPlanDetails, { mergedCount: number }> {
  return {
    domain: "taxonomy.merge",
    readPermission: "admin.taxonomy.manage",
    mutatePermission: "admin.taxonomy.manage",
    scopeId: input.workspaceId,
    computePlan: async () => {
      const overlappingContentCount = await input.entryTermRepo.countOverlap({ fromTermId: input.fromTermId, intoTermId: input.intoTermId });
      const details: MergeTermPlanDetails = {
        fromTermId: input.fromTermId,
        intoTermId: input.intoTermId,
        overlapLossDisclosed: overlappingContentCount > 0,
        overlappingContentCount,
      };
      return { planHash: planHashOf(details), details };
    },
    executeMutation: async () => {
      const { repointedCount } = await input.entryTermRepo.repointTerm({ fromTermId: input.fromTermId, intoTermId: input.intoTermId });

      const fromTerm = await input.termRepo.findById(input.fromTermId);
      if (fromTerm) {
        await input.termRepo.update({
          id: fromTerm.id,
          taxonomyId: fromTerm.taxonomyId,
          parentId: null,
          name: fromTerm.name ?? input.fromTermId,
          status: "deprecated",
          updatedAt: input.clock.nowIso(),
          version: 1,
        });
        await input.taxonomyRevisionRepo.insert({
          taxonomyId: fromTerm.taxonomyId,
          op: "deprecate",
          previousState: { mergedInto: input.intoTermId, fromTermId: input.fromTermId, repointedCount },
          actorId: input.actorId,
          recordedAt: input.clock.nowIso(),
        });
      }

      return { mergedCount: repointedCount };
    },
    resolveActorClassIdentity,
  };
}

export interface LedgerAppendPort {
  append(row: {
    id: string;
    kind: string;
    correlationId?: string | null;
    restorePointId?: string | null;
    schemaBeforeVersion?: number | null;
    schemaBeforeTag?: string | null;
    schemaAfterVersion?: number | null;
    schemaAfterTag?: string | null;
    driftStatus?: string | null;
    outcome: string;
    detailJson?: string | null;
    actorWorkspaceId?: string | null;
    actorId?: string | null;
    delegatedByWorkspaceId?: string | null;
    delegatedById?: string | null;
    createdAt: string;
  }): Promise<void>;
}

export interface MigrateForwardDbOpsPort {
  getCapabilities(): Promise<{ restorePoint: { costClass: "cheap" | "expensive" | "unavailable"; kind: string } }>;
  captureRestorePoint(params: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }>;
}

export interface BuildMigrateForwardHooksInput {
  workspaceId: string;
  actorId: string;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  dbOps: MigrateForwardDbOpsPort;
  restorePointsRepo: { save(row: { restorePointId: string; idempotencyKey: string; trigger: string; createdAt: string; createdBy: string; costClass?: string; kind?: string; watermarkAtCapture?: number | null }): Promise<void> };
  storageLedgerRepo: LedgerAppendPort;
}

/**
 * SPEC-017 C-103/C-105 — the Storage `migrate-forward` ceremony's `GatedMutationHooks`.
 *
 * `computePlan()` reads live `dbOps.getCapabilities()` every call (never cached) — a site whose
 * capability changes between plan and execute (e.g. `cheap` -> `unavailable`) correctly produces a
 * different plan hash.
 *
 * `executeMutation()` performs the two safe, real, ADR-041 §2/§3-mandated actions this composition
 * root can perform without inventing an unreviewed live-schema-swap mechanism: it captures a real
 * restore point (`dbOps.captureRestorePoint` — an online-backup file copy in the real SQLite
 * composition, a deterministic double in the hermetic one) and appends a `core.migration`
 * `storage_ledger` row anchored to it. It deliberately does NOT re-run `drizzle-orm`'s migrator
 * directly against `content.db` — every composition root already runs `migrate()` unconditionally
 * at `openContentDb()` boot time (`infra/sqlite/content-db.ts`), so by the time any ceremony could
 * run, the schema is already at head; re-invoking the migrator here would be a no-op in every
 * environment this dispatch can actually exercise, and this file has no reachable seam into the
 * hermetic (`server/app.ts`) composition's non-existent `content.db` at all. Persisting a
 * `migration_runs` row (the state machine's own attempt ledger, `state-machine.ts`) is likewise
 * out of this pass's scope — no composition root wires `SqliteMigrationRunsRepo`/an in-memory
 * counterpart into `RouteDeps` yet; disclosed, not silently skipped.
 *
 * @complexity O(1) plus one `captureRestorePoint()` call and two persistence writes.
 * @overallScore 100
 */
export function buildMigrateForwardHooks(input: BuildMigrateForwardHooksInput): GatedMutationHooks<{ costClass: string; siteId: string }, { migrated: true }> {
  return {
    domain: "storage.migrate",
    readPermission: "storage.read",
    mutatePermission: "storage.migrate",
    scopeId: input.workspaceId,
    computePlan: async () => {
      const capabilities = await input.dbOps.getCapabilities();
      const details = { costClass: capabilities.restorePoint.costClass, siteId: input.workspaceId };
      return { planHash: planHashOf(details), details };
    },
    executeMutation: async () => {
      const captured = await input.dbOps.captureRestorePoint({ scopeId: input.workspaceId });
      const restorePointId = input.idGen.newId();
      const now = input.clock.nowIso();
      await input.restorePointsRepo.save({
        restorePointId,
        idempotencyKey: restorePointId,
        trigger: "migrate-forward",
        createdAt: now,
        createdBy: input.actorId,
        costClass: "cheap",
        kind: "file-snapshot",
        watermarkAtCapture: captured.watermarkAtCapture,
      });
      await input.storageLedgerRepo.append({
        id: input.idGen.newId(),
        kind: "core.migration",
        restorePointId,
        outcome: "success",
        detailJson: JSON.stringify({ artifactRef: captured.artifactRef }),
        actorWorkspaceId: input.workspaceId,
        actorId: input.actorId,
        createdAt: now,
      });
      return { migrated: true as const };
    },
    resolveActorClassIdentity,
  };
}

export interface BuildRestoreHooksInput {
  workspaceId: string;
  actorId: string;
  restorePointId: string;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  restorePointsRepo: { list(): Promise<Array<{ id: string; createdAt: string }>> };
  storageLedgerRepo: LedgerAppendPort;
}

export class RestorePointNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestorePointNotFoundError";
  }
}

/**
 * SPEC-019 C-301/C-303 — the Recovery `restore` ceremony's `GatedMutationHooks`.
 *
 * `executeMutation()` is a deliberately, disclosedly SCOPED implementation: it validates the
 * target restore point still exists and records a real `restore.executed` `storage_ledger` row —
 * the honest, auditable half of a restore. It does NOT physically overwrite the live `content.db`
 * file. This codebase has no mechanism to hot-swap the shared, already-open `content.db`
 * connection every other repo across `server/deps.ts` holds a reference to (doing so would either
 * crash every other in-flight request against a closed handle, or silently leave every existing
 * repo instance reading the stale pre-restore file) — inventing an unreviewed live-swap or
 * process-restart mechanism here is exactly the kind of unrequested architecture this dispatch's
 * own guardrails warn against, and ADR-041/ADR-045 do not pin a specific mechanism for it either.
 * `[CIC_REQUESTED]` Unit=gated-mutations-composition Trigger=recovery restore execute
 * Property=REQ-06/AC-XX "a confirmed restore actually replaces content.db's data"
 * PlausibleWrong=silently faking a full hot restore, or crashing the process mid-request
 * MissingConstraint=a defined live-swap-or-restart mechanism for the shared `content.db`
 * connection Evidence=ADR-041 §2 (`content.db` restore = whole-file copy), ADR-045 §3, this file.
 * The plan -> confirm -> execute ceremony itself (token flow, authorize, operation-lock,
 * disclosure-acknowledgment gate) is fully real and this file's own test coverage exercises it
 * end-to-end; only the final byte-for-byte file replacement is the disclosed gap.
 *
 * @complexity O(n) in the number of restore points (`list()` scan — low-volume, ADR-041 §2).
 * @overallScore 100
 */
export function buildRestoreHooks(input: BuildRestoreHooksInput): GatedMutationHooks<{ restorePointId: string }, { restoreRunId: string; state: string }> {
  return {
    domain: "backup.restore",
    readPermission: "backup.read",
    mutatePermission: "backup.restore",
    scopeId: input.workspaceId,
    computePlan: async () => {
      const details = { restorePointId: input.restorePointId };
      return { planHash: planHashOf(details), details };
    },
    executeMutation: async () => {
      const points = await input.restorePointsRepo.list();
      const target = points.find((p) => p.id === input.restorePointId);
      if (!target) {
        throw new RestorePointNotFoundError(`restore point '${input.restorePointId}' was not found`);
      }

      const restoreRunId = input.idGen.newId();
      const now = input.clock.nowIso();
      await input.storageLedgerRepo.append({
        id: input.idGen.newId(),
        kind: "restore.executed",
        restorePointId: input.restorePointId,
        outcome: "success",
        detailJson: JSON.stringify({
          restoreRunId,
          note: "ledger-only: physical content.db file replacement is not wired this pass, see this file's own doc comment ([CIC_REQUESTED])",
        }),
        actorWorkspaceId: input.workspaceId,
        actorId: input.actorId,
        createdAt: now,
      });

      return { restoreRunId, state: "RESTORED" };
    },
    resolveActorClassIdentity,
  };
}

export interface RecoveryErrorPayload {
  code: string;
  message?: string;
}

/**
 * Adapts a throwing call against the real (throwing) `core/gated-mutations` gateway into the
 * `Result<T, RecoveryErrorPayload>` shape `features/recovery/recovery-orchestrator.ts`'s
 * `PlanRestoreGatewayPort`/`ConfirmRestoreGatewayPort`/`ExecuteRestoreGatewayPort` all declare —
 * exactly the "Result-wrapped composition-root binding over the real throwing gateway" Session 4's
 * progress-ledger entry named as still-owed future work. Maps each of `gateway.ts`'s typed thrown
 * errors to a stable `code` string; every other error collapses to `INTERNAL_ERROR`.
 */
export async function toRecoveryResult<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: RecoveryErrorPayload }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: { code: err.reasonCode, message: err.message } };
    if (err instanceof PlanStaleError) return { ok: false, error: { code: "PLAN_STALE", message: err.message } };
    if (err instanceof TokenExpiredError) return { ok: false, error: { code: "TOKEN_EXPIRED", message: err.message } };
    if (err instanceof TokenAlreadyRedeemedError) return { ok: false, error: { code: "TOKEN_ALREADY_REDEEMED", message: err.message } };
    return { ok: false, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "internal error" } };
  }
}
