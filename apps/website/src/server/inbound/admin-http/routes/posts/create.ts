import { DuplicateCommandError, ForbiddenError, executeCommand } from "@jini-ai/cms/core";
import { processOutbox } from "#src/contracts/core/events/index";
import { createPost, PostConflictError, PostValidationError } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import {
  CONTENT_ENTRY_MAX_BODY_BYTES,
  rejectOversizedJsonBody,
} from "#src/server/inbound/shared/body-size-limit";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { sendPluginHookFailedError } from "#src/server/inbound/admin-http/http/plugin-hook-error";
import type { Response } from "express";
import type { ContentRouteRegistrar } from "../content/deps.js";

/** Maps this route's thrown error types onto the admin error envelope.
 *  @complexity O(1). */
function sendPostCreateError(res: Response, err: unknown): void {
  if (sendPluginHookFailedError(res, err)) return;
  if (err instanceof ForbiddenError) {
    res.status(403).json({
      error: err.message,
      code: "FORBIDDEN",
      details: { permission: err.permission, reason: err.reason },
    });
    return;
  }

  if (err instanceof DuplicateCommandError) {
    res.status(409).json({ error: err.message, code: "DUPLICATE_COMMAND", changeSetId: err.changeSetId });
    return;
  }

  if (err instanceof PostValidationError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }

  if (err instanceof PostConflictError) {
    res.status(409).json({ error: err.message, code: "SLUG_CONFLICT" });
    return;
  }

  res.status(500).json({ error: "internal error" });
}

/**
 * POST a new blank draft post — routed through the command gateway (mirrors
 * the update route so post mutations stay consistently auditable/revertible).
 *
 * SPEC-006 REQ-05 wiring proof: the gateway now authorizes `content.write`
 * for the real authenticated principal (`getAuthedPrincipal`, set by
 * `requireAdminSession`) instead of the hardcoded `"user-local"` actor.
 *
 * SPEC-002 api.spec.md `POST_CREATE` §4 — `slug`/`bodyJson`/`status` are optional
 * body fields; forwarded to `createPost` only when present (`undefined` otherwise)
 * so its own default-when-absent behavior applies. `code` on the error branches
 * below mirrors `pages/update.ts` (`PAGE_UPDATE` is this endpoint's closest "new
 * endpoint" sibling — errors.spec.md guarantees `code` on new endpoints).
 *
 * `rejectOversizedJsonBody` (Security review SEC-snapshot-and-post-create-2026-07-28, Finding 1)
 * enforces api.spec.md §4's documented 1 MiB route-layer body cap ahead of the handler, so an
 * oversized request 413s before `createPost`/the command gateway ever runs.
 */
export const registerAdminPostCreateRoute: ContentRouteRegistrar = (app, deps) => {
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/posts",
    rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }),
    async (req, res) => {
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
                deps: { repo: deps.postRepo, clock: deps.clock, beforeSaveHook: deps.pluginBeforeSaveHook, outbox: deps.outbox },
                input: {
                  workspaceId: deps.workspaceId,
                  id: postId,
                  title: String(req.body?.title ?? ""),
                  slug: req.body?.slug !== undefined ? String(req.body.slug) : undefined,
                  bodyJson: req.body?.bodyJson,
                  status: req.body?.status,
                  actorId: principal.id,
                },
              }),
            captureEntityVersion: (r) => r.post.version,
          },
        });

        // A post created directly as `status: "published"` now enqueues `entry.published`
        // (`createPost`'s own `deps.outbox` doc) — drained here so SEO's sitemap-cache
        // invalidation subscriber sees it at once, mirroring `posts/update.ts`'s identical
        // inline `processOutbox` call (otherwise the background drainer in `serving-app.ts`
        // delivers it on its next pass).
        await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

        res.status(201).json(toAdminPostResponse(result.post));
      } catch (err) {
        sendPostCreateError(res, err);
      }
    }
  );
};
