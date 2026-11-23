import { adminDatabaseTimelineRoute } from "@jini-ai/cms/admin-http/routes/database/timeline";
import { adminDatabaseRestorePointsCreateRoute, adminDatabaseRestorePointsListRoute } from "@jini-ai/cms/admin-http/routes/database/restore-points";
import { adminDatabaseSchemaStateRoute } from "@jini-ai/cms/admin-http/routes/database/schema-state";
import { createRestorePoint, getTimeline, listRestorePoints, RestorePointUnavailableError, ValidationError } from "@jini-ai/db/tools";
import type { FailureOptions } from "#src/server/inbound/shared/admin-failure";
import { recoveryRestorePointsListRoute } from "@jini-ai/cms/admin-http/routes/recovery/restore-points";
import { recoveryDisclosureRoute } from "@jini-ai/cms/admin-http/routes/recovery/disclosure";
import { recoveryDeepLinkRoute } from "@jini-ai/cms/admin-http/routes/recovery/deep-link";
import { mountJsonRoute, type JsonRouteSpec } from "@jini-ai/http-kit";
import type { Express } from "express";
import { createAdminJsonRoutePorts, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { registerAdminRecoveryStatusRoute } from "#src/server/inbound/admin-http/routes/recovery/status";
import type { DatabaseRecoveryRouteDeps } from "#src/server/inbound/admin-http/routes/database-recovery/deps";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — the `database-recovery` server module (ADR-041
 * Database Timeline + ADR-045 Recovery).
 *
 * SCOPE NOTE (disclosed — extra-scrutiny domain, per SPEC-042's own Scope Note): this domain was
 * the subject of an extensive multi-round external audit earlier this session
 * (`TM-adr041-043-044-045-audit-001`, 7 rounds, converged PASS 9.2/10), including a real bug
 * (`R6-F1`) in a prior refactor of this exact composition wiring. This module is a narrower,
 * purely additive `Pick`-type extraction — same registrar function bodies, no logic change, no
 * reordering of gates/middleware — but see `apps/website/src/server/inbound/admin-http/routes/database-recovery/deps.ts`'s own header
 * for the explicit disclosure of how `status.ts`'s `core/operation-lock` read (the prior audit's
 * Finding 3 fix) is preserved unchanged by this move.
 *
 * Owns 8 registrations (7 originally, discovered by reading all 6 source files directly —
 * `database/timeline.ts`, `database/restore-points.ts` [2 registrars], `recovery/restore-points.ts`,
 * `recovery/disclosure.ts`, `recovery/deep-link.ts`, `recovery/status.ts` — plus `database/
 * schema-state.ts`, added 2026-08-24):
 *  - `registerAdminDatabaseTimelineRoute` (Database's read-first Timeline)
 *  - `registerAdminDatabaseSchemaStateRoute` (2026-08-24, ADR-041 §3 — Database's drift status;
 *    the 8th registration, added after this header's original count. It is the first consumer of
 *    `databaseIntrospection`, which `apps/website/src/server/inbound/admin-http/routes/database-recovery/deps.ts` had excluded from its
 *    narrow `Pick` precisely because nothing here read it — see that file's own 2026-08-24 note.
 *    Read-only: it reports drift, and deliberately offers no repair action. Ordering is
 *    irrelevant for the same reason the note below gives — `/api/admin/v1/database/schema-state`
 *    is a fixed path no other registered layer can match.)
 *  - `registerAdminDatabaseRestorePointsListRoute` / `registerAdminDatabaseRestorePointsCreateRoute`
 *  - `registerAdminRecoveryRestorePointsListRoute` (Recovery's own restore-points list view —
 *    NOT named in the SPEC-042 requirement text's 6-registrar list, but real: confirmed present
 *    in `app.ts`'s prior inline registration block and matching the spec's own "7 registrations"
 *    count; omitting it would have silently dropped a live registration from the composition)
 *  - `registerAdminRecoveryDisclosureRoute` / `registerAdminRecoveryDeepLinkRoute` /
 *    `registerAdminRecoveryStatusRoute`
 *
 * Deliberately NOT moved: `registerAdminDatabaseMigrateForwardRoutes` / `registerAdminRecoveryRestoreRoutes`
 * (the 2 gated-mutation ceremonies sharing `core/gated-mutations` construction with taxonomy's
 * `mergeTerm`, deliberately left inline since SPEC-031 — same non-goal as every prior slice).
 *
 * Ordering note (disclosed): in `app.ts`, the database 3 registrars and the recovery 4 registrars
 * were previously split into two non-contiguous blocks (the content-types/entries block and the
 * `taxonomy` module call sat between them). This module consolidates all 7 into one call site, at
 * the position the database block used to occupy. This is safe: none of these 7 routes' fixed
 * paths (`/api/admin/v1/database/...`, `/api/admin/v1/recovery/...`) ever overlap any path
 * registered by content-types/entries/taxonomy, so no routing precedence is affected — Express
 * only cares about registration order when two layers could match the same request, which never
 * happens here. See SPEC-042 for the full disclosure.
 */
/** Mount one Recovery spec behind the admin ports with direct authorization (these routes always used
 * `authorizeDirectOrRespond`, never the publish-credential override) and the same `sendAdminFailure`
 * options the hand-written route passed.
 * The workspace port is dropped on purpose: these paths carry no `:workspaceId` and the hand-written
 * routes never ran `rejectForeignWorkspace`, so the admin ports' mount-path check would 404 every call.
 * @complexity O(1) setup; per request as `createAdminJsonRoutePorts`.
 */
function mountRecoveryRoute<Input, Output, Deps>(
  required: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps; operation: string },
  _optional: Record<string, never> = {},
): void {
  const { workspace: _noMountPathWorkspace, ...ports } = createAdminJsonRoutePorts({ failure: { operation: required.operation, code: "INTERNAL_ERROR" }, authorization: "direct" });
  mountJsonRoute<Input, Output, Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app: required.app, spec: { ...required.spec, ports }, deps: required.deps });
}

