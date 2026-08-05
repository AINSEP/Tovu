import {
  DEFAULT_PAGE_SKELETON,
  PageConcurrentEditError,
  PageKindMismatchError,
  PageNotFoundError,
} from "#src/features/pages/index";
import { toAdminPostResponse } from "#src/server/http/admin/posts";
import {
  CONTENT_ENTRY_MAX_BODY_BYTES,
  rejectOversizedJsonBody,
} from "#src/server/middleware/body-size-limit";
import type { ContentRouteRegistrar } from "../content/deps";

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
 * ## Not yet done, deliberately, and tracked
 *
 * - **No `pages.edit_html` permission gate** (SPEC-047 REQ-9). This route is authenticated like
 *   every other admin route but carries no per-action authz of its own yet, so any principal who
 *   can reach the admin can write a Page's HTML. That is a real gap, not an oversight — REQ-9 lands
 *   with the permission seed, and this route is prototype-stage until it does.
 * - **No rate limit** (REQ-10, `PAGES_GENERATION_PER_PRINCIPAL`). Matters once a model drives this
 *   endpoint rather than a human typing in a textarea.
 * - **No command-gateway/change-set record**, unlike `pages/update.ts`. Body writes are therefore
 *   absent from the mutation audit trail and are not revertible through `change-sets/revert`.
 * - **No HTML sanitization.** The stored markup is rendered into the public site. The editor's own
 *   preview is safe by construction (opaque-origin `srcdoc`, no `allow-same-origin`), but the
 *   published page is not sandboxed — this is the same trust level the theme layer already has, and
 *   it needs a real decision before Pages ships to anyone but the site's own admins.
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

      const pageId = String(req.params.pageId ?? "");
      const html = req.body?.html;

      if (typeof html !== "string") {
        res.status(400).json({ error: "'html' must be a string", code: "VALIDATION_ERROR" });
        return;
      }

      try {
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
    }
  );
};
