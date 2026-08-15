import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Express } from "express";

import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Deployment panel → Dockerfile tab backend.
 *
 * Registers `GET /api/admin/v1/workspaces/:workspaceId/system/dockerfile` — a read-only view of the
 * repo-root `Dockerfile`'s current contents, if one exists. Read-only on purpose: there is no write
 * endpoint, and the Dockerfile tab must not imply the admin can rebuild or edit-and-save itself —
 * building is a `docker build` run in a terminal, not a button in this UI.
 *
 * `process.cwd()` is the resolution root, matching `deps.ts`'s own `mediaUploadsDir()` fallback
 * (`join(process.cwd(), "infra", "uploads")`) and `defaultContentDbPath()`'s `join("infra",
 * "content.db")` — both already assume the process runs with its cwd at the Tovu repo root, true in
 * dev (`tovu serve` from the checkout) and in the shipped image (`WORKDIR /workspace/Tovu`, see the
 * Dockerfile's own Stage 3 comment), so this route inherits an already-established convention
 * rather than introducing a new path-resolution rule.
 *
 * Same `system.read`-gated shape as `deployment-overview.ts` in this directory; see that file's
 * header for why the permission is reused rather than a new one minted for a second read-only
 * system surface.
 */
export type AdminDockerfileSourceDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

export interface DockerfileSourceSnapshot {
  exists: boolean;
  /** `null` when `exists` is false — never an empty string standing in for "missing". */
  contents: string | null;
}

/**
 * Reads the repo-root `Dockerfile`, or reports its absence. Exported separately from the route
 * registrar so a test can call it directly without spinning up Express or touching real disk state
 * beyond what the test itself stages.
 *
 * @complexity O(f) in the Dockerfile's own byte size — one existence check, one whole-file read.
 */
export function readDockerfileSource(): DockerfileSourceSnapshot {
  const dockerfilePath = join(process.cwd(), "Dockerfile");
  if (!existsSync(dockerfilePath)) return { exists: false, contents: null };
  return { exists: true, contents: readFileSync(dockerfilePath, "utf8") };
}

export function registerAdminDockerfileSourceRoute(app: Express, deps: AdminDockerfileSourceDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/dockerfile", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "system.read",
      workspaceId: deps.workspaceId,
      entityType: "dockerfile-source",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'system.read' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "system.read", reason: authResult.reason },
      });
      return;
    }

    res.status(200).json(readDockerfileSource());
  });
}
