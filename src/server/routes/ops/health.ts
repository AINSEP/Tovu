import type { Express } from "express";

import { getReadinessSnapshot } from "../../readiness-state";

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
 */
export const registerReadyzRoute: NoDepsRouteRegistrar = (app) => {
  app.get("/readyz", (_req, res) => {
    const snapshot = getReadinessSnapshot();
    if (snapshot.ok) {
      res.json({ ready: true });
      return;
    }
    const failures = snapshot.modules
      .filter((m) => m.criticality === "critical" && m.lifecycle.status !== "ready")
      .map((m) => ({
        name: m.name,
        reasonCode: m.lifecycle.status === "ready" ? null : m.lifecycle.reasonCode,
      }));
    res.status(503).json({ ready: false, failures });
  });
};
