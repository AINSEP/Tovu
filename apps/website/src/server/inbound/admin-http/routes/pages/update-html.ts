import type { Response } from "express";

import {
  DEFAULT_PAGE_SKELETON,
  PAGES_EDIT_HTML_PERMISSION,
  PageConcurrentEditError,
  PageKindMismatchError,
  PageNotFoundError,
} from "#src/features/pages/index";
import { entityNotLiveResponse } from "#src/server/inbound/admin-http/http/entity-not-live";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import {
  CONTENT_ENTRY_MAX_BODY_BYTES,
  rejectOversizedJsonBody,
} from "#src/server/inbound/shared/body-size-limit";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteDeps, ContentRouteRegistrar } from "../content/deps.js";

/**
 * The permission this route checks. Named once so the gate, the 403 body, and the agent-tool path to
 * the same store all read from the same place.
 *
 * `pages.edit_html` (SPEC-047 REQ-9) as of 2026-09-05, replacing the interim `content.write` — see
 * this file's Authorization section and `features/pages/permissions.ts` for the grant that makes it
 * a real, held permission rather than a string no policy row spells.
 */
const REQUIRED_PERMISSION = PAGES_EDIT_HTML_PERMISSION;

/**
 * Run the permission gate, sending the 403 itself when it fails.
 *
 * Returns whether the caller may PROCEED — named that way round because the call site reads
 * `if (!(await allowedToWrite(...))) return;`, and a helper called `denied` would invert the sense of
 * the branch every reader has to hold. Extracted rather than inlined so the handler stays inside the
 * 9/9 complexity ceiling this repo gates new code on.
 *
 * Mirrors `pages/list.ts`'s 403 body verbatim (`error`/`code`/`details`) — the admin UI keys off
 * `code`, and a second spelling of the same refusal would be a silent client-side bug.
 */
async function allowedToWrite(deps: ContentRouteDeps, res: Response): Promise<boolean> {
  const principal = getAuthedPrincipal(res);
  return authorizeOrRespond(res, deps.authorize, {
    principalId: principal.id,
    permission: REQUIRED_PERMISSION,
    workspaceId: deps.workspaceId,
  });
}

/** Map a store-layer failure onto its HTTP shape. Extracted from the handler's `catch` for the same
 * complexity reason as {@link allowedToWrite}; behavior is unchanged except for the new
 * `entityNotLiveResponse` arm (S5, web-high fix plan 2026-09-24). */
