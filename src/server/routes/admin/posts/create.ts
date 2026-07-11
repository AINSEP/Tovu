import { ForbiddenError, executeCommand } from "../../../../core/commands";
import { createPost } from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";

/**
 * POST a new blank draft post — routed through the command gateway (mirrors
 * the update route so post mutations stay consistently auditable/revertible).
 *
 * SPEC-006 REQ-05 wiring proof: the gateway now authorizes `content.write`
 * for the real authenticated principal (`getAuthedPrincipal`, set by
 * `requireAdminSession`) instead of the hardcoded `"user-local"` actor.
 */
export const registerAdminPostCreateRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/posts", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const idempotencyKey = req.get("Idempotency-Key") || undefined;
    const postId = deps.idGen.newId();

    try {
      // Inside the try: requireAdminSession always sets res.locals.principal before this
      // route runs, but Express 4 doesn't catch a synchronous throw from an async handler
      // outside try/catch (the request would otherwise hang instead of 500ing).
      const principal = getAuthedPrincipal(res);
      const { result } = await executeCommand({
        deps: {
          clock: deps.clock,
          idGen: deps.idGen,
          changeSets: deps.changeSets,
          outbox: deps.outbox,
          authorize: deps.authorize,
        },
        command: {
          workspaceId: deps.workspaceId,
          actor: { id: principal.id, kind: "user" },
          summary: "Create post",
          idempotencyKey,
          permission: "content.write",
        },
        mutation: {
          entityType: "post",
          entityId: postId,
          operation: "create",
          captureInverse: async () => null,
          execute: () =>
            createPost({
              deps: { repo: deps.postRepo, clock: deps.clock },
              input: {
                workspaceId: deps.workspaceId,
                id: postId,
                title: String(req.body?.title ?? ""),
              },
            }),
          captureEntityVersion: (r) => r.post.version,
        },
      });

      res.status(201).json(toAdminPostResponse(result.post));
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({
          error: err.message,
          code: "FORBIDDEN",
          details: { permission: err.permission, reason: err.reason },
        });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
