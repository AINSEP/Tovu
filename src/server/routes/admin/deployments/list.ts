import type { Express } from "express";

import type { DeploymentRunRecord, DeploymentTargetRecord, DeploymentsReadRepoPort, EnvironmentRecord, ReleaseRecord } from "#src/features/deployments/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Deployment panel → Full Site tab backend.
 *
 * Registers `GET /api/admin/v1/workspaces/:workspaceId/deployments` — a read-only snapshot of the
 * `deployment_environments`/`deployment_targets`/`releases`/`deployment_runs` tables migration
 * `0037` created (2026-08-12) with, until now, zero callers (`src/db/schema.ts`'s own comment: "No
 * repository or route wiring reads/writes them yet"). This is that wiring's read half only —
 * creating/connecting a target needs credential storage that does not exist yet, explicitly out of
 * scope for this route (see `features/deployments/index.ts`'s header for the full remaining list).
 *
 * A NEW `deployments.read` permission, not the `system.read` `deployment-overview.ts`/
 * `dockerfile-source.ts` share: those two read THIS PROCESS's own boot-time/env state (a "system"
 * concern by `deployment-overview.ts`'s own doc), while this route reads workspace-owned DOMAIN
 * rows out of `content.db` — the same distinction that already gives `analytics.read`/
 * `backup.read`/`changeset.read`/`comments.read`/`database.read`/`media.read` their own permission
 * strings instead of folding into `system.read`. The seeded owner's wildcard grant (`identity`
 * seed) authorizes it immediately with no seed edit required — see this feature's own trace of
 * `authorize()`'s wildcard short-circuit, confirmed against `@jini-ai/cms/identity`'s
 * `authorize.ts`.
 *
 * One combined snapshot rather than four separate routes: `DeploymentsReadRepoPort` already keeps
 * the four list methods independently testable, and the Full Site tab's whole job is "show
 * everything currently in these tables" in one screen, not four separately-loading panels.
 */
export type AdminDeploymentsListDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  deploymentsReadRepo: DeploymentsReadRepoPort;
};

export interface AdminDeploymentsSnapshot {
  environments: EnvironmentRecord[];
  targets: DeploymentTargetRecord[];
  releases: ReleaseRecord[];
  runs: DeploymentRunRecord[];
}

export function registerAdminDeploymentsListRoute(app: Express, deps: AdminDeploymentsListDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/deployments", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "deployments.read",
        workspaceId: deps.workspaceId,
        entityType: "deployment-target",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'deployments.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "deployments.read", reason: authResult.reason },
        });
        return;
      }

      const workspaceId = deps.workspaceId;
      const [environments, targets, releases, runs] = await Promise.all([
        deps.deploymentsReadRepo.listEnvironments({ workspaceId }),
        deps.deploymentsReadRepo.listTargets({ workspaceId }),
        deps.deploymentsReadRepo.listReleases({ workspaceId }),
        deps.deploymentsReadRepo.listRuns({ workspaceId }),
      ]);

      const snapshot: AdminDeploymentsSnapshot = { environments, targets, releases, runs };
      res.status(200).json(snapshot);
    } catch (err) {
      console.error("[deployments/list] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
