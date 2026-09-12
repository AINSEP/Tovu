import type { Express, Request, Response } from "express";

import { findTheme, renderStaticPage, renderStaticPartial, type DiscoveredTheme } from "#src/features/theme/index";
import { listPublishedPosts } from "#src/features/post/index";
import { authorizeThemeSetPermission } from "../../admin-http/routes/themes/explore.js";
import { requireAdminSession } from "../../admin-http/dev-auth.js";
import type { RouteDeps } from "#src/server/routes/types";
import { renderSite, type SiteProduct } from "../http/site/render.js";
import {
  resolveWidgetsForRender,
  resolveMediaTransformVersionsForRender,
  resolveMediaAssetMetadataForRender,
  resolveHtmlEmbedsForRender,
  resolveSiteTitleForRender,
} from "../routes/site/pages.js";

/**
 * @file Serves any static theme's page, fully rendered, at `/theme-explore/{themeId}/{pageId}` — the
 * admin Explore screen's preview iframe. Also serves a theme's PARTIALS (`nav`, `footer`, `sidebar`,
 * …) standalone at `/theme-explore/{themeId}/partial/{partialId}`, a sibling route rather than a
 * branch of the page route: partial ids and page ids are different namespaces (a theme could
 * legitimately have a page and a partial that happen to share a name), and a distinct URL shape says
 * so instead of relying on a lookup order to disambiguate.
 *
 * Rendered through the real loader (`renderStaticPage`), not a prebuilt copy: markers resolved,
 * design tokens inlined, asset paths rewritten to `/theme-assets/{themeId}/`. That last part is why
 * this has to be a real URL on the SITE origin rather than HTML posted into a `srcDoc` iframe — a
 * `srcDoc` document resolves those relative asset paths against the ADMIN's origin, where nothing
 * serves them, so every stylesheet 404s and the preview is a wall of unstyled text.
 *
 * Distinct from `theme-preview-static.ts`, which serves each theme's prebuilt `preview/` folder from
 * `build-preview.mjs`. That one is a spike predating static-tier rendering being wired at all, and
 * its header still says so; this is the real path and that one should be retired.
 *
 * The two STATIC-tier routes above are ungated, matching `theme-static-assets.ts`'s existing posture:
 * a theme's pages and CSS are already served to anonymous visitors by the site itself, and
 * `express.static` there already exposes each theme's `pages/*.html` directly. Rendering a page
 * nobody activated reveals nothing the theme files do not, and the admin's own auth cannot reach an
 * iframe pointed at the site origin anyway.
 *
 * The TEMPLATED-tier route below (2026-08-12, `.liquid` Preview-tab fix) is GATED, deliberately NOT
 * following that same ungated reasoning even though it lives in this same file and serves a
 * structurally similar purpose. That reasoning rests on several conditions holding simultaneously
 * (only published content ever flows in, products are always empty, the render pipeline's own
 * escaping never changes) — conditions that are correct today but are each independently a decision
 * someone could change later without revisiting this file. Every OTHER route on this resource
 * (`routes/admin/themes/explore.ts`) is gated on `theme.set`; an ungated new route would be the one
 * anomaly a future reader has to re-derive the justification for. Gating it costs one line
 * (`requireAdminSession` + the same `authorizeThemeSetPermission` check `explore.ts` already shares
 * across its own routes) and removes the whole question.
 *
 * Reads `deps.themes` directly rather than through a `getThemes()` indirection: `rescanThemes`
 * (`features/theme/theme.ts`) mutates that array IN PLACE (`themes.length = 0; themes.push(...)`),
 * never replaces the reference, so a theme downloaded after boot is previewable without a restart
 * exactly the same way a plain field read would be.
 */

/**
 * The lookup + tier check the two STATIC-tier routes below need before they can render anything:
 * find the theme, 404 if it doesn't exist, 422 if it isn't `static` tier. Returns the theme on
 * success, or `null` after already writing the error response — the caller's job is just to `return`
 * in that case, same shape `findTheme` itself uses for "not found".
 */
