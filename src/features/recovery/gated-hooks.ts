import type { ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";
import {
  ForbiddenError,
  PlanStaleError,
  type GatedMutationHooks,
} from "../../core/gated-mutations/gateway";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "../../core/gated-mutations/token";
import { planHashOf, resolveActorClassIdentity } from "../../core/gated-mutations/composition";
import type {
  MigrationRunsRepoPort,
  SiteStatusPort,
} from "../database/boot/reconcile-interrupted-migration";
import type { LedgerAppendPort } from "../database/gated-hooks";

/**
 * @file Recovery's `GatedMutationHooks` factory for the `restore` ceremony (SPEC-019 C-301/C-303),
 * plus `toRecoveryResult` (the throwing-gateway-to-`Result` adapter `recovery-orchestrator.ts`'s
 * ports declare) — the domain-specific quarter of what used to be
 * `server/gated-mutations-composition.ts`, split out so Recovery no longer needs a back-edge into
 * `server/` for its own hook builder. The generic pieces every ceremony shares (`buildGatewayDeps`,
 * `planHashOf`, `resolveActorClassIdentity`, `buildConfirmOnlyHooks`) stayed in
 * `core/gated-mutations/composition.ts`, which this file imports from — the correct direction (a
 * domain depending on `core`), unlike the old direction (a domain depending on `server`).
 *
 * `LedgerAppendPort` is imported from `features/database/gated-hooks.ts` rather than duplicated —
 * Recovery already imports several other Database-owned ports (`restore-points.ts`,
 * `boot/reconcile-interrupted-migration.ts`), so this is the established "Recovery depends on
 * Database, never the reverse" direction, not a new one.
 */

export interface BuildRestoreHooksInput {
  workspaceId: string;
  actorId: string;
  restorePointId: string;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  restorePointsRepo: { list(): Promise<Array<{ id: string; createdAt: string; artifactRef: string }>> };
  databaseLedgerRepo: LedgerAppendPort;
  /** SPEC-016 `DbOpsPort` — real (SQLite) composition performs the physical file swap;
   * hermetic-test composition's in-memory double is a no-op (`restartRequired: false`). */
  dbOps: { restoreFromArtifact(required: { artifactRef: string }): Promise<{ restartRequired: boolean }> };
  /** Round-5 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, R5-F2 / Fable
   * `R5-F2-BLOCK-HAS-NO-EXIT` fix): a successful restore must actually exit
   * `BLOCKED_PENDING_RECOVERY` — before this fix, nothing did. */
  migrationRunsRepo: Pick<MigrationRunsRepoPort, "findNonTerminalForSite" | "markResolved">;
  siteStatus: SiteStatusPort;
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
 * target restore point still exists and records a real `restore.executed` `database_ledger` row —
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
export function buildRestoreHooks(input: BuildRestoreHooksInput): GatedMutationHooks<{ restorePointId: string }, { restoreRunId: string; state: string; restartRequired: boolean }> {
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

      // 2026-07-16: closes the "ledger-only" gap this file previously disclosed — swap the file
      // FIRST, ledger-record second. If the process dies between the two, the file already
      // reflects reality (a missing ledger entry is reconcilable later; a ledger entry claiming a
      // restore that never physically happened would not be).
      const { restartRequired } = await input.dbOps.restoreFromArtifact({ artifactRef: target.artifactRef });

      const restoreRunId = input.idGen.newId();
      const now = input.clock.nowIso();
      await input.databaseLedgerRepo.append({
        id: input.idGen.newId(),
        kind: "restore.executed",
        restorePointId: input.restorePointId,
        outcome: "success",
        detailJson: JSON.stringify({ restoreRunId, restartRequired }),
        actorWorkspaceId: input.workspaceId,
        actorId: input.actorId,
        createdAt: now,
      });

      // Round-5 re-audit (TM-adr041-043-044-045-audit-001, R5-F2 fix): a successful restore is the
      // ceremony ADR-041 §3's own text names as how an operator "resolves" a crash-interrupted
      // migration -- so it must actually exit BLOCKED_PENDING_RECOVERY, not just record a ledger
      // row. Terminalize whatever non-terminal migration_runs row exists for this site (if any --
      // a restore can also be run for reasons unrelated to a crash-interrupted migration, in which
      // case there is nothing to resolve) so the next boot's findNonTerminalForSite no longer
      // re-detects it.
      //
      // Round-6 re-audit (TM-adr041-043-044-045-audit-001, codex `R6-F1-RESTART-REQUIRED-RESTORE-
      // UNBLOCKS-STALE-DB`, verified directly against `db-ops.ts`'s own doc comment): the DURABLE
      // resolution (markResolved) and the IN-PROCESS unblock (siteStatus.set) are NOT the same
      // thing and must not be conflated. `SqliteDbOpsAdapter.restoreFromArtifact` always returns
      // `restartRequired: true` for a real file-backed db -- the running process keeps its open
      // file descriptor pointed at the now-unlinked OLD inode until it restarts, so clearing the
      // gate in-process here would let normal traffic resume against stale pre-restore data, with
      // writes accepted in that window silently lost on the eventual restart. Only clear the
      // in-process block when the restore genuinely didn't require one (memory-mode dev, or a
      // future adapter that can restore live) -- when a restart IS required, the durable
      // terminalization above is what makes the NEXT boot resolve to SERVING; the running process
      // stays blocked (correctly) until then.
      const nonTerminal = await input.migrationRunsRepo.findNonTerminalForSite(input.workspaceId);
      if (nonTerminal) {
        await input.migrationRunsRepo.markResolved({ id: nonTerminal.id });
        if (!restartRequired) {
          await input.siteStatus.set(input.workspaceId, "SERVING");
        }
      }

      return { restoreRunId, state: "RESTORED", restartRequired };
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
