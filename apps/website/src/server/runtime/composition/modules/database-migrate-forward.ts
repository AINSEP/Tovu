import type { Express } from "express";

import {
  databaseMigrateForwardConfirmRoute, databaseMigrateForwardExecuteRoute, databaseMigrateForwardPlanRoute,
  type DatabaseMigrateForwardConfirmRouteDeps, type DatabaseMigrateForwardExecuteRouteDeps, type DatabaseMigrateForwardPlanRouteDeps,
} from "@jini-ai/cms/admin-http/routes/database/migrate-forward";
import { executeMigrateForward, MigrationAlreadyInFlightError, RestorePointUnavailableError } from "@jini-ai/db/recovery/migrate-forward-execute";
import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { authorizeForHooks, confirm, execute, plan, type GatedMutationHooks } from "#src/contracts/core/gated-mutations/gateway";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { buildMigrateForwardHooks } from "#src/features/database/gated-hooks";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-041 §4 / ADR-043 — host side of `POST /api/admin/v1/database/migrate-forward/{plan,confirm,execute}`.
 * The HTTP rules (body checks, AUD-001 pre-authorization order, the error → status ladder) live in
 * the Jini specs (`@jini-ai/cms/admin-http/routes/database/migrate-forward`); this module binds each
 * step to the gated-mutation gateway, the migrate-forward hooks, the shared operation lock and
 * `@jini-ai/db/recovery/migrate-forward-execute`. Every `deps.*` field is read when a request runs,
 * as the hand-written routes did, so a later swap on `deps` reaches the mounted route.
 */

const MIGRATE_PERMISSION = "database.migrate";
/** `getAuthedPrincipal`'s own diagnosis, so the redacted incident log still names the miswiring. */
const MISSING_PRINCIPAL = "getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route";
// The hand-written routes called `sendAdminFailure` with no options: the route-derived 500 copy.
const MIGRATE_MOUNT = { authorization: "direct" } as const;
const MIGRATE_FORWARD_ERRORS = { restorePointUnavailable: RestorePointUnavailableError, migrationInFlight: MigrationAlreadyInFlightError };

/** The migrate hooks every plan/execute call builds the same way. */
function migrateHooksFor({ deps, actorId }: { deps: RouteDeps; actorId: string }, _optional: Record<string, never> = {}) {
  return buildMigrateForwardHooks({
    workspaceId: deps.workspaceId, actorId, clock: deps.clock, idGen: deps.idGen,
    dbOps: deps.dbOps, restorePointsRepo: deps.restorePointsRepo, databaseLedgerRepo: deps.databaseLedgerRepo,
  });
}

/** `database.migrate`'s instance-scoped confirm-only hooks (shared by confirm and the execute pre-check). */
function confirmOnlyMigrateHooks({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}) {
  return buildConfirmOnlyHooks({ domain: MIGRATE_PERMISSION, readPermission: "database.read", mutatePermission: MIGRATE_PERMISSION, scopeId: deps.workspaceId, scopeKind: "instance" });
}

function planStep({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): DatabaseMigrateForwardPlanRouteDeps["planMigrateForward"] {
  return ({ principalId }) => plan({
    deps: deps.gatedMutations.gatewayDeps, principalId, principalKind: "user",
    hooks: migrateHooksFor({ deps, actorId: principalId }) as unknown as GatedMutationHooks<unknown, unknown>,
  });
}

function confirmStep({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): DatabaseMigrateForwardConfirmRouteDeps["confirmMigrateForward"] {
  return ({ principalId, planId, planHash }) => confirm({
    deps: deps.gatedMutations.gatewayDeps, principalId, principalKind: "user", hooks: confirmOnlyMigrateHooks({ deps }), planId, planHash,
  });
}

/** Execute: builds the hooks, reads the live cost class, then runs the locked execution. */
function executeStep({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): DatabaseMigrateForwardExecuteRouteDeps["executeMigrateForward"] {
  return async ({ principalId, confirmationToken }) => {
    const hooks = migrateHooksFor({ deps, actorId: principalId });
    const capabilities = await deps.dbOps.getCapabilities();
    return executeMigrateForward({
      siteId: deps.workspaceId,
      confirmationToken,
      costClass: capabilities.restorePoint.costClass,
      operationLock: { acquireOperationLock, releaseOperationLock },
      gatewayExecute: () => execute({
        deps: deps.gatedMutations.gatewayDeps, principalId, principalKind: "user",
        hooks: hooks as unknown as GatedMutationHooks<unknown, { migrated: true }>, confirmationToken,
      }),
    });
  };
}

/** The step's own deps plus the error classes, missing-session copy and the two port fields (getters,
 * so a later swap of `deps.workspaceId`/`deps.authorize` still reaches the mounted route).
 * @complexity O(1).
 */
function withPorts<T extends object>({ deps, own }: { deps: RouteDeps; own: T }, _optional: Record<string, never> = {}) {
  return Object.defineProperties({ ...own, migrateForwardErrors: MIGRATE_FORWARD_ERRORS, missingPrincipalMessage: MISSING_PRINCIPAL }, {
    workspaceId: { enumerable: true, get: () => deps.workspaceId },
    authorize: { enumerable: true, get: () => deps.authorize },
  }) as T & { migrateForwardErrors: typeof MIGRATE_FORWARD_ERRORS; missingPrincipalMessage: string; workspaceId: string; authorize: RouteDeps["authorize"] };
}

/** Mounts the three ceremony specs. The gateway authorizes inside each step, so the mounts are
 * `"direct"` (no publishing-credential override was ever consulted) and never call `authorize`. */
export function registerAdminDatabaseMigrateForwardRoutes({ app, deps }: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ app, spec: databaseMigrateForwardPlanRoute, deps: withPorts({ deps, own: { planMigrateForward: planStep({ deps }) } }) }, MIGRATE_MOUNT);
  mountAdminJsonRoute({ app, spec: databaseMigrateForwardConfirmRoute, deps: withPorts({ deps, own: { confirmMigrateForward: confirmStep({ deps }) } }) }, MIGRATE_MOUNT);
  mountAdminJsonRoute({ app, spec: databaseMigrateForwardExecuteRoute, deps: withPorts({ deps, own: {
    executeMigrateForward: executeStep({ deps }),
    authorizeMigrateForward: ({ principalId, permission }: { principalId: string; permission: string }) =>
      authorizeForHooks({ deps: deps.gatedMutations.gatewayDeps, hooks: confirmOnlyMigrateHooks({ deps }), required: { principalId, permission } }),
  } }) }, MIGRATE_MOUNT);
}
