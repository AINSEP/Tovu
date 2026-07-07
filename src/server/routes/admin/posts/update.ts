import { DuplicateCommandError, executeCommand } from "../../../../core/commands";
import {
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  updatePost,
  type PostRecord,
} from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import type { RouteRegistrar } from "../../../routes/types";

/**
 * PUT post — routed through the command gateway (SPEC-001 REQ-04).
 *
 * The gateway records an auditable, revertible change set around the existing
 * `updatePost` call. Success response shape is unchanged from before the gateway
 * (REQ-04); a reused `Idempotency-Key` is rejected with `DUPLICATE_COMMAND`.
 */
export const registerAdminPostUpdateRoute: RouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/posts/:postId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const postId = String(req.params.postId ?? "");
    const idempotencyKey = req.get("Idempotency-Key") || undefined;

    // Full pre-edit record, captured in captureInverse and reused verbatim by
    // rollback so the gateway's unit-of-work compensation (SPEC-001
    // REQ-01/EC-08/AC-17) restores the post exactly — version included — if the
    // change-set record fails to persist after updatePost applies.
    let priorPost: PostRecord | null = null;

    try {
      const { result } = await executeCommand({
        deps: {
          clock: deps.clock,
          idGen: deps.idGen,
          changeSets: deps.changeSets,
          outbox: deps.outbox,
        },
        command: {
          workspaceId: deps.workspaceId,
          actor: { id: "user-local", kind: "user" },
          summary: `Update post ${postId}`,
          idempotencyKey,
        },
        mutation: {
          entityType: "post",
          entityId: postId,
          operation: "update",
          captureInverse: async () => {
            priorPost = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: postId });
            if (!priorPost) return null; // execute() throws PostNotFoundError → 404 below
            return {
              title: priorPost.title,
              slug: priorPost.slug,
              bodyJson: priorPost.bodyJson,
              status: priorPost.status,
            };
          },
          execute: () =>
            updatePost({
              deps: { repo: deps.postRepo, clock: deps.clock },
              input: {
                workspaceId: deps.workspaceId,
                id: postId,
                title: String(req.body?.title ?? ""),
                slug: String(req.body?.slug ?? ""),
                bodyJson: req.body?.bodyJson,
                status: req.body?.status,
              },
            }),
          captureEntityVersion: (r) => r.post.version,
          rollback: async () => {
            if (priorPost) await deps.postRepo.save(priorPost);
          },
        },
      });

      res.json(toAdminPostResponse(result.post));
    } catch (err) {
      if (err instanceof DuplicateCommandError) {
        res.status(409).json({
          error: err.message,
          code: "DUPLICATE_COMMAND",
          changeSetId: err.changeSetId,
        });
        return;
      }

      if (err instanceof PostValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (err instanceof PostConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }

      if (err instanceof PostNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
