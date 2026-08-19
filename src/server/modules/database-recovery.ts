import { registerAdminDatabaseTimelineRoute } from "../routes/admin/database/timeline.js";
import { registerAdminDatabaseRestorePointsCreateRoute, registerAdminDatabaseRestorePointsListRoute } from "../routes/admin/database/restore-points.js";
import { registerAdminRecoveryRestorePointsListRoute } from "../routes/admin/recovery/restore-points.js";
import { registerAdminRecoveryDisclosureRoute } from "../routes/admin/recovery/disclosure.js";
import { registerAdminRecoveryDeepLinkRoute } from "../routes/admin/recovery/deep-link.js";
import { registerAdminRecoveryStatusRoute } from "../routes/admin/recovery/status.js";
import type { DatabaseRecoveryRouteDeps } from "../routes/admin/database-recovery/deps.js";
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
 * reordering of gates/middleware — but see `routes/admin/database-recovery/deps.ts`'s own header
 * for the explicit disclosure of how `status.ts`'s `core/operation-lock` read (the prior audit's
 * Finding 3 fix) is preserved unchanged by this move.
 *
 * Owns 7 registrations, discovered by reading all 6 source files directly (`database/timeline.ts`,
 * `database/restore-points.ts` [2 registrars], `recovery/restore-points.ts`, `recovery/
 * disclosure.ts`, `recovery/deep-link.ts`, `recovery/status.ts`):
 *  - `registerAdminDatabaseTimelineRoute` (Database's read-first Timeline)
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
export function createDatabaseRecoveryModule(deps: DatabaseRecoveryRouteDeps): ServerModuleHandle {
  return {
    name: "database-recovery",
    registerRoutes: (app) => {
      registerAdminDatabaseTimelineRoute(app, deps);
      registerAdminDatabaseRestorePointsListRoute(app, deps);
      registerAdminDatabaseRestorePointsCreateRoute(app, deps);
      registerAdminRecoveryRestorePointsListRoute(app, deps);
      registerAdminRecoveryDisclosureRoute(app, deps);
      registerAdminRecoveryDeepLinkRoute(app, deps);
      registerAdminRecoveryStatusRoute(app, deps);
    },
  };
}
