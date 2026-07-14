import { DuplicateCommandError, ForbiddenError, executeCommand } from "../../../../core/commands";
import { processOutbox } from "../../../../core/events";
import {
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  updatePost,
  type PostRecord,
} from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";

/**
 * PUT post — routed through the command gateway (SPEC-001 REQ-04).
 *
 * The gateway records an auditable, revertible change set around the existing
 * `updatePost` call. Success response shape is unchanged from before the gateway
 * (REQ-04); a reused `Idempotency-Key` is rejected with `DUPLICATE_COMMAND`.
 *
 * SPEC-006 REQ-05 wiring proof: the gateway now authorizes `content.write`
 * for the real authenticated principal instead of the hardcoded `"user-local"`
 * actor, and runs that check before the idempotency lookup (INV-04) — see
 * `executeCommand`.
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
          summary: `Update post ${postId}`,
          idempotencyKey,
          permission: "content.write",
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
              deps: { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox },
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

      // SPEC-008 (ADR-PIPE-008 Decision §5) — drains the outbox so `updatePost`'s
      // `entry.published`/`entry.updated`/`entry.unpublished` event (if any) actually reaches
      // `bus.subscribe`d consumers (SEO's sitemap-cache invalidation) instead of sitting pending
      // indefinitely (this composition root has no background outbox poller — mirrors the
      // `/workspaces` route's identical inline `processOutbox` call).
      await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

      res.json(toAdminPostResponse(result.post));
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({
          error: err.message,
          code: "FORBIDDEN",
          details: { permission: err.permission, reason: err.reason },
        });
        return;
      }

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
