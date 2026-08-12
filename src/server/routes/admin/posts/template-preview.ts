import { getAdminPostByIdOrSlug, PostNotFoundError, type PostRecord } from "#src/features/post/index";
import { getPresentationSettings } from "#src/features/presentation/index";
import { renderViaTemplate, resolveActiveTheme, resolveStaticMenusForRender } from "../../site/pages";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * @file Template-preview fix (2026-08-11) — `ADS-memory/reports/implementation/
 * 2026-08-11-template-preview-render-bug.md` has the full root-cause writeup. Short version: both
 * editors' Preview tab shows the real published page/post (`siteUrl`, full theme CSS/nav/footer) only
 * when `status === "published" && !dirty`; picking a DIFFERENT template than the one already saved
 * marks the row dirty (by design — it is an unsaved change), which used to fall the preview all the
 * way back to the raw, unstyled body with no template applied at all. That fallback also does not
 * read `templateChoice`, so switching between templates while dirty rendered byte-identical output —
 * "it doesn't re-render" was a symptom of the SAME cause as "it renders with no CSS", not two bugs.
 *
 * This route lets the editor preview the row through a PENDING (possibly unsaved) template choice,
 * reusing the exact render pipeline the public site uses (`renderViaTemplate`) rather than a second,
 * drift-prone implementation — the one thing it does differently from a normal page load is override
 * `templateChoice` on an in-memory clone of the fetched record before rendering; nothing is written
 * back to storage. Looked up by id via `getAdminPostByIdOrSlug` (any status, unlike the public
 * `getPublishedPostBySlug` the live-site iframe branch uses) rather than by public slug — but the
 * editors deliberately only ROUTE a `status === "published"` row through this endpoint (see
 * `PagePreview`/`PostPreview`'s own doc comments): a draft's own `{"type":"content"}` slot still
 * resolves through `resolveHtmlPageEmbeds`'s visibility-filtered "content" resolver
 * (`resolver-service.ts`'s guard 2), which returns nothing for an unpublished row, so a draft rendered
 * here would show styled chrome around an EMPTY body — confirmed live in this route's own integration
 * test (`admin-post-template-preview.test.ts`'s draft case). The id-based lookup stays status-agnostic
 * at THIS layer (a real, if currently unreached, capability — an authenticated caller can still hit it
 * for a draft id and get a gracefully-degraded body, never a crash or a raw unresolved marker) so
 * fixing that visibility gap later does not require touching this route's own lookup.
 *
 * Mounted under `/api/admin/v1/workspaces/:workspaceId/posts/:postId/...`, the same URL family
 * `get-by-id.ts`/`update.ts` already use for both Posts and Pages (`PostEditor.tsx`'s own header:
 * "Shared between posts and pages via the same `/admin/posts/{id}` route") — `getAdminPostByIdOrSlug`
 * is kind-blind, so one route serves both editors' Preview tabs. Gated by the same global
 * `requireAdminSession` mount every other `/api/admin/*` route relies on (`app.ts`), so no extra
 * auth wiring is needed here beyond calling `getAuthedPrincipal` the same way `get-by-id.ts` does.
 *
 * Returns `text/html` directly rather than JSON — the client points an `<iframe src>` straight at
 * this URL (same reasoning `middleware/theme-page-preview.ts` gives for why a themed preview has to
 * be a real URL rather than posted into a `srcDoc` sandbox: the rendered HTML's asset paths are
 * root-relative to `/theme-assets/{themeId}/...`, which only resolves correctly when the browser
 * believes it's looking at a real page, not an inline document).
 */
export const registerAdminPostTemplatePreviewRoute: ContentRouteRegistrar = (app, deps) => {
  app.get(
    "/api/admin/v1/workspaces/:workspaceId/posts/:postId/template-preview",
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).type("text/plain").send("workspace was not found");
        return;
      }

      try {
        const principal = getAuthedPrincipal(res);
        const authResult = await deps.authorize({
          principalId: principal.id,
          permission: "content.read",
          workspaceId: deps.workspaceId,
        });
        if (!authResult.allowed) {
          res.status(403).type("text/plain").send(`principal '${principal.id}' is not authorized for 'content.read'`);
          return;
        }

        const { post } = await getAdminPostByIdOrSlug({
          deps: { repo: deps.postRepo },
          input: { workspaceId: deps.workspaceId, idOrSlug: String(req.params.postId ?? "") },
        });

        const { settings } = await getPresentationSettings({
          deps: { repo: deps.presentationRepo },
          input: { workspaceId: deps.workspaceId },
        });
        const theme = resolveActiveTheme(deps, settings.activeThemeId);
        if (!theme) {
          res.status(500).type("text/plain").send("no themes installed");
          return;
        }

        // Tri-state query contract, matching `templateChoice`'s own tri-state (see
        // `resolveTemplate`'s doc): the key absent entirely means "never chosen" (`null`), present but
        // empty (`?templateChoice=`) means the explicit "No template chosen" opt-out (`""`), present
        // with a value means that template filename. The admin client always sends one of the first
        // two shapes explicitly — see `templatePreviewUrl` in `apps/admin/src/lib/api.ts`.
        const rawTemplateChoice = req.query.templateChoice;
        const overrideTemplateChoice = rawTemplateChoice === undefined ? null : String(rawTemplateChoice);
        // Never persisted — a shallow clone rendered once for this response and discarded.
        const previewPost: PostRecord = { ...post, templateChoice: overrideTemplateChoice };

        const staticMenus = await resolveStaticMenusForRender(deps, theme, `/${post.slug}`);
        const html = await renderViaTemplate(deps, theme, previewPost, staticMenus);

        // Never cached: re-requested on every template selection, and a cached response would show
        // the operator a stale template and read as "the picker did nothing" — the exact bug this
        // route exists to fix (mirrors `theme-page-preview.ts`'s identical no-store rule).
        res.set("Cache-Control", "no-store").type("html").send(html);
      } catch (err) {
        if (err instanceof PostNotFoundError) {
          res.status(404).type("text/plain").send(err.message);
          return;
        }
        res.status(500).type("text/plain").send("preview render failed");
      }
    }
  );
};
