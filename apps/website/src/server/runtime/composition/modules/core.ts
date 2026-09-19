import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { requirePublishTrust } from "#src/server/inbound/admin-http/publish-trust-auth";
import { registerHealthRoute, registerHealthzRoute, registerReadyzRoute } from "#src/server/inbound/public-http/routes/ops/health";
import { registerPublishTrustHandshakeRoutes } from "#src/server/inbound/public-http/routes/publish-trust/handshake";
import { InMemoryPublishChallengeStore } from "#src/features/publish-trust/challenge";
import { deriveInstallationId } from "#src/features/publish-trust/keys";
import { createPublishTrustGrantResolver } from "../publish-trust-grants.js";
import { createPublishTrustRevocationReader } from "../publish-trust-revocations.js";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

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
 * `RouteDeps` bag rather than a narrow `Pick` — `registerAuthRoutes` is still typed against full
 * `RouteDeps` upstream in `inbound/admin-http/dev-auth.ts` (this module's own `deps` param has to stay a
 * full `RouteDeps` on its account). `requireAdminSession` itself was narrowed to `SessionAuthDeps`
 * (2026-08-18, first slice of the `RouteDeps` decomposition — see `routes/types.ts`'s
 * `ClockDeps`/`IdentityDeps` doc); passing the full `deps` below into it still works unchanged
 * because `RouteDeps` is a strict superset of `SessionAuthDeps`.
 */
export function createCoreModule(deps: RouteDeps): ServerModuleHandle {
  // This install's own publishing identity — the audience every publishing token must name.
  // Derived once per process rather than per request: it is a pure function of the root key and
  // the workspace, so it cannot change while the process runs. Awaited inside each consumer, so a
  // slow keyring delays the first handshake rather than boot.
  const targetInstallationId = deriveInstallationId({
    keyring: deps.siteAssistantSecretKeyring,
    workspaceId: deps.workspaceId,
  });
  const challengeStore = new InMemoryPublishChallengeStore(deps.clock);
  const grants = createPublishTrustGrantResolver();
  // The other half of the admission question. Its SQLite adapter proves the table is readable
  // during real-process boot; this module gives the request path a read-only view and re-reads it
  // for every publishing request so a disconnect bites immediately.
  const revocationStore = deps.publishTrustRevocations;

  return {
    name: "core",
    registerRoutes: (app) => {
      registerHealthRoute(app);
      registerHealthzRoute(app);
      registerReadyzRoute(app);

      // Unauthenticated by design and deliberately NOT under `/api/admin`: a source that has not
      // yet proved possession has no credential to present. See `handshake.ts`'s own header for
      // what `/identity` discloses and why that is acceptable.
      registerPublishTrustHandshakeRoutes(app, {
        keyring: deps.siteAssistantSecretKeyring,
        workspaceId: deps.workspaceId,
        clock: deps.clock,
        idGen: deps.idGen,
        challengeStore,
        targetInstallationId,
        grants,
      });

      // Order is load-bearing: `registerAuthRoutes` registers the ungated
      // `POST /api/admin/v1/auth/login` (plus logout/me) route BEFORE the
      // gate below mounts, so login itself is never caught by its own gate.
      registerAuthRoutes(app, deps);

      // Order is load-bearing here too, and in the other direction: the publishing gate runs
      // BEFORE the admin session gate, because a publishing token is presented in the same
      // `Authorization` header an API key uses and only this gate can tell them apart. It leaves
      // every request it does not recognise completely untouched, so the session gate behind it
      // behaves exactly as it did before.
      app.use("/api/admin", requirePublishTrust({
        keyring: deps.siteAssistantSecretKeyring,
        workspaceId: deps.workspaceId,
        clock: deps.clock,
        targetInstallationId,
        grants,
        // `list` alone: the gate must never hold a handle that can edit the deny list it is judged
        // against, and an unreadable list has to reach it as a refusal rather than as a throw.
        revocations: createPublishTrustRevocationReader(revocationStore),
      }));
      app.use("/api/admin", requireAdminSession(deps));
    },
  };
}
