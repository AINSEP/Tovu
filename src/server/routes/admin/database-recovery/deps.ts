import type { Express } from "express";

import type { DatabaseRecoveryDeps, RouteDeps } from "../../types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — narrow `RouteDeps` slice for the
 * `database-recovery` server module.
 *
 * Purpose:
 * The 7 plain database/recovery registrars (`database/timeline.ts`'s list, `database/
 * restore-points.ts`'s list+create, `recovery/restore-points.ts`'s list, `recovery/
 * disclosure.ts`, `recovery/deep-link.ts`, `recovery/status.ts`) only ever read
 * `workspaceId`/`authorize`/`clock` plus 6 database/recovery-owned ports — a genuine narrowing
 * (mirrors `routes/admin/taxonomy/deps.ts`'s identical rationale), not a `RouteDeps`-widening
 * extension. Determined by reading all 6 files directly.
 *
 * `status.ts`'s `operationInFlight` field (SCOPE NOTE — extra scrutiny domain): `status.ts`
 * imports `isOperationInFlight` directly from `core/operation-lock` (a module-level function,
 * not a constructor-injected port) and calls it with `deps.workspaceId`. That direct import is
 * untouched by this narrowing — `core/operation-lock` is core infrastructure, never itself a
 * `RouteDeps` field, so there is nothing to add to this Pick for it. What this type MUST keep is
 * `workspaceId` (the siteId `isOperationInFlight` is queried with) and `dbOps`/`siteStatusRepo`
 * (`status.ts`'s other two live reads) — all three are present below. See `status.ts`'s own file
 * header for the full ADR-041/043/044/045 re-audit (TM-adr041-043-044-045-audit-001, Finding 3)
 * history this route's `operationInFlight` field closes.
 *
 * `registerAdminDatabaseMigrateForwardRoutes`/`registerAdminRecoveryRestoreRoutes` (the 2
 * gated-mutation ceremonies) are deliberately NOT covered by this type — they also need
 * `gatedMutations.gatewayDeps`, and stay entangled with the shared `core/gated-mutations` gateway
 * construction the taxonomy `mergeTerm` ceremony uses too. See `modules/database-recovery.ts`'s
 * file header for the full disclosure.
 *
 * 2026-08-18 (`RouteDeps` decomposition Slice 4): the 6 database/recovery-owned ports below are now
 * their own named `DatabaseRecoveryDeps` interface in `routes/types.ts`, so this composes it
 * directly instead of re-listing the keys via a second `Pick`; `workspaceId`/`authorize` (from
 * `IdentityDeps`) and `clock` (from `ClockDeps`, picked individually since `idGen` is never read
 * here) round out the same set as before, byte-for-byte.
 */
export type DatabaseRecoveryRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock"> & DatabaseRecoveryDeps;

export type DatabaseRecoveryRouteRegistrar = (app: Express, deps: DatabaseRecoveryRouteDeps) => void;
