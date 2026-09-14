import { DuplicateCommandError, ForbiddenError, executeCommand } from "@jini-ai/cms/core";
import { processOutbox } from "#src/contracts/core/events/index";
import {
  getAdminPostByIdOrSlug,
  parseExpectedVersion,
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  PostVersionConflictError,
  updatePost,
  versionConflictEnvelope,
  type PostRecord,
  type UpdatePostInput,
} from "#src/features/post/index";
import type { Response } from "express";

import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import {
  CONTENT_ENTRY_MAX_BODY_BYTES,
  rejectOversizedJsonBody,
} from "#src/server/inbound/shared/body-size-limit";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/** This route's seven writable PUT fields, read off an untyped body in one place.
 *  Return type is pinned to `UpdatePostInput` itself (minus the id fields the
 *  route supplies separately) rather than left inferred, so a field this route
 *  stops forwarding — or a shape change in `UpdatePostInput` — fails to compile
 *  here instead of surfacing downstream in `updatePost`.
 *  @complexity O(1). */
function parsePostUpdateBody(
  rawBody: unknown
): Pick<
  UpdatePostInput,
  "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage" | "expectedVersion"
> {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    title: String(body.title ?? ""),
    slug: String(body.slug ?? ""),
    bodyJson: body.bodyJson as UpdatePostInput["bodyJson"],
    status: body.status as UpdatePostInput["status"],
    templateChoice: body.templateChoice as UpdatePostInput["templateChoice"],
    overridesThemePage: body.overridesThemePage as UpdatePostInput["overridesThemePage"],
    // Validated, not cast — see `features/post/expected-version.ts`, which owns this rule for BOTH
    // arms that accept a basis (this route and the `content_post_update` agent tool). Every other
    // field above is either coerced (`title`/`slug`) or handed to `updatePost`'s own validation;
    // this one has no downstream validator at all, because `undefined` is a legitimate value there.
    expectedVersion: parseExpectedVersion(body.expectedVersion),
  };
}

/** Maps this route's thrown error types onto the admin error envelope.
 *  @complexity O(1). */
function sendPostUpdateError(res: Response, err: unknown): void {
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof DuplicateCommandError) {
    res.status(409).json({ error: err.message, code: "DUPLICATE_COMMAND", changeSetId: err.changeSetId });
    return;
  }
  if (err instanceof PostValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  // BEFORE the `PostConflictError` branch below, because `PostVersionConflictError` extends it and
  // `instanceof` would otherwise be answered by the superclass first. Both are 409; the `code` is
  // what makes them tellable apart, which is the whole reason this branch exists — a slug collision
  // and "somebody else saved while you were editing" need opposite responses from the editor (fix
  // the slug and resend vs. do NOT resend, you are about to erase someone's work).
  //
  // The slug branch below is left exactly as it was, code-less, on purpose: adding a code there too
  // would be a second, unrequested wire-shape change, and "no code" is already a distinguishable
  // answer for the only two 409s `updatePost` can produce.
  if (err instanceof PostVersionConflictError) {
    // Body built by the shared boundary module, not spelled out here, so the `code` a client
    // branches on has exactly one definition across every arm that can produce this conflict.
    res.status(409).json(versionConflictEnvelope(err));
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
 *
 * Optimistic concurrency (2026-09-06) — this route now forwards an optional `expectedVersion` from
 * the request body into `updatePost`. OBSERVABLE BEHAVIOR CHANGE, deliberately: a client that sends
 * it and whose basis has been superseded now gets `409 VERSION_CONFLICT` where the identical request
 * used to get `200` and silently erase the other operator's document. A client that does not send it
 * is unaffected — same last-write-wins behavior as before, pinned by a test.
 *
 * `rejectOversizedJsonBody` (Security review SEC-snapshot-and-post-create-2026-07-28, Finding 1)
 * enforces api.spec.md §4's documented 1 MiB route-layer body cap ahead of the handler — the same
 * cap `posts/create.ts` applies, since §4 scopes it to the update endpoints too — so an oversized
 * request 413s before `updatePost`/the command gateway ever runs.
 */
export const registerAdminPostUpdateRoute: ContentRouteRegistrar = (app, deps) => {
  app.put(
    "/api/admin/v1/workspaces/:workspaceId/posts/:postId",
    rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }),
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      const rawParam = String(req.params.postId ?? "");
      // Admin URLs use the slug when one resolves (2026-08-10) — resolve to the real stable id up
      // front, before the command gateway starts, so `entityId`/`captureInverse`/`updatePost` all
      // key off the same real id even when the URL's own slug is one of the fields being changed in
      // this very request. Falls back to the raw param on no match, which reaches the exact same
      // "not found" 404 path this route already had (captureInverse's own findById returns null).
      const postId = (await getAdminPostByIdOrSlug({
        deps: { repo: deps.postRepo },
        input: { workspaceId: deps.workspaceId, idOrSlug: rawParam },
      }).catch(() => null))?.post.id ?? rawParam;
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
                templateChoice: priorPost.templateChoice ?? null,
                // Tri-state (2026-08-15) — `?? null`, not `?? false`. This is the rollback inverse: if
                // the pre-edit row was genuinely "never decided" (`undefined`/`null`) and the edit that
                // just ran set an explicit `true`/`false`, a gateway rollback must restore "never
                // decided", not silently manufacture an explicit "theme page wins" the author never
                // chose. Coalescing to `false` here would be the exact same coercion bug this whole
                // change removes, just relocated to the one path that only runs on failure.
                overridesThemePage: priorPost.overridesThemePage ?? null,
                // SPEC-005 BR-08 (T024) — the pre-edit plugin `ext` bag travels in the pre-image
                // alongside the core fields, so one revert restores both together. Spread
                // conditionally: an entry with no `ext` yet must produce an inverse payload with
                // no `ext` key, which is what restores it to "namespace absent" (AC-17).
                ...(priorPost.ext !== undefined ? { ext: priorPost.ext } : {}),
              };
            },
            execute: () =>
              updatePost({
                deps: {
                  repo: deps.postRepo,
                  clock: deps.clock,
                  outbox: deps.outbox,
                  beforeSaveHook: deps.pluginBeforeSaveHook,
                },
                input: {
                  workspaceId: deps.workspaceId,
                  id: postId,
                  ...parsePostUpdateBody(req.body),
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
        // `bus.subscribe`d consumers (SEO's sitemap-cache invalidation) before the response, rather
        // than on the background drainer's next pass (`serving-app.ts`) — mirrors the
        // `/workspaces` route's identical inline `processOutbox` call.
        await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

        res.json(toAdminPostResponse(result.post));
      } catch (err) {
        sendPostUpdateError(res, err);
      }
    }
  );
};
