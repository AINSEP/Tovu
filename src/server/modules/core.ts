import { registerHealthRoute, registerHealthzRoute, registerReadyzRoute } from "../routes/ops/health";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-031) — the `core` module: health/readiness routes.
 *
 * Scope note: the ADR's own illustrative sketch lists "auth middleware, shared HTTP setup" as
 * `core.ts` responsibilities too. This slice deliberately does NOT move `requireAdminSession`'s
 * `app.use("/api/admin", ...)` mounting — that line's position relative to every other admin
 * registrar in `app.ts` is order-sensitive in a way health/readyz's 3 standalone routes are not,
 * and moving it is a larger, separately-verifiable follow-up, not bundled into this first slice.
 */
export function createCoreModule(): ServerModuleHandle {
  return {
    name: "core",
    registerRoutes: (app) => {
      registerHealthRoute(app);
      registerHealthzRoute(app);
      registerReadyzRoute(app);
    },
  };
}
