import type { Response } from "express";

import { DuplicateCommandError, ForbiddenError, executeCommand } from "@jini-ai/cms/core";
import { processOutbox } from "#src/contracts/core/events/index";
import { PostNotFoundError, deletePost, getAdminPostByIdOrSlug, type PostRecord } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/http/admin/posts";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendPostDeleteError(res: Response, err: unknown): void {
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof DuplicateCommandError) {
    res.status(409).json({ error: err.message, code: "DUPLICATE_COMMAND", changeSetId: err.changeSetId });
    return;
  }
  if (err instanceof PostNotFoundError) {
    res.status(404).json({ error: err.message, code: "ENTRY_NOT_FOUND" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * DELETE post — routed through the command gateway exactly like `posts/update.ts`.
 *
 * SOFT delete: `deletePost` stamps a trash marker, it does not remove the row (see
 * `features/post/post.ts`'s `PostRecord.deletedAt` for the full rationale, and
 * `core/commands/appliers.ts`'s `postDeleteReverter` for the restore that marker makes possible).
 * So this route is genuinely revertible through the existing `POST /change-sets/:id/revert`
 * endpoint, which is the same recoverability guarantee every other gateway-routed write here has.
 *
 * Mirrors `posts/update.ts`'s shape deliberately, field for field: same `executeCommand` deps bag,
 * same `Idempotency-Key` handling, same `actor: { id: principal.id, kind: "user" }`, same
 * `content.write` permission (deleting content IS writing content — this codebase has no separate
 * `content.delete` permission, and inventing one here would create a permission no policy grants),
 * same `captureInverse`/`rollback` unit-of-work compensation, same inline `processOutbox` drain,
 * and the same success body (`toAdminPostResponse`) so a client sees the record it just trashed.
 *
 * Deliberately NOT mirrored from `posts/update.ts`: `rejectOversizedJsonBody`. A DELETE carries no
 * body to cap, so applying the 1 MiB guard would be ceremony against a request shape that cannot
 * trigger it.
 *
 * `operation: "delete"` (not `"update"`) is what routes a revert of this change set to
 * `postDeleteReverter` rather than `postUpdateReverter` — `ChangeSetOperation` already had the
 * `"delete"` member; this is its first real user.
 *
 * Error `code`s: this is a NEW endpoint, so it carries the `code` field errors.spec.md §1 requires
 * of new endpoints — matching `pages/update.ts`'s disclosed treatment rather than
 * `posts/update.ts`'s message-only legacy shape.
 */
export const registerAdminPostDeleteRoute: ContentRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/posts/:postId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const rawParam = String(req.params.postId ?? "");
    // Admin URLs use the slug when one resolves (2026-08-10) — same resolve-up-front rationale as
    // `posts/update.ts`.
    const postId = (await getAdminPostByIdOrSlug({
      deps: { repo: deps.postRepo },
      input: { workspaceId: deps.workspaceId, idOrSlug: rawParam },
    }).catch(() => null))?.post.id ?? rawParam;
    const idempotencyKey = req.get("Idempotency-Key") || undefined;

    // Full pre-trash record, captured in captureInverse and reused verbatim by rollback so the
    // gateway's unit-of-work compensation restores the post exactly — trash marker and version
    // included — if the change-set record fails to persist after deletePost applies.
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
          summary: `Delete post ${postId}`,
          idempotencyKey,
          permission: "content.write",
        },
        mutation: {
          entityType: "post",
          entityId: postId,
          operation: "delete",
          captureInverse: async () => {
            priorPost = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: postId });
            if (!priorPost) return null; // execute() throws PostNotFoundError → 404 below
            // The whole inverse of a soft delete is "clear the marker" — see postDeleteReverter's
            // own doc for why capturing a second copy of the row's fields would be wrong.
            return { deletedAt: null };
          },
          execute: () =>
            deletePost({
              deps: { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox },
              input: { workspaceId: deps.workspaceId, id: postId },
            }),
          captureEntityVersion: (r) => r.post.version,
          rollback: async () => {
            if (priorPost) await deps.postRepo.save(priorPost);
          },
        },
      });

      // Drains deletePost's `entry.unpublished` event (emitted only when a PUBLISHED row is
      // trashed) to SEO's sitemap-cache invalidation subscriber — identical to the inline drain
      // `posts/update.ts` performs, since this composition root has no background outbox poller.
      await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

      res.json(toAdminPostResponse(result.post));
    } catch (err) {
      sendPostDeleteError(res, err);
    }
  });
};
