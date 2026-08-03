import type { Express } from "express";

import type { CommentWriteService } from "#src/comments/write-service";
import type { CommentStatus, ModerationAction } from "#src/comments/types";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-031 §6/§9 (SPEC-033) — the 5 moderation action routes (approve/spam/trash/restore/
 * purge). One file, not five — the 5 actions are near-identical (permission check → parse
 * expectedVersion → call the write-service → map the result to a status code), so a single
 * parameterized registrar per action is a reasonable simplification over 5 near-duplicate files
 * (Article III). Each still registers its OWN route/permission pairing explicitly, not a generic
 * `/action/:verb` dispatcher — route paths and permission strings stay grep-able and explicit.
 */
export type AdminCommentsModerateDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  commentWriteService: CommentWriteService;
};

interface ActionSpec {
  path: string;
  permission: string;
  action: ModerationAction;
  toStatus: CommentStatus | null; // null = purge, which has no toStatus
}

/**
 * v1 simplification: `restore` always targets `approved`, regardless of whether the comment was
 * previously `trash` or `spam` — the moderation_log's own `fromStatus` still records exactly
 * which, so this is a UX default (an operator restoring anything wants it visible again), not a
 * loss of audit information.
 */
const ACTIONS: readonly ActionSpec[] = [
  { path: "approve", permission: "comments.moderate", action: "approve", toStatus: "approved" },
  { path: "spam", permission: "comments.moderate", action: "mark_spam", toStatus: "spam" },
  { path: "trash", permission: "comments.delete", action: "trash", toStatus: "trash" },
  { path: "restore", permission: "comments.moderate", action: "restore", toStatus: "approved" },
];

function parseExpectedVersion(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function registerAdminCommentsModerateRoutes(app: Express, deps: AdminCommentsModerateDeps): void {
  for (const spec of ACTIONS) {
    app.post(`/api/admin/v1/workspaces/:workspaceId/comments/:commentId/${spec.path}`, async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: spec.permission,
        workspaceId: deps.workspaceId,
        entityType: "comment",
        entityId: req.params.commentId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${spec.permission}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: spec.permission, reason: authResult.reason },
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const expectedVersion = parseExpectedVersion(body.expectedVersion);
      if (expectedVersion === null) {
        res.status(400).json({ error: "expectedVersion is required and must be a non-negative integer" });
        return;
      }

      const result = await deps.commentWriteService.applyModeration({
        workspaceId: deps.workspaceId,
        id: req.params.commentId,
        expectedVersion,
        action: spec.action,
        toStatus: spec.toStatus!,
        actorPrincipalId: principal.id,
        note: typeof body.note === "string" ? body.note : null,
      });

      if (!result.ok) {
        const status = result.reason === "not-found" ? 404 : 409;
        res.status(status).json({ error: result.reason, currentVersion: "currentVersion" in result ? result.currentVersion : undefined });
        return;
      }

      res.status(204).end();
    });
  }

  app.post("/api/admin/v1/workspaces/:workspaceId/comments/:commentId/purge", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "comments.delete.force",
      workspaceId: deps.workspaceId,
      entityType: "comment",
      entityId: req.params.commentId,
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'comments.delete.force' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "comments.delete.force", reason: authResult.reason },
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const result = await deps.commentWriteService.purge({
      workspaceId: deps.workspaceId,
      id: req.params.commentId,
      actorPrincipalId: principal.id,
      note: typeof body.note === "string" ? body.note : null,
    });

    if (!result.ok) {
      res.status(404).json({ error: result.reason });
      return;
    }
    res.status(204).end();
  });
}
