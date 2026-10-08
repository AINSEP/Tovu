import type { DatabaseRecoveryDeps, RouteDeps } from "#src/server/routes/types";

/**
 * @file Database/recovery read and capture composition contract (ADR-046/SPEC-042).
 *
 * Composes `DatabaseRecoveryDeps` with workspace/authorization/clock and the schema-state
 * introspection port. `clock` is picked alone because these routes do not read `idGen`.
 * See `DatabaseRecoveryDeps` in `server/routes/types.ts` for the group boundary.
 *
 * Recovery status queries the module-level `isOperationInFlight` with `workspaceId`,
 * alongside `dbOps` and `siteStatusRepo`; the operation lock is not a `RouteDeps` field.
 * Migrate-forward and recovery restore have separate gated-mutation ceremonies requiring
 * `gatedMutations.gatewayDeps`, which is outside this read/capture contract.
 */
export type DatabaseRecoveryRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock" | "databaseIntrospection"> &
  DatabaseRecoveryDeps;
