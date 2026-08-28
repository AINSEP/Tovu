import type { UUID } from "@jini-ai/cms/core";

import type { DeploymentRunRecord, DeploymentTargetRecord, EnvironmentRecord, ReleaseRecord } from "./types.js";

/**
 * @file The deployments feature's READ-ONLY persistence port (2026-08-15 — closes the "zero
 * callers" gap `types.ts`'s own header discloses: this is the first repository/route wiring onto
 * the five tables `src/platform/db/schema.ts` has carried, unread, since migration `0037`).
 *
 * Deliberately read-only: `write-service.md`/the six-debate consensus scope a real write path
 * (create environment/target, start a run) behind credential storage that does not exist yet (see
 * `./ports.ts`'s `DeploymentProviderPort` header — `credentials` there is "pre-resolved and
 * injected", by something this pass does not build). Adding write methods to this port ahead of
 * that would be a port no caller could safely use yet. This pass exists to let the admin's Full
 * Site tab show what is ALREADY in these tables — nothing this repo returns can currently get
 * there any other way than a human with raw DB access, which is worse than an honest empty list.
 *
 * Four narrow list methods, not one combined `getSnapshot()` — each is independently a single job
 * (testable-design-patterns discipline), and the route composing all four is exactly one
 * `Promise.all` away (`server/routes/admin/deployments/list.ts`). `deployment_run_events` (the
 * fifth table) is deliberately NOT listed here: it is per-run log detail for a future run-detail
 * view, not summary state a top-level list needs.
 *
 * Every method is workspace-scoped and capped (`DEPLOYMENTS_READ_LIST_LIMIT`) and ordered
 * newest-first — the same "user-variable collection needs a cap, most-relevant-first" shape
 * `recent-hits.ts` already established for this codebase's other unbounded-over-time table.
 *
 * Architectural role:
 * INTERFACE ONLY. `./repo.sqlite.ts` (real, `server/deps.ts`) and `./repo.memory.ts` (hermetic,
 * `server/app.ts`) are its two implementations — the same rule-of-two every other
 * `RouteDeps`-carried repo in this codebase follows.
 */

/** Every list method's cap — a workspace's deployment history is user-variable and unbounded over
 *  time (new releases/runs accumulate indefinitely), so every query here is both ordered
 *  newest-first and capped, never a bare unbounded `SELECT *`. */
export const DEPLOYMENTS_READ_LIST_LIMIT = 200;

export interface DeploymentsReadRepoPort {
  listEnvironments(required: { workspaceId: UUID }): Promise<EnvironmentRecord[]>;
  listTargets(required: { workspaceId: UUID }): Promise<DeploymentTargetRecord[]>;
  listReleases(required: { workspaceId: UUID }): Promise<ReleaseRecord[]>;
  listRuns(required: { workspaceId: UUID }): Promise<DeploymentRunRecord[]>;
}
