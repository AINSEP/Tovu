import { DuplicateCommandError, ForbiddenError, executeCommand } from "@jini-ai/cms/core";
import { processOutbox } from "#src/core/events/index";
import { PostNotFoundError, deletePost, type PostRecord } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/http/admin/posts";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * DELETE page — the pages half of the delete pair, a separate file from `posts/delete.ts` for the
 * same reason `pages/update.ts` is separate from `posts/update.ts`: posts and pages are separate
 * URL surfaces with genuinely different kind-guard behavior, and this domain's existing
 * create/get/update routes are all already split that way. Matching that split is the convention;
 * collapsing them into one shared file would be the deviation.
 *
 * SOFT delete, revertible through the change-set gateway — see `posts/delete.ts`'s header for the
 * full rationale, which applies identically here.
 *
 * Kind guard (api.spec.md §6/§7 — "kind-mismatch 404s are deliberately indistinguishable from
 * not-found"): `deletePost` itself is kind-blind, exactly like `updatePost`, so this route's own
 * `captureInverse` fetches the row and throws `PostNotFoundError` when it is missing OR its kind
 * isn't `"page"`. A `kind: "post"` id DELETEd through `/pages/:pageId` 404s instead of silently
 * trashing a post via the pages surface. `posts/delete.ts` carries no such guard, mirroring
 * `posts/update.ts`'s own legacy kind-blindness rather than inventing a stricter rule on one
 * surface than its update twin has.
 */
export const registerAdminPageDeleteRoute: ContentRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/pages/:pageId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const pageId = String(req.params.pageId ?? "");
    const idempotencyKey = req.get("Idempotency-Key") || undefined;

    let priorPost: PostRecord | null = null;

    try {
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
          summary: `Delete page ${pageId}`,
          idempotencyKey,
          permission: "content.write",
        },
        mutation: {
          entityType: "post",
          entityId: pageId,
          operation: "delete",
          captureInverse: async () => {
            const existing = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: pageId });
            if (existing?.kind !== "page") {
              // Missing id and kind-mismatch both 404 identically (no existence leak, api.spec.md §7).
              throw new PostNotFoundError(`page '${pageId}' was not found`);
            }
            priorPost = existing;
            return { deletedAt: null };
          },
          execute: () =>
            deletePost({
              deps: { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox },
              input: { workspaceId: deps.workspaceId, id: pageId },
            }),
          captureEntityVersion: (r) => r.post.version,
          rollback: async () => {
            if (priorPost) await deps.postRepo.save(priorPost);
          },
        },
      });

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

      if (err instanceof PostNotFoundError) {
        res.status(404).json({ error: err.message, code: "ENTRY_NOT_FOUND" });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
