import type { Express } from "express";

import type { BootModuleResult, ModuleLifecycleStatus } from "#src/server/runtime/lifecycle/boot-lifecycle";
import { getReadinessSnapshot, isAssistantDaemonKnownFailed } from "#src/server/runtime/lifecycle/readiness-state";

/** `/readyz` needs no `RouteDeps` at all (it reads the module-level readiness-state singleton) — a
 * narrower type than `RouteRegistrar`, and the shape `modules/core.ts` composes directly (ADR-046
 * Phase 3). The two liveness probes (`/health`, `/healthz`) are Jini `@jini-ai/cms` route specs now,
 * mounted by `modules/core.ts`; `/readyz` stays hand-written here because `tovu deploy config`
 * (`features/deployments/deploy-config.ts`) derives the platform health-check path from the path literal in
 * this file's `registerReadyzRoute` `app.get` call. */
export type NoDepsRouteRegistrar = (required: { app: Express }, optional?: Record<string, never>) => void;

/**
 * ADR-046 Phase 2 (SPEC-030 REQ-09) — 200 when every CRITICAL module in the current readiness
 * snapshot is `ready`, else 503 listing only critical failures' `name`/`reasonCode` (no
 * remediation hints, no owner — a lower-trust operational endpoint; the full detail lives behind
 * `system.read` admin auth, see `apps/website/src/server/inbound/admin-http/routes/system/module-status.ts`).
 *
 * `assistantDaemonKnownFailed` (degraded-boot defect fix) is the one deliberate, narrow exception
 * to "no optional-module detail here": a plain boolean, present only when true, naming no reason,
 * owner, or remediation hint — so it does not weaken the "no leaked detail" guarantee this route's
 * own tests already pin for optional modules generally. It exists because e2e suites (see
 * `development/e2e/daemon-ready.ts`) need to tell "the agent daemon we just spawned is known to
 * have crashed" apart from "nothing has answered yet" WITHOUT holding an admin session — a bare TCP
 * connect to the daemon's own port cannot make that distinction, since a leaked port can still be
 * squatted by an unrelated, healthy-looking orphaned process from a previous run.
 */
export const registerReadyzRoute: NoDepsRouteRegistrar = ({ app }, _options = {}) => {
  app.get("/readyz", (_req, res) => {
    const snapshot = getReadinessSnapshot();
    const daemonField = isAssistantDaemonKnownFailed() ? { assistantDaemonKnownFailed: true as const } : {};

    if (snapshot.ok) {
      res.json({ ready: true, ...daemonField });
      return;
    }
    // The type predicate (rather than a plain boolean filter) narrows `m.lifecycle` for the `.map`
    // below: the filter already guarantees `status !== "ready"`, so a `.lifecycle.status === "ready"
    // ? null : ...` fallback in the map would be unreachable dead code — this makes that guarantee
    // visible to the type checker instead of re-deriving it at runtime.
    const failures = snapshot.modules
      .filter(
        (m): m is BootModuleResult & { lifecycle: Exclude<ModuleLifecycleStatus, { status: "ready" }> } =>
          m.criticality === "critical" && m.lifecycle.status !== "ready"
      )
      .map((m) => ({ name: m.name, reasonCode: m.lifecycle.reasonCode }));
    res.status(503).json({ ready: false, failures, ...daemonField });
  });
};