function resolveStaticTheme(
  res: Response,
  required: { themes: DiscoveredTheme[]; themeId: string }
): DiscoveredTheme | null {
  const { themes, themeId } = required;
  const theme = findTheme({ themes, id: themeId });
  if (!theme) {
    res.status(404).type("text/plain").send(`theme '${themeId}' was not found`);
    return null;
  }
  if (theme.manifest.tier !== "static") {
    res
      .status(422)
      .type("text/plain")
      .send(`theme '${themeId}' is a '${theme.manifest.tier}' theme; only static themes preview this way`);
    return null;
  }
  return theme;
}

/**
 * Reverse of `theme.ts`'s `resolveLiquidTemplateId` — the `SiteRenderContext` shape (a posts list, a
 * single post, a products list, a single product) a given `.liquid` template FILE was authored
 * against, derived from the file's OWN name. `resolveLiquidTemplateId` answers a different question
 * ("which file does the live site fall back to for this route", preferring `post` over `entry` when a
 * theme ships both) — the wrong one here, since Explore is asking "what does THIS SPECIFIC file
 * expect", for a file the forward resolver might not even pick for its own nominal route. This only
 * decides the CONTEXT shape; `renderSite`'s own `liquidTemplateIdOverride` (separately) is what makes
 * sure the exact file selected is the one actually rendered, not whichever one the forward resolver
 * would have preferred.
 *
 * @complexity O(1).
 */
function liquidTemplateContextRoute(templateId: string): "home" | "post" | "products" | "product" | null {
  if (templateId === "home") return "home";
  if (templateId === "products") return "products";
  if (templateId === "product") return "product";
  if (templateId === "post" || templateId === "entry") return "post";
  return null;
}

/**
 * The lookup + tier + template-existence + route-shape checks the TEMPLATED-tier route needs
 * before it can render anything: find the theme, 404 if missing, 422 if not `templated` tier, 404
 * if `templateId` names no real `.liquid` file, 422 if that file's name maps to no recognized
 * `SiteRenderContext` shape. Returns the resolved `{theme, route}` on success, or `null` after
 * already writing the error response — same "caller just returns" contract as
 * {@link resolveStaticTheme}.
 */
function resolveTemplatedPreviewTarget(
  res: Response,
  required: { themes: DiscoveredTheme[]; themeId: string; templateId: string }
): { theme: DiscoveredTheme; route: "home" | "post" | "products" | "product" } | null {
  const { themes, themeId, templateId } = required;
  const theme = findTheme({ themes, id: themeId });
  if (!theme) {
    res.status(404).type("text/plain").send(`theme '${themeId}' was not found`);
    return null;
  }
  if (theme.manifest.tier !== "templated") {
    res
      .status(422)
      .type("text/plain")
      .send(`theme '${themeId}' is a '${theme.manifest.tier}' theme; only templated themes preview this way`);
    return null;
  }
  if (theme.liquidTemplates[templateId] === undefined) {
    res.status(404).type("text/plain").send(`template '${templateId}' was not found in theme '${themeId}'`);
    return null;
  }
  const route = liquidTemplateContextRoute(templateId);
  if (!route) {
    res
      .status(422)
      .type("text/plain")
      .send(`template '${templateId}' has no recognized route shape and cannot be previewed here`);
    return null;
  }
  return { theme, route };
}

