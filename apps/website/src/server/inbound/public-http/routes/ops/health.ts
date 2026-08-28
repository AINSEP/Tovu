import type { Express } from "express";

import { getReadinessSnapshot, isAssistantDaemonKnownFailed } from "#src/server/runtime/lifecycle/readiness-state";

/** These 3 routes need no `RouteDeps` at all (health is dependency-free; readyz reads the
 * module-level readiness-state singleton) — a narrower type than `RouteRegistrar`, and the shape
 * `modules/core.ts` composes directly (ADR-046 Phase 3). */
export type NoDepsRouteRegistrar = (app: Express) => void;

export const registerHealthRoute: NoDepsRouteRegistrar = (app) => {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
};

/**
 * ADR-046 Phase 2 (SPEC-030 REQ-08) — process liveness only, no dependency checks. Mirrors
 * `/health`'s exact behavior (both remain registered; `/health` is not removed).
 */
export const registerHealthzRoute: NoDepsRouteRegistrar = (app) => {
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
};

/**
 * ADR-046 Phase 2 (SPEC-030 REQ-09) — 200 when every CRITICAL module in the current readiness
 * snapshot is `ready`, else 503 listing only critical failures' `name`/`reasonCode` (no
 * remediation hints, no owner — a lower-trust operational endpoint; the full detail lives behind
 * `system.read` admin auth, see `routes/admin/system/module-status.ts`).
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
export const registerReadyzRoute: NoDepsRouteRegistrar = (app) => {
  app.get("/readyz", (_req, res) => {
    const snapshot = getReadinessSnapshot();
    const daemonField = isAssistantDaemonKnownFailed() ? { assistantDaemonKnownFailed: true as const } : {};

    if (snapshot.ok) {
      res.json({ ready: true, ...daemonField });
      return;
    }
    const failures = snapshot.modules
      .filter((m) => m.criticality === "critical" && m.lifecycle.status !== "ready")
      .map((m) => ({
        name: m.name,
        reasonCode: m.lifecycle.status === "ready" ? null : m.lifecycle.reasonCode,
      }));
    res.status(503).json({ ready: false, failures, ...daemonField });
  });
};
