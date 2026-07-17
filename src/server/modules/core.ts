import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { registerHealthRoute, registerHealthzRoute, registerReadyzRoute } from "../routes/ops/health";
import type { RouteDeps } from "../routes/types";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-039) — the `core` module: health/readiness routes, login/logout/me,
 * and the `/api/admin` session gate.
 *
 * Scope note (SPEC-039, correcting SPEC-031's deferral): SPEC-031 and SPEC-034 both declined to
 * move `requireAdminSession`'s `app.use("/api/admin", ...)` mount here, because
 * `registerAuthRoutes` registers `POST /api/admin/v1/auth/login` — an `/api/admin`-prefixed route
 * — and Express matches middleware/routes strictly in registration order. If the session gate
 * mounted before login registered, login would 401 against its own gate and nobody could ever
 * obtain a session (total lockout, no recovery path). The user decision recorded in SPEC-039
 * resolves this by keeping BOTH concerns — the login/logout/me route registration AND the gate
 * mount — inside this single `registerRoutes(app)` call, in the same relative order every other
 * module already has full control over its own internal registration order. That preserves the
 * load-bearing property (login registers before the gate mounts) without widening
 * `ServerModuleHandle` itself to support cross-module ordered/interleaved registration, which was
 * explicitly rejected as higher blast radius for this one edge case.
 *
 * This is the one module in this repo's `ServerModuleHandle` convention that takes the full
 * `RouteDeps` bag rather than a narrow `Pick` — `requireAdminSession`/`registerAuthRoutes`
 * themselves are typed against full `RouteDeps` upstream in `middleware/dev-auth.ts`, and
 * narrowing that file's own signature is a separate, out-of-scope concern (SPEC-039 Non-Goals).
 */
export function createCoreModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "core",
    registerRoutes: (app) => {
      registerHealthRoute(app);
      registerHealthzRoute(app);
      registerReadyzRoute(app);

      // Order is load-bearing: `registerAuthRoutes` registers the ungated
      // `POST /api/admin/v1/auth/login` (plus logout/me) route BEFORE the
      // gate below mounts, so login itself is never caught by its own gate.
      registerAuthRoutes(app, deps);
      app.use("/api/admin", requireAdminSession(deps));
    },
  };
}
