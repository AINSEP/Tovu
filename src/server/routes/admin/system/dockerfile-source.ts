import type { Express } from "express";

import { readDockerfileSource, writeDockerfileSource, type DockerfileSourceSnapshot } from "#src/features/deployments/dockerfile";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

export type { DockerfileSourceSnapshot };
// Re-exported for callers/tests that import the read function from this route file's previous
// public surface — the implementation itself now lives in `features/deployments/dockerfile.ts` (see
// this file's header for why), and this route is one of that function's two callers.
export { readDockerfileSource };

/**
 * @file Admin Deployment panel → Dockerfile tab backend.
 *
 * Registers `GET`/`PUT /api/admin/v1/workspaces/:workspaceId/system/dockerfile` — reads and writes
 * the repo-root `Dockerfile`'s contents.
 *
 * 2026-08-15: this tab is now editable, not read-only — both a human in the admin and the
 * `deployment_get_dockerfile`/`deployment_set_dockerfile` agent tools (`features/deployments/
 * tool-registrations.ts`) can read and write the same file. The actual `fs` read/write moved to
 * `features/deployments/dockerfile.ts` so both callers share one path-resolution rule instead of
 * each hardcoding `join(process.cwd(), "Dockerfile")` independently — see that file's header for the
 * full path-safety argument (short version: neither function accepts a path argument at all, so
 * there is no path input to sanitize in the first place). `PUT` is `system.write`-gated, distinct
 * from `GET`'s `system.read` — writing a build file is not a read, mirroring
 * `export-site.ts`'s `system.export` vs `system.read` split for the identical reason (a mutation
 * needs its own permission string, never folded into a `*.read` grant).
 *
 * Writing the Dockerfile does not build, validate, or deploy anything — this route only replaces
 * the file's bytes on disk. Nothing here shells out to `docker build`, and the response never
 * implies otherwise.
 */
export type AdminDockerfileSourceDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

/** Validates the write request's JSON body. Never throws — every malformed shape maps to a
 *  `{ error }` result the route turns into a `400`, mirroring `export-site.ts`'s
 *  `parseTriggerRequestBody`. `contents` is the ONLY field this route reads from the body — there is
 *  no path field to validate because {@link writeDockerfileSource} accepts none. */
function parseWriteRequestBody(body: unknown): { ok: true; contents: string } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.contents !== "string") {
    return { ok: false, error: "'contents' (string) is required" };
  }
  return { ok: true, contents: raw.contents };
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

  app.put("/api/admin/v1/workspaces/:workspaceId/system/dockerfile", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "system.write",
      workspaceId: deps.workspaceId,
      entityType: "dockerfile-source",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'system.write' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "system.write", reason: authResult.reason },
      });
      return;
    }

    const parsedBody = parseWriteRequestBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({ error: parsedBody.error });
      return;
    }

    res.status(200).json(writeDockerfileSource(parsedBody.contents));
  });
}
