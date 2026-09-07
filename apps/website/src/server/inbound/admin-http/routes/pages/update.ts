import { DuplicateCommandError, ForbiddenError, executeCommand } from "@jini-ai/cms/core";
import { processOutbox } from "#src/contracts/core/events/index";
import {
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
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import {
  CONTENT_ENTRY_MAX_BODY_BYTES,
  rejectOversizedJsonBody,
} from "#src/server/inbound/shared/body-size-limit";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { Response } from "express";
import type { ContentRouteRegistrar } from "../content/deps.js";

/** This route's five writable PUT fields, read off an untyped body in one place.
 *  @complexity O(1). */
function parsePageUpdateBody(
  rawBody: unknown
): Pick<UpdatePostInput, "title" | "slug" | "bodyJson" | "status" | "expectedVersion"> {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    title: String(body.title ?? ""),
    slug: String(body.slug ?? ""),
    bodyJson: body.bodyJson as UpdatePostInput["bodyJson"],
    status: body.status as UpdatePostInput["status"],
    // Validated, not cast — `features/post/expected-version.ts` owns this rule for every arm that
    // accepts a basis, so a mistyped `"3"` is a 400 here exactly as it is on `posts/update.ts`
    // rather than coercing to "no basis sent" and becoming an unguarded save by a client that
    // believes it is protected.
    expectedVersion: parseExpectedVersion(body.expectedVersion),
  };
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendPageUpdateError(res: Response, err: unknown): void {
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
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
  // BEFORE the `PostConflictError` branch below, because `PostVersionConflictError` extends it and
  // `instanceof` would otherwise be answered by the superclass first — a version conflict reported
  // as `SLUG_CONFLICT` tells the editor to fix a slug that is not the problem. Same ordering, and
  // the same shared envelope, as `posts/update.ts`: one definition of the `code` a client branches
  // on, across every arm that can produce this conflict.
  if (err instanceof PostVersionConflictError) {
    res.status(409).json(versionConflictEnvelope(err));
    return;
  }
  if (err instanceof PostConflictError) {
    res.status(409).json({ error: err.message, code: "SLUG_CONFLICT" });
    return;
  }
  if (err instanceof PostNotFoundError) {
    res.status(404).json({ error: err.message, code: "ENTRY_NOT_FOUND" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * PUT page (SPEC-002 api.spec.md `PAGE_UPDATE`) — routed through the command
 * gateway exactly like `posts/update.ts` (same gateway wiring, same
 * `updatePost` feature call, same success/error shapes; `kind` in the body is
 * ignored per AC-19, mirroring `updatePost`'s own kind-blind update contract).
 *
 * Kind guard (api.spec.md §6/§7 — "kind-mismatch 404s are deliberately
 * indistinguishable from not-found"): `updatePost` itself has no kind
 * awareness (a page and a post share the identical update contract, per
 * `PostKind`'s own doc: kind is fixed at creation, never mutated by an
 * update), so this route's own `captureInverse` fetches the existing record
 * and throws `PostNotFoundError` when it is missing OR its kind isn't
 * `"page"` — a `kind: "post"` id PUT through `/pages/:pageId` 404s instead of
 * silently updating a post via the pages surface.
 *
 * Error `code` (disclosed deviation from `posts/update.ts`, its mirror-source):
 * `posts/update.ts` handles `PostValidationError`/`PostConflictError`/
 * `PostNotFoundError` as message-only (POST_UPDATE is a *modified*, legacy
 * endpoint — errors.spec.md §1 lets those keep `{error}` only). `PAGE_UPDATE`
 * is a *new* endpoint, so this route adds the required `code` on those same
 * three branches: `VALIDATION_ERROR`, `SLUG_CONFLICT`, `ENTRY_NOT_FOUND`.
 *
 * Optimistic concurrency (2026-09-07, fable bugs audit C02) — this route forwards an optional
 * `expectedVersion` into `updatePost`, and maps the resulting conflict, exactly as
 * `posts/update.ts` has since `9c7d16bf`. It did not before: a Page and a Post are the same `posts`
 * row (this route's own "kind-blind update contract" note above), so the arm that shipped the guard
 * and the arm that did not were writing the same column under two different concurrency contracts,
 * and the Pages surface was the one silently applying stale writes. OBSERVABLE BEHAVIOR CHANGE,
 * deliberately, and identical in shape to the one the posts arm already made: a client that sends
 * `expectedVersion` and whose basis has been superseded now gets `409 VERSION_CONFLICT` where it
 * used to get `200` and erase the other operator's document; a client that sends a MALFORMED one
 * now gets `400 VALIDATION_ERROR` instead of having it silently ignored. A client that sends none
 * is unaffected — same last-write-wins behavior as before, pinned by a test.
 *
 * Still deliberately not forwarded: `templateChoice`/`overridesThemePage`. Pages have their own
 * theme-page flow (`update-html.ts`, `pages.ts`'s resolver); this note exists because the
 * "same `updatePost` feature call" claim above did not disclose those omissions and one of them
 * turned out to be a defect.
 *
 * `rejectOversizedJsonBody` (Security review SEC-snapshot-and-post-create-2026-07-28, Finding 1)
 * enforces api.spec.md §4's documented 1 MiB route-layer body cap ahead of the handler — the same
 * cap `pages/create.ts` applies, since §4 scopes it to the update endpoints too — so an oversized
 * request 413s before `updatePost`/the command gateway ever runs.
 */
export const registerAdminPageUpdateRoute: ContentRouteRegistrar = (app, deps) => {
  app.put(
    "/api/admin/v1/workspaces/:workspaceId/pages/:pageId",
    rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }),
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      const pageId = String(req.params.pageId ?? "");
      const idempotencyKey = req.get("Idempotency-Key") || undefined;

      // Full pre-edit record, captured in captureInverse and reused verbatim by
      // rollback so the gateway's unit-of-work compensation (SPEC-001
      // REQ-01/EC-08/AC-17) restores the page exactly — version included — if the
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
            summary: `Update page ${pageId}`,
            idempotencyKey,
            permission: "content.write",
          },
          mutation: {
            entityType: "post",
            entityId: pageId,
            operation: "update",
            captureInverse: async () => {
              const existing = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: pageId });
              if (existing?.kind !== "page") {
                // Missing id and kind-mismatch both 404 identically (no existence leak, api.spec.md §7).
                throw new PostNotFoundError(`page '${pageId}' was not found`);
              }
              priorPost = existing;
              return {
                title: priorPost.title,
                slug: priorPost.slug,
                bodyJson: priorPost.bodyJson,
                status: priorPost.status,
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
                  id: pageId,
                  ...parsePageUpdateBody(req.body),
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
        // `bus.subscribe`d consumers, mirroring `posts/update.ts`'s identical inline `processOutbox` call.
        await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

        res.json(toAdminPostResponse(result.post));
      } catch (err) {
        sendPageUpdateError(res, err);
      }
    }
  );
};
