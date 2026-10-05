import { optionalOneOf, readToolLimit, ToolInputError } from "@jini-ai/core";
import type { Express } from "express";

import { COMMENT_STATUSES, type CommentRepoPort, type CommentStatus } from "#src/features/comments/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-031 §6 (SPEC-033) — `GET /api/admin/v1/workspaces/:workspaceId/comments/queue`, the
 * moderation queue read. `comments.read`-gated. Mirrors this session's established admin-route
 * shape (workspace-id 404 check → authorize() → 403-on-denial → proceed).
 */
export type AdminCommentsModerationQueueDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  commentRepo: CommentRepoPort;
};

/** Reads the query string through the same Jini checks the `comments_list_moderation_queue` tool
 *  uses, so an off-enum `status` or a malformed `limit` is a 400 rather than a silent `pending` page
 *  or a clamped one. A `limit` above 100 is still capped, as the tool schema promises.
 *  @throws {ToolInputError} naming the bad field.
 *  @complexity O(1). */
function parseQueueQuery(query: Record<string, unknown>): { status: CommentStatus; limit: number; cursor: string | null } {
  const input = { status: query.status, limit: query.limit === undefined ? undefined : Number(query.limit) };
  return {
    status: optionalOneOf({ input, key: "status", values: COMMENT_STATUSES }) ?? "pending",
    limit: readToolLimit({ input, max: 100, fallback: 20 }),
    cursor: typeof query.cursor === "string" ? query.cursor : null,
  };
}

export function registerAdminCommentsModerationQueueRoute(app: Express, deps: AdminCommentsModerationQueueDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/comments/queue", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "comments.read",
        workspaceId: deps.workspaceId,
        entityType: "comment",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'comments.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "comments.read", reason: authResult.reason },
        });
        return;
      }

      const { status, limit, cursor } = parseQueueQuery(req.query);
      const page = await deps.commentRepo.listModerationQueue({ workspaceId: deps.workspaceId, status, limit, cursor });
      res.json(page);
    } catch (err) {
      // A bad query value, or a cursor naming no comment (the repo's `invalid cursor`).
      if (err instanceof ToolInputError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }
      console.error("[comments/moderation-queue] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