function sendStoreError(res: Response, err: unknown): void {
  const live = entityNotLiveResponse(err);
  if (live) {
    res.status(live.status).json(live.body);
    return;
  }
  if (err instanceof PageKindMismatchError) {
    res.status(400).json({ error: err.message, code: "KIND_MISMATCH" });
    return;
  }
  if (err instanceof PageNotFoundError) {
    res.status(404).json({ error: err.message, code: "ENTRY_NOT_FOUND" });
    return;
  }
  if (err instanceof PageConcurrentEditError) {
    res.status(409).json({ error: err.message, code: "CONCURRENT_EDIT" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * PUT the bespoke-HTML body of a Page (SPEC-047/ADR-056 REQ-4) —
 * `PUT /api/admin/v1/workspaces/:workspaceId/pages/:pageId/html`, body `{ html: string }`.
 *
 * ## Why this is a separate route from `pages/update.ts`, not a field on it
 *
 * `pages/update.ts` writes title/slug/status through `updatePost`, which by construction can only
 * ever produce `body_format: "doc"` rows (`post.ts`'s `resolveBodyFields`, ADR-056 CIC-3). The
 * bespoke-HTML body is written by `PagesHtmlDocumentStore` and nothing else. Folding the html body
 * into the metadata route would put both writers behind one handler and make the invariant a
 * convention a future edit can quietly break; keeping them apart is what makes "exactly one writer
 * of html rows" a structural fact.
 *
 * It also means the two have genuinely different concurrency semantics, and only one of them can
 * offer compare-and-set: the store conditions its `UPDATE` on the `version` captured at `read()`
 * (CIC-1), so a second admin's write lands as a 409 rather than silently discarding the first's
 * edit. `updatePost` has no such guarantee and does not need one for a title.
 *
 * ## First write births the row
 *
 * `ensureHtmlFormat` runs before the write, converting a still-`"doc"` Page to `"html"` and seeding
 * it with the starter skeleton. It is idempotent, so this route is the same two calls whether the
 * page is brand new or has been edited fifty times. **The conversion drops `body_json`** — see that
 * method's own doc; today's only caller is the Pages editor acting on a freshly created Page, and
 * this route must not be offered on a Page carrying authored Tiptap content without a warning the
 * operator actually sees.
 *
 * ## Authorization
 *
 * Gated on `pages.edit_html` (SPEC-047 REQ-9), matching what the agent-tool path
 * (`features/pages/tool-registrations.ts`'s `pages_write_html`) checks. The two writers of
 * `"html"`-format rows are the only two, and they agree.
 *
 * History, because two earlier states of this comment are still quoted elsewhere. Until 2026-08-10
 * this route checked NOTHING — authenticated like every other admin route, but with no per-action
 * authz, so any principal who could reach the admin could write raw unsanitized HTML into the public
 * site. From 2026-08-10 it checked `content.write`, which closed that but not REQ-9's actual intent:
 * the built-in `editor` role holds `content.write`, so an `editor` could still author script into
 * every visitor's browser. This file said so plainly and recorded the gap as blocked on the
 * `@jini-ai/cms` repo, since `authorize()` matches literal `policy_permissions` rows and the built-in
 * role seed lives there.
 *
 * **That blocker was not real, and the gap is now closed.** `registerPermissionMigration` is exported
 * to hosts for exactly this, and the boot-time fan-out that consumes it (`migrateDeprecatedPermission
 * Grants`, called from `features/identity/wiring.ts`) already lives in this repo. `features/pages/
 * permissions.ts` registers `theme.edit -> pages.edit_html`, so every principal already trusted with
 * raw theme source inherits raw-page-HTML authoring: `admin` and `owner` yes, `editor` and `viewer`
 * no. No library change was needed.
 *
 * **Capability removed, deliberately:** an `editor` can no longer write a Page's HTML through this
 * route or through `pages_write_html`. That is REQ-9's whole intent, and it is a real behavior
 * change — an editor keeps `content.write` and every ordinary content operation, and loses only
 * raw-HTML page authoring. `features/pages/__tests__/edit-html-permission.test.ts` pins both halves.
 *
 * ## Not yet done, deliberately, and tracked
 *
 * - **No rate limit** (REQ-10, `PAGES_GENERATION_PER_PRINCIPAL`). Matters once a model drives this
 *   endpoint rather than a human typing in a textarea.
 * - **No command-gateway/change-set record**, unlike `pages/update.ts`. Body writes are therefore
 *   absent from the mutation audit trail and are not revertible through `change-sets/revert`.
 * - **No HTML sanitization, and that is now a decision rather than a gap.** The stored markup is
 *   rendered into the public site unmodified. Sanitizing it would delete the feature — authoring
 *   arbitrary markup is what a Page IS — so the exposure is bounded by WHO may write it instead:
 *   the same principals already trusted with raw theme source, which is the same trust level the
 *   theme layer has always had. The authoring preview is separately safe by construction
 *   (opaque-origin `srcdoc`, no `allow-same-origin`); the published page is not sandboxed. A holder
 *   of `pages.edit_html` can still put script on the public site, and that is intended.
 */
export const registerAdminPageUpdateHtmlRoute: ContentRouteRegistrar = (app, deps) => {
  app.put(
    "/api/admin/v1/workspaces/:workspaceId/pages/:pageId/html",
    rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }),
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      try {
        // Authorization runs BEFORE body validation, so an unauthorized principal learns nothing
        // about what this endpoint accepts — same ordering `pages/list.ts` uses.
        if (!(await allowedToWrite(deps, res))) return;

        const pageId = String(req.params.pageId ?? "");
        const html = req.body?.html;

        if (typeof html !== "string") {
          res.status(400).json({ error: "'html' must be a string", code: "VALIDATION_ERROR" });
          return;
        }

        const store = deps.pagesHtmlStore({ workspaceId: deps.workspaceId, postId: pageId });

        // Idempotent: a no-op once the page is already html-format, so both the first write and
        // every later one take this identical path.
        await store.ensureHtmlFormat(DEFAULT_PAGE_SKELETON);
        // `read()` is what captures the version `write()` conditions its compare-and-set on — not a
        // wasted round trip. Dropping it would turn the write into the unconditional overwrite
        // CIC-1 exists to prevent.
        await store.read();
        await store.write(html);

        const updated = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: pageId });
        if (!updated) {
          // The row was deleted between the write and this read. Nothing was lost that the caller
          // still owns, but it must not be told the write succeeded against a live page.
          res.status(404).json({ error: `page '${pageId}' was not found`, code: "ENTRY_NOT_FOUND" });
          return;
        }

        res.json(toAdminPostResponse(updated));
      } catch (err) {
        sendStoreError(res, err);
      }
    }
  );
};
