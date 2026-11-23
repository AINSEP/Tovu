import type { Express } from "express";

import {
  recoveryRestoreConfirmRoute, recoveryRestoreExecuteRoute, recoveryRestorePlanRoute,
  type RecoveryRestoreConfirmRouteDeps, type RecoveryRestoreExecuteRouteDeps, type RecoveryRestorePlanRouteDeps,
} from "@jini-ai/cms/admin-http/routes/recovery/restore";
import { confirmRestore, executeRestore, planRestore } from "@jini-ai/db/recovery/recovery-orchestrator";
import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { authorizeForHooks, confirm, execute, plan } from "#src/contracts/core/gated-mutations/gateway";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { buildRestoreHooks, toRecoveryResult } from "#src/features/recovery/gated-hooks";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file SPEC-019 C-301/C-302/C-303 — host side of `POST /api/admin/v1/recovery/restore/{plan,confirm,execute}`
 * (ADR-045 §3's restore ceremony). The HTTP rules live in the Jini specs
 * (`@jini-ai/cms/admin-http/routes/recovery/restore`); this module binds each step to
 * `@jini-ai/db/recovery/recovery-orchestrator`'s `planRestore`/`confirmRestore`/`executeRestore`
 * wrappers over the `Result`-wrapped gateway binding and the real `core/operation-lock.ts` primitive
 * those wrappers were built to receive from a composition root (see `features/recovery/gated-hooks.ts`'s
 * `buildRestoreHooks` doc comment for the disclosed scope boundary). Every `deps.*` field is read
 * when a request runs, as the hand-written routes did, so a later swap on `deps` reaches the route.
 */

const RESTORE_PERMISSION = "backup.restore";
/** `getAuthedPrincipal`'s own diagnosis, so the redacted incident log still names the miswiring. */
const MISSING_PRINCIPAL = "getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route";
const RESTORE_MOUNT = { failure: { operation: "routes/recovery/restore", code: "INTERNAL_ERROR" }, authorization: "direct" } as const;

/** `backup.restore`'s instance-scoped confirm-only hooks (shared by confirm and the execute pre-check). */
function confirmOnlyRestoreHooks({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}) {
  return buildConfirmOnlyHooks({ domain: RESTORE_PERMISSION, readPermission: "backup.read", mutatePermission: RESTORE_PERMISSION, scopeId: deps.workspaceId, scopeKind: "instance" });
}

/** The restore hooks every plan/execute call builds the same way. */
function restoreHooksFor({ deps, actorId, restorePointId }: { deps: RouteDeps; actorId: string; restorePointId: string }, _optional: Record<string, never> = {}) {
  return buildRestoreHooks({
    workspaceId: deps.workspaceId, actorId, restorePointId, clock: deps.clock, idGen: deps.idGen,
    restorePointsRepo: deps.restorePointsRepo, databaseLedgerRepo: deps.databaseLedgerRepo, dbOps: deps.dbOps,
    migrationRunsRepo: deps.migrationRunsRepo, siteStatus: deps.siteStatusRepo,
  });
}

/** Plan step: the orchestrator's capability gate, then the gateway plan over the restore hooks. */
function planStep({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): RecoveryRestorePlanRouteDeps["planRestore"] {
  return ({ principalId, restorePointId }) => planRestore({
    deps: {
      dbOps: { getCapabilities: async () => {
        const capabilities = await deps.dbOps.getCapabilities();
        return { costClass: capabilities.restorePoint.costClass, restorePointKind: capabilities.restorePoint.kind };
      } },
      gateway: { plan: (input) => toRecoveryResult({ run: () => plan({
        deps: deps.gatedMutations.gatewayDeps, principalId: input.principalId, principalKind: input.principalKind,
        hooks: restoreHooksFor({ deps, actorId: principalId, restorePointId: input.restorePointId }) as never,
      }) }, {}) },
    },
    input: { principalId, principalKind: "user", restorePointId },
  });
}

/** Confirm step: the gateway confirm over the confirm-only hooks, answering just the token. */
function confirmStep({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): RecoveryRestoreConfirmRouteDeps["confirmRestore"] {
  return ({ principalId, planId, planHash, disclosureAcknowledged }) => confirmRestore({
    deps: { gateway: { confirm: (input) => toRecoveryResult({ run: async () => {
      const record = await confirm({
        deps: deps.gatedMutations.gatewayDeps, principalId, principalKind: "user",
        hooks: confirmOnlyRestoreHooks({ deps }), planId: input.planId, planHash: input.planHash,
      });
      return { confirmationToken: record.confirmationToken };
    } }, {}) } },
    input: { principalId, principalKind: "user", planId, planHash, disclosureAcknowledged },
  });
}

/** Execute step: the orchestrator takes the shared operation lock, then the gateway executes. */
function executeStep({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): RecoveryRestoreExecuteRouteDeps["executeRestore"] {
  return ({ principalId, confirmationToken, restorePointId }) => {
    const hooks = restoreHooksFor({ deps, actorId: principalId, restorePointId });
    return executeRestore({
      deps: {
        gateway: { execute: (input) => toRecoveryResult({ run: async () => execute({
          deps: deps.gatedMutations.gatewayDeps, principalId, principalKind: "user", hooks: hooks as never, confirmationToken: input.confirmationToken,
        }) }, {}) },
        operationLock: { acquireOperationLock, releaseOperationLock },
        clock: deps.clock,
      },
      input: { principalId, principalKind: "user", confirmationToken, siteId: deps.workspaceId },
    });
  };
}

/** The step's own deps plus the two port fields and the missing-session copy; the port fields are
 * getters so a later swap of `deps.workspaceId`/`deps.authorize` still reaches the mounted route.
 * @complexity O(1).
 */
function withPorts<T extends object>({ deps, own }: { deps: RouteDeps; own: T }, _optional: Record<string, never> = {}) {
  return Object.defineProperties({ ...own, missingPrincipalMessage: MISSING_PRINCIPAL }, {
    workspaceId: { enumerable: true, get: () => deps.workspaceId },
    authorize: { enumerable: true, get: () => deps.authorize },
  }) as T & { missingPrincipalMessage: string; workspaceId: string; authorize: RouteDeps["authorize"] };
}

/** Mounts the three ceremony specs. The gateway authorizes inside each step, so the mounts are
 * `"direct"` (no publishing-credential override was ever consulted) and never call `authorize`. */
export function registerAdminRecoveryRestoreRoutes({ app, deps }: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ app, spec: recoveryRestorePlanRoute, deps: withPorts({ deps, own: { planRestore: planStep({ deps }) } }) }, RESTORE_MOUNT);
  mountAdminJsonRoute({ app, spec: recoveryRestoreConfirmRoute, deps: withPorts({ deps, own: { confirmRestore: confirmStep({ deps }) } }) }, RESTORE_MOUNT);
  mountAdminJsonRoute({ app, spec: recoveryRestoreExecuteRoute, deps: withPorts({ deps, own: {
    executeRestore: executeStep({ deps }),
    authorizeRestoreExecution: ({ principalId, permission }: { principalId: string; permission: string }) =>
      authorizeForHooks({ deps: deps.gatedMutations.gatewayDeps, hooks: confirmOnlyRestoreHooks({ deps }), required: { principalId, permission } }),
  } }) }, RESTORE_MOUNT);
}
