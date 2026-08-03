import { ForbiddenError, executeCommand } from "#src/core/commands/command";
import { createPost, PostConflictError, PostValidationError } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/http/admin/posts";
import { CONTENT_ENTRY_MAX_BODY_BYTES, rejectOversizedJsonBody } from "#src/server/middleware/body-size-limit";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * POST a new blank draft page — mirrors `posts/create.ts` (same command-gateway
 * wiring, same `post` table, same optional `slug`/`bodyJson`/`status` forwarding
 * and `VALIDATION_ERROR`/`SLUG_CONFLICT` error mapping) but sets `kind: "page"`
 * so it surfaces on the Pages admin list instead of Posts.
 *
 * `rejectOversizedJsonBody` (Security review SEC-snapshot-and-post-create-2026-07-28, Finding 1)
 * enforces api.spec.md §4's documented 1 MiB route-layer body cap ahead of the handler, so an
 * oversized request 413s before `createPost`/the command gateway ever runs — mirrors
 * `posts/create.ts`'s identical wiring.
 */
export const registerAdminPageCreateRoute: ContentRouteRegistrar = (app, deps) => {
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/pages",
    rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }),
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      const idempotencyKey = req.get("Idempotency-Key") || undefined;
      const pageId = deps.idGen.newId();

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
            summary: "Create page",
            idempotencyKey,
            permission: "content.write",
          },
          mutation: {
            entityType: "post",
            entityId: pageId,
            operation: "create",
            captureInverse: async () => null,
            execute: () =>
              createPost({
                deps: { repo: deps.postRepo, clock: deps.clock },
                input: {
                  workspaceId: deps.workspaceId,
                  id: pageId,
                  title: String(req.body?.title ?? ""),
                  kind: "page",
                  slug: req.body?.slug !== undefined ? String(req.body.slug) : undefined,
                  bodyJson: req.body?.bodyJson,
                  status: req.body?.status,
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
    }
  );
};
