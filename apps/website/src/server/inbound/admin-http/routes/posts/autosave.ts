import type { Response } from "express";

import type { JsonObject } from "@jini-ai/cms/core";
import { getAdminPostByIdOrSlug, type PostAutosaveSnapshot, type PostBodyFormat, type PostRepoPort } from "#src/features/post/index";
import { CONTENT_ENTRY_MAX_BODY_BYTES, rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteDeps, ContentRouteRegistrar } from "../content/deps.js";

/**
 * @file Standing-draft autosave for Posts AND Pages (2026-09-06 dispatch) — one route file, kind-
 * blind, mounted only under `/posts/:postId/autosave` and reused by both admin editors exactly the
 * way `updatePost`/`deletePost` already are (see `apps/admin/src/lib/api.ts`'s own "Kind-blind like
 * getPost/updatePost/deletePost" comments) — a Page is a `posts` row like any other, so nothing
 * here needs to know which lens is asking.
 *
 * Deliberately NOT routed through `executeCommand` (SPEC-001's command gateway), unlike
 * `posts/update.ts`: an autosave tick is disposable operational scratch state, never a real edit —
 * it must not create a change-set row, fire the `content.entry.beforeSave` plugin hook, or bump
 * `version`/`updatedAt` (see `PostRepoPort.writeAutosave`'s own doc). Gated on the same
 * `content.write` permission `posts/update.ts` checks, since parking or discarding a draft is part
 * of the same "may this principal edit this content" capability as saving it for real.
 */
const REQUIRED_PERMISSION = "content.write";

/**
 * Resolves the URL's `:postId` segment to the row's real id — the admin's own Posts list links to
 * `/admin/posts/{slug}`, not `/admin/posts/{id}` (`apps/admin/src/features/posts/Posts.tsx`), so
 * this param is very often a slug, not the id `PostRepoPort` methods key off. Mirrors
 * `posts/update.ts`'s identical resolution exactly: falls back to the raw param on no match, which
 * every handler below already treats as a safe "no such row" no-op (`writeAutosave`/`readAutosave`/
 * `clearAutosave` — see `PostRepoPort`'s own doc), so no separate 404 branch is needed here.
 */
async function resolvePostId(repo: PostRepoPort, workspaceId: string, rawParam: string): Promise<string> {
  const resolved = await getAdminPostByIdOrSlug({ deps: { repo }, input: { workspaceId, idOrSlug: rawParam } }).catch(
    () => null
  );
  return resolved?.post.id ?? rawParam;
}

/** Mirrors `pages/update-html.ts`'s `allowedToWrite` — same permission, same 403 shape, extracted
 *  for the same complexity-ceiling reason. */
async function allowedToWrite(deps: ContentRouteDeps, res: Response): Promise<boolean> {
  const principal = getAuthedPrincipal(res);
  return authorizeOrRespond(res, deps.authorize, {
    principalId: principal.id,
    permission: REQUIRED_PERMISSION,
    workspaceId: deps.workspaceId,
  });
}

/** This route's four writable PUT fields, read off an untyped body in one place — mirrors
 *  `posts/update.ts`'s `parsePostUpdateBody`. Returns `null` (never throws) on any shape the
 *  `posts_body_format_shape` CHECK constraint would also reject, so the route can 400 before ever
 *  reaching the repo. @complexity O(1). */
function parseAutosaveBody(rawBody: unknown): Pick<PostAutosaveSnapshot, "bodyFormat" | "bodyJson" | "bodyHtml" | "title" | "slug" | "baseVersion"> | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const bodyFormat = body.bodyFormat as PostBodyFormat;
  if (bodyFormat !== "doc" && bodyFormat !== "html") return null;
  if (typeof body.title !== "string") return null;
  if (typeof body.slug !== "string") return null;
  if (typeof body.baseVersion !== "number" || !Number.isFinite(body.baseVersion)) return null;

  if (bodyFormat === "doc") {
    if (typeof body.bodyJson !== "object" || body.bodyJson === null) return null;
    return { bodyFormat, bodyJson: body.bodyJson as JsonObject, title: body.title, slug: body.slug, baseVersion: body.baseVersion };
  }
  if (typeof body.bodyHtml !== "string") return null;
  return { bodyFormat, bodyHtml: body.bodyHtml, title: body.title, slug: body.slug, baseVersion: body.baseVersion };
}

/**
 * PUT `/api/admin/v1/workspaces/:workspaceId/posts/:postId/autosave` — parks a standing draft.
 *
 * Response is `{ applied: boolean }`, never a 409: `applied: false` (the row's `version` no longer
 * equals this snapshot's `baseVersion`, or the row is gone — see `PostRepoPort.writeAutosave`,
 * whose guard is a single conditional UPDATE) is an ordinary, expected outcome for a background
 * tick, not an error the operator needs to see. Nothing was written, and nothing on this side
 * changes as a result: a client that keeps PUTting the same `baseVersion` will keep being refused,
 * which is deterministic rather than transient.
 *
 * Acting on the flag is therefore entirely the client's job. From 2026-09-06,
 * `apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts` stops scheduling further autosaves
 * for that basis and surfaces a `staleBasis` state; it deliberately does NOT drop the operator's
 * in-memory text. (An earlier version of this comment claimed the hook made the client "stop
 * treating its own in-memory edit as current" — the hook never did that, and by design still does
 * not; that would discard the very work the refusal is protecting.)
 *
 * GET on the same path reads the parked snapshot (`{ autosave: PostAutosaveSnapshot | null }`) —
 * the recovery-banner check on editor mount. DELETE clears it unconditionally (`{ ok: true }`) —
 * called after a real Save/Publish succeeds, and on an explicit operator Discard.
 */
export const registerAdminPostAutosaveRoute: ContentRouteRegistrar = (app, deps) => {
  const path = "/api/admin/v1/workspaces/:workspaceId/posts/:postId/autosave";

  app.put(path, rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }), async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    if (!(await allowedToWrite(deps, res))) return;

    const parsed = parseAutosaveBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: "invalid autosave body", code: "VALIDATION_ERROR" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const snapshot: PostAutosaveSnapshot = {
      ...parsed,
      savedAt: deps.clock.nowIso(),
      savedByPrincipalId: principal.id,
    };
    const postId = await resolvePostId(deps.postRepo, deps.workspaceId, String(req.params.postId ?? ""));
    const result = await deps.postRepo.writeAutosave({ workspaceId: deps.workspaceId, id: postId, snapshot });
    res.json(result);
  });

  app.get(path, async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    if (!(await allowedToWrite(deps, res))) return;

    const postId = await resolvePostId(deps.postRepo, deps.workspaceId, String(req.params.postId ?? ""));
    const autosave = await deps.postRepo.readAutosave({ workspaceId: deps.workspaceId, id: postId });
    res.json({ autosave });
  });

  app.delete(path, async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    if (!(await allowedToWrite(deps, res))) return;

    const postId = await resolvePostId(deps.postRepo, deps.workspaceId, String(req.params.postId ?? ""));
    await deps.postRepo.clearAutosave({ workspaceId: deps.workspaceId, id: postId });
    res.json({ ok: true });
  });
};