/** A live view of the named fields plus the two port fields, read per request rather than copied at
 * registration: the hand-written routes read `deps.*` inside the handler, so a later swap of a field
 * (as the route tests do with `authorize` and the watermark source) must still reach the mounted route.
 * @complexity O(keys) setup; O(1) per read.
 */
function requestTimeDeps<K extends keyof DatabaseRecoveryRouteDeps>(
  required: { deps: DatabaseRecoveryRouteDeps; keys: readonly K[] },
  _optional: Record<string, never> = {},
): Pick<DatabaseRecoveryRouteDeps, K> & AdminJsonRoutePortDeps {
  const view = {} as Pick<DatabaseRecoveryRouteDeps, K> & AdminJsonRoutePortDeps;
  for (const key of [...required.keys, "workspaceId", "authorize"] as const) {
    Object.defineProperty(view, key, { enumerable: true, get: () => required.deps[key] });
  }
  return view;
}

/** `GET /api/admin/v1/recovery/restore-points` (Jini spec), gated by `backup.read`. */
export function registerAdminRecoveryRestorePointsListRoute({ app, deps }: { app: Express; deps: DatabaseRecoveryRouteDeps }, _optional: Record<string, never> = {}): void {
  mountRecoveryRoute({ app, spec: recoveryRestorePointsListRoute, deps: requestTimeDeps({ deps, keys: ["restorePointsRepo"] }), operation: "routes/recovery/restore-points" });
}

/** `POST /api/admin/v1/recovery/disclosure` (Jini spec), gated by `backup.read`. */
export function registerAdminRecoveryDisclosureRoute({ app, deps }: { app: Express; deps: DatabaseRecoveryRouteDeps }, _optional: Record<string, never> = {}): void {
  mountRecoveryRoute({ app, spec: recoveryDisclosureRoute, deps: requestTimeDeps({ deps, keys: ["disclosureWatermarkSource"] }), operation: "routes/recovery/disclosure" });
}

/** `POST /api/admin/v1/recovery/deep-link` (Jini spec), gated by `backup.read`. */
export function registerAdminRecoveryDeepLinkRoute({ app, deps }: { app: Express; deps: DatabaseRecoveryRouteDeps }, _optional: Record<string, never> = {}): void {
  mountRecoveryRoute({ app, spec: recoveryDeepLinkRoute, deps: requestTimeDeps({ deps, keys: ["deepLinkRestorePointLookup"] }), operation: "routes/recovery/deep-link" });
}

