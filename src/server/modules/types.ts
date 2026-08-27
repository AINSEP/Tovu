import type { Express } from "express";

import type { BootModule } from "../boot-lifecycle.js";

/**
 * @file ADR-046 Phase 3 (SPEC-031) — the `ServerModule` convention.
 *
 * Purpose:
 * A module receives only the narrow, typed dependencies it needs (its own factory's parameter
 * type — never a shared generic deps type, and never the full `RouteDeps` service locator) and
 * returns this common handle shape. `registerRoutes`/`start` are both optional since a given
 * module may own only routes (no subscriptions), only subscriptions (no new routes), or both.
 *
 * This is an APPLICATION-COMPOSITION convention, not a core port — it has no meaning outside
 * `src/server/`, is never imported by `src/contracts/core/**` or feature/domain code, and is not a generic
 * IoC container: modules are composed by ordinary typed function calls in `bootstrap.ts`/`app.ts`,
 * nothing here does reflection or runtime service lookup.
 */
export interface ServerModuleHandle {
  name: string;
  /** Registers this module's HTTP routes, if any, at the point `app.ts` calls it (route order is still owned by the caller). */
  registerRoutes?: (app: Express) => void;
  /** Starts this module's subscriptions/workers, if any. Called once, at boot. */
  start?: () => void;
  /** Optional readiness participant, folded into the SAME `runBootLifecycle()` call as every other boot module (ADR-046 Phase 2). */
  bootModule?: BootModule;
}