export function registerThemePagePreview(app: Express, deps: RouteDeps): void {
  app.get("/theme-explore/:themeId/:pageId", (req: Request, res: Response) => {
    const themeId = String(req.params.themeId ?? "");
    const pageId = String(req.params.pageId ?? "");

    const theme = resolveStaticTheme(res, { themes: deps.themes, themeId });
    if (!theme) return;

    const html = renderStaticPage({ theme, pageId });
    if (html === null) {
      res.status(404).type("text/plain").send(`page '${pageId}' was not found in theme '${themeId}'`);
      return;
    }

    // Never cached: the Explore screen re-requests this immediately after every save, and a cached
    // response would show the operator their pre-save markup and read as "the save did not work".
    res.set("Cache-Control", "no-store").type("text/html").send(html);
  });

  // Partials (`nav`, `footer`, `sidebar`, …) previewed standalone — see this file's header for why
  // this is a sibling route rather than a fallback inside the page route above.
  app.get("/theme-explore/:themeId/partial/:partialId", (req: Request, res: Response) => {
    const themeId = String(req.params.themeId ?? "");
    const partialId = String(req.params.partialId ?? "");

    const theme = resolveStaticTheme(res, { themes: deps.themes, themeId });
    if (!theme) return;

    const html = renderStaticPartial({ theme, partialId });
    if (html === null) {
      res.status(404).type("text/plain").send(`partial '${partialId}' was not found in theme '${themeId}'`);
      return;
    }

    res.set("Cache-Control", "no-store").type("text/html").send(html);
  });

  // Templated (`.liquid`) theme preview — see this file's header for why this route, unlike its two
  // siblings above, is gated. `requireAdminSession` is applied as route-scoped middleware (not a
  // blanket mount over this whole file) so the two static-tier routes above stay exactly as ungated
  // as they always were.
  app.get(
    "/theme-explore/:themeId/template/:templateId",
    requireAdminSession(deps),
    async (req: Request, res: Response) => {
      try {
        if (!(await authorizeThemeSetPermission(deps, res))) return;

        const themeId = String(req.params.themeId ?? "");
        const templateId = String(req.params.templateId ?? "");

        const target = resolveTemplatedPreviewTarget(res, { themes: deps.themes, themeId, templateId });
        if (!target) return;
        const { theme, route } = target;

        // Real content, no fixtures: the same `listPublishedPosts` the live site itself renders from
        // (`routes/site/pages.ts`) — never a draft, matching the visibility bar the ungated static
        // routes above already rely on. A workspace with no published posts yet renders with `post`
        // left `undefined`, which is an honest, correct preview state (an empty entry page), not a
        // failure to seed data.
        const { posts } = await listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } });
        const post = route === "post" ? posts[0] : undefined;

        // Products stay hard-coded empty — a deliberate containment, not an unfinished wiring gap.
        // `fashion-modern/templates/product.liquid:118` still contains a bare
        // `{{ product.description | raw }}`, inert TODAY only because `description` is never a key on
        // `SiteProduct` (`storefront.ts`/`render.ts`'s `siteProductRenderShape` both build explicit
        // field lists with no `description` — see the 2026-08-13 security pass, Note on priority #4).
        // Wiring a real `commerceProductRepo`/`store` into THIS route is exactly the kind of change
        // that could someday put `description` back on this object without anyone touching that
        // template line — do not "finish" this by adding one without re-verifying that `| raw` stays
        // inert first. A workspace with real commerce products configured will show them on the live
        // site but NOT in this preview — a disclosed, deliberate divergence, not a bug.
        const products: SiteProduct[] = [];
        const product = route === "product" ? products[0] : undefined;

        const [widgets, mediaTransformVersions, mediaAssetMetadata, pageHtmlEmbeds] = await Promise.all([
          resolveWidgetsForRender(deps, theme, post),
          resolveMediaTransformVersionsForRender(deps),
          resolveMediaAssetMetadataForRender(deps, post),
          resolveHtmlEmbedsForRender(deps, post),
        ]);

        const html = await renderSite({
          theme,
          route,
          siteTitle: await resolveSiteTitleForRender(deps),
          posts,
          post,
          products,
          product,
          widgets,
          mediaTransformVersions,
          mediaAssetMetadata,
          pageHtmlEmbeds,
          // The exact file the operator selected, not whichever one `resolveLiquidTemplateId` would
          // have preferred for `route` — see `liquidTemplateContextRoute`'s own doc.
          liquidTemplateIdOverride: templateId,
        });

        // Never cached, same reasoning as the two static-tier routes above.
        res.set("Cache-Control", "no-store").type("html").send(html);
      } catch {
        res.status(500).type("text/plain").send("preview render failed");
      }
    }
  );
}
