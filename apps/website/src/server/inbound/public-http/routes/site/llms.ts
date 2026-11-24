import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { computeIndexableEntries, renderLlmsTxt } from "@jini-ai/cms/seo";
import { resolveSiteTitle } from "#src/features/settings/index";
import { seoForRequest } from "../../http/site/seo-render-context.js";
import type { SeoRouteRegistrar } from "#src/server/runtime/composition/modules/seo";

/**
 * @file `GET /llms.txt` — public, unauthenticated (owner decision TM-TOVU-2026-08-31, per
 * `development/docs/ai-first-docs-checklist.md` "Do now" item 1). Follows the llmstxt.org
 * convention: an H1 title, a one-line blockquote summary, then H2-labeled sections of
 * `- [title](url): description` links — a machine-readable index a coding-agent tool (Cursor,
 * Claude Code, Windsurf, Copilot, Cline, Aider) can fetch in one request to learn the shape of the
 * whole site before reading further. Registered ahead of the site's `/:slug` catch-all, same as
 * `registerSeoRobotsRoute`/`registerSeoSitemapRoute` (`robots.ts`/`sitemap.ts` in this
 * directory) — see `modules/seo.ts`'s file header for the ordering requirement.
 *
 * 2026-09-04 rewrite: the checklist originally scoped this to a hand-curated `CURATED_DOCS` list
 * (Phase 2 note: "needs an explicit 'which pages count as docs' tag or convention — not built
 * yet"). That list drifted the moment a page was published, renamed, or unpublished outside it, so
 * this now derives the index from `computeIndexableEntries` (`Jini/packages/cms/src/seo/sitemap.ts`) — the same
 * publish/visibility/`noindex` filter `sitemap.xml` is built from (INV-04/05) — instead of
 * maintaining a second, hand-authored notion of "which pages count." Every published, publicly
 * visible, non-`noindex` post/page is listed; a members/paid/tiers-gated or draft page can never
 * leak here, same guarantee `sitemap.xml` gives. This is a deliberate, disclosed behavior change,
 * not silent drift — see `__tests__/llms.route.test.ts`'s file header for what it replaces.
 */

const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

export const registerLlmsTxtRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/llms.txt", async (req, res) => {
    try {
      await deps.seoReady;
      const entries = await computeIndexableEntries({
        // Share sitemap/feed's serving origin; the exporter rewrites it for its destination.
        deps: seoForRequest({ req, deps: deps.seoDeps }),
        input: { workspaceId: deps.workspaceId },
      }, {});
      const title = await resolveSiteTitle(
        { settingsRepo: deps.settingsRepo, preservationStore: deps.siteTitlePreservationStore, workspaceRepo: deps.workspaceRepo, siteDisplayName: deps.siteDisplayName },
        { workspaceId: deps.workspaceId },
      );
      const { defaultDescription: description } = await deps.seoDeps.settings.getSeoSettings({ workspaceId: deps.workspaceId });
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("text/markdown").send(renderLlmsTxt({ entries, title }, { description }));
    } catch (error) {
      const { errorId } = reportServerFailure({ error, operation: "public:llms" }, { tracker: res.locals.adminFailureTracker });
      res.status(500).type("text/plain").send(`The site couldn’t load the site index. Reload this page and report this error ID if it keeps happening. Error ID: ${errorId}`);
    }
  });
};
