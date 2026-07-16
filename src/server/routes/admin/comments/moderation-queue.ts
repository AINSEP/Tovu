import type { Express } from "express";

import type { CommentRepoPort } from "../../../../comments/ports";
import type { CommentStatus } from "../../../../comments/types";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../../routes/types";

/**
 * @file ADR-031 §6 (SPEC-033) — `GET /api/admin/v1/workspaces/:workspaceId/comments/queue`, the
 * moderation queue read. `comments.read`-gated. Mirrors this session's established admin-route
 * shape (workspace-id 404 check → authorize() → 403-on-denial → proceed).
 */
export type AdminCommentsModerationQueueDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  commentRepo: CommentRepoPort;
};

const VALID_STATUSES: readonly CommentStatus[] = ["pending", "approved", "spam", "trash"];

function parseStatus(raw: unknown): CommentStatus {
  return typeof raw === "string" && (VALID_STATUSES as readonly string[]).includes(raw) ? (raw as CommentStatus) : "pending";
}

function parseLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 100) : 20;
}

export function registerAdminCommentsModerationQueueRoute(app: Express, deps: AdminCommentsModerationQueueDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/comments/queue", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

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

    const status = parseStatus(req.query.status);
    const limit = parseLimit(req.query.limit);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;

    const page = await deps.commentRepo.listModerationQueue({ workspaceId: deps.workspaceId, status, limit, cursor });
    res.json(page);
  });
}