/** Mount one Database spec behind the admin ports, like `mountRecoveryRoute` but with the route's own
 * `sendAdminFailure` options — the Timeline route passed none, so its 500 keeps the route-derived copy.
 * Direct authorization and no workspace port, for the same reasons `mountRecoveryRoute` gives.
 * @complexity O(1) setup; per request as `createAdminJsonRoutePorts`.
 */
function mountDatabaseRoute<Input, Output, Deps>(
  required: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps },
  optional: { failure?: FailureOptions } = {},
): void {
  const { workspace: _noMountPathWorkspace, ...ports } = createAdminJsonRoutePorts({ failure: optional.failure, authorization: "direct" });
  mountJsonRoute<Input, Output, Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app: required.app, spec: { ...required.spec, ports }, deps: required.deps });
}

const RESTORE_POINTS_FAILURE: FailureOptions = { operation: "routes/database/restore-points", code: "INTERNAL_ERROR" };

/** `GET /api/admin/v1/database/timeline` (Jini spec), gated by `database.read`. Every field is a
 * getter so a later swap on `deps` (as the route tests do) still reaches the mounted route. */
export function registerAdminDatabaseTimelineRoute({ app, deps }: { app: Express; deps: DatabaseRecoveryRouteDeps }, _optional: Record<string, never> = {}): void {
  mountDatabaseRoute({ app, spec: adminDatabaseTimelineRoute, deps: {
    get databaseLedgerRepo() { return deps.databaseLedgerRepo; }, getTimeline,
    get workspaceId() { return deps.workspaceId; }, get authorize() { return deps.authorize; },
  } });
}

/** `GET /api/admin/v1/database/schema-state` (Jini spec), gated by `database.read`. */
export function registerAdminDatabaseSchemaStateRoute({ app, deps }: { app: Express; deps: DatabaseRecoveryRouteDeps }, _optional: Record<string, never> = {}): void {
  mountDatabaseRoute({ app, spec: adminDatabaseSchemaStateRoute, deps: {
    get databaseIntrospection() { return deps.databaseIntrospection; },
    get workspaceId() { return deps.workspaceId; }, get authorize() { return deps.authorize; },
  } }, { failure: { operation: "routes/database/schema-state", code: "INTERNAL_ERROR" } });
}

/** `GET /api/admin/v1/database/restore-points` (Jini spec), gated by `database.read`. */
export function registerAdminDatabaseRestorePointsListRoute({ app, deps }: { app: Express; deps: DatabaseRecoveryRouteDeps }, _optional: Record<string, never> = {}): void {
  mountDatabaseRoute({ app, spec: adminDatabaseRestorePointsListRoute, deps: {
    get restorePointsRepo() { return deps.restorePointsRepo; }, listRestorePoints,
    get workspaceId() { return deps.workspaceId; }, get authorize() { return deps.authorize; },
  } }, { failure: RESTORE_POINTS_FAILURE });
}

/** `POST /api/admin/v1/database/restore-points` (Jini spec, 201), gated by `backup.create`. */
export function registerAdminDatabaseRestorePointsCreateRoute({ app, deps }: { app: Express; deps: DatabaseRecoveryRouteDeps }, _optional: Record<string, never> = {}): void {
  mountDatabaseRoute({ app, spec: adminDatabaseRestorePointsCreateRoute, deps: {
    get clock() { return deps.clock; }, get dbOps() { return deps.dbOps; }, get restorePointsRepo() { return deps.restorePointsRepo; },
    createRestorePoint, restorePointErrors: { unavailable: RestorePointUnavailableError, validation: ValidationError },
    get workspaceId() { return deps.workspaceId; }, get authorize() { return deps.authorize; },
  } }, { failure: RESTORE_POINTS_FAILURE });
}

export function createDatabaseRecoveryModule(deps: DatabaseRecoveryRouteDeps): ServerModuleHandle {
  return {
    name: "database-recovery",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminDatabaseTimelineRoute({ app, deps });
      registerAdminDatabaseSchemaStateRoute({ app, deps });
      registerAdminDatabaseRestorePointsListRoute({ app, deps });
      registerAdminDatabaseRestorePointsCreateRoute({ app, deps });
      registerAdminRecoveryRestorePointsListRoute({ app, deps });
      registerAdminRecoveryDisclosureRoute({ app, deps });
      registerAdminRecoveryDeepLinkRoute({ app, deps });
      registerAdminRecoveryStatusRoute({ app, deps });
    },
  };
}
