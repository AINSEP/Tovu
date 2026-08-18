import type { Express } from "express";

import {
  readDockerfileSource,
  writeDockerfileSourceWithIfMatch,
  type DockerfileSourceSnapshot,
} from "#src/features/deployments/index";
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
 *
 * ## 2026-08-15 — `If-Match`/`ETag` optimistic concurrency (Terra audit finding C5)
 *
 * `GET` sets a real `ETag` response header (`dockerfile.ts`'s `DockerfileSourceSnapshot.etag`) on
 * every response, including the "does not exist" case. `PUT` now REQUIRES a matching `If-Match`
 * request header — see {@link writeDockerfileSourceWithIfMatch}'s own doc for the full decision
 * record (strict, not permissive) and the residual race window it honestly does not close. A `PUT`
 * with no `If-Match` at all is `400`, not treated as an unconditional write; a `PUT` whose `If-Match`
 * no longer names the file's current contents is `412 Precondition Failed`, with the CURRENT
 * `{exists, contents}` in the body so the caller can diff and reconcile instead of retrying blind.
 * The JSON response body deliberately stays `{exists, contents}` on every status — the etag travels
 * ONLY via the `ETag`/`If-Match` headers, not duplicated into the body, so there is exactly one wire
 * representation of "what etag is this" rather than two that could drift.
 */
export type AdminDockerfileSourceDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

/** Validates the write request's JSON body. Never throws — every malformed shape maps to a
 *  `{ error }` result the route turns into a `400`, mirroring `export-site.ts`'s
 *  `parseTriggerRequestBody`. `contents` is the ONLY field this route reads from the BODY — there is
 *  no path field to validate because {@link writeDockerfileSourceWithIfMatch} accepts none, and the
 *  write's other required input, `If-Match`, is a HEADER (checked separately below, before this
 *  parser ever runs) rather than a body field. */
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

/** The wire body both `GET` and a successful `PUT` return — deliberately just `{exists, contents}`,
 *  never the domain snapshot's `etag` field; see this file's header for why the etag travels only
 *  via the `ETag` header. */
function toResponseBody(snapshot: DockerfileSourceSnapshot): { exists: boolean; contents: string | null } {
  return { exists: snapshot.exists, contents: snapshot.contents };
}

export function registerAdminDockerfileSourceRoute(app: Express, deps: AdminDockerfileSourceDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/dockerfile", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
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

      const snapshot = readDockerfileSource();
      res.setHeader("ETag", snapshot.etag);
      res.status(200).json(toResponseBody(snapshot));
    } catch (err) {
      console.error("[dockerfile-source] unexpected error reading the Dockerfile", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.put("/api/admin/v1/workspaces/:workspaceId/system/dockerfile", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
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

      // Precondition check BEFORE body parsing — an `If-Match` header is a precondition on the
      // REQUEST, distinct from whether the BODY it guards happens to be well-formed. Checking it
      // first means a missing-header failure is never masked by (or mistaken for) a body-shape
      // failure — see this file's header for the strict-vs-permissive decision this header enforces.
      const ifMatch = req.get("If-Match");
      if (!ifMatch) {
        res.status(400).json({
          error:
            "the 'If-Match' header is required on PUT — GET this same URL first (its response carries an 'ETag' header with the file's current value), then send that value back as 'If-Match' to prove your write is based on the current contents, not a stale copy. This is deliberate (Terra audit finding C5, 2026-08-15): an unconditional write here would let a human editing this tab and the AI assistant's deployment_set_dockerfile tool silently overwrite each other with no warning to either.",
        });
        return;
      }

      const parsedBody = parseWriteRequestBody(req.body);
      if (!parsedBody.ok) {
        res.status(400).json({ error: parsedBody.error });
        return;
      }

      const result = writeDockerfileSourceWithIfMatch(parsedBody.contents, ifMatch);
      if (!result.ok) {
        res.setHeader("ETag", result.current.etag);
        res.status(412).json({
          error:
            "the Dockerfile changed on the server since your 'If-Match' value was read — someone else (or the AI assistant) saved a different version in between. The response body's 'current' field is what's actually on disk right now; reconcile your intended change against it and retry with the 'ETag' header on THIS response.",
          code: "DOCKERFILE_CONFLICT",
          current: toResponseBody(result.current),
        });
        return;
      }

      res.setHeader("ETag", result.snapshot.etag);
      res.status(200).json(toResponseBody(result.snapshot));
    } catch (err) {
      console.error("[dockerfile-source] unexpected error writing the Dockerfile", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
