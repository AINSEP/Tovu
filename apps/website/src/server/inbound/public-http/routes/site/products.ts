import { resolveProtocol } from "../oauth/public-origin.js";
import { productCheckoutWhenReady } from "./product-checkout.js";
import { resolveRenderThemeId } from "../../middleware/render-theme-override.js";
import { NO_THEME_ID, resolveActiveTheme } from "#src/features/theme/active-theme";
import { renderSite, type SiteProduct } from "../../http/site/render.js";
import { markOffSiteLinksOpenInNewTab } from "../../http/site/external-links.js";
import { CACHE_CONTROL_PRIVATE_STATIC_EXPORT, isStaticExportRequest, resolveSiteTitleForRender, resolveSiteAssistantWidgetForRequest } from "./pages.js";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Public site: `/products` (grid) and `/products/:id` (detail).
 *
 * Two divergences from `pages.ts` were collapsed 2026-09-12, both cases of this route quietly
 * keeping a private copy of something `pages.ts` already owned:
 *
 * 1. **Theme id resolution.** Both handlers used to call `getPresentationSettings` RAW while
 *    `pages.ts` went through `resolveActiveThemeId`. That helper exists precisely to degrade a
 *    workspace with no `presentation_settings` row to `""` instead of letting
 *    `PresentationSettingsNotFoundError` escape — so the same missing row that `GET /` absorbed
 *    threw here and landed in the catch below as `<h1>Site error</h1>`. Two public routes, two
 *    behaviours, one missing row. Now one helper, one behaviour.
 * 2. **The site title.** Was a private duplicate of the literal `pages.ts` then exported (and
 *    `middleware/theme-page-preview.ts` imported). Two copies of a user-visible string that could
 *    drift independently; now one. Since SPEC-050 it is `pages.ts`'s `resolveSiteTitleForRender`.
 *
 * `CACHE_CONTROL_PUBLIC_PAGE` below is deliberately NOT collapsed the same way — see its own doc.
 */

/** Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2) — same header,
 *  same reasoning as `pages.ts`'s own `CACHE_CONTROL_PUBLIC_PAGE` (see that file's doc): neither
 *  handler below reads `req` for anything beyond the route param, so the response is identical for
 *  every anonymous visitor requesting the same URL. Not shared as a cross-file export — two short,
 *  independently-readable copies over a new cross-file coupling for one string constant. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/** This file's two render handlers' `Cache-Control`: the shared-cacheable directive, except for a
 *  request carrying the static-export marker, whose widget-less body must never be stored under the
 *  plain URL (`pages.ts`'s `isStaticExportRequest` doc). */
function cacheControlFor(req: Parameters<typeof isStaticExportRequest>[0]): string {
  return isStaticExportRequest(req) ? CACHE_CONTROL_PRIVATE_STATIC_EXPORT : CACHE_CONTROL_PUBLIC_PAGE;
}

/** Commerce owns the bounded catalog projection. The host's adapter applies the activation
 * guard before any catalog reads. The public renderer has no legacy store or payment access. */
export interface CommerceSiteAdapterDeps extends RouteDeps {
  commerceCatalog?: { listProducts(required?: Record<string, never>, optional?: Record<string, never>): Promise<SiteProduct[]> };
}

/** Shared by live routes and static export: one bounded projection, no per-product price reads.
 * An absent commerce plugin exposes no products. @complexity O(24) response rows, <=2 DB reads. */
export async function resolveStorefrontProducts(deps: CommerceSiteAdapterDeps): Promise<SiteProduct[]> {
  return (await deps.commerceCatalog?.listProducts({}, {})) ?? [];
}

/**
 * Public site: `/products` (grid) and `/products/:id` (detail), rendered through the active
 * theme's own `products`/`product` templates. Registered BEFORE the `/:slug` catch-all, same
 * reasoning as `registerStoreRoutes`.
 */
export const registerProductRoutes = (app: import("express").Express, deps: CommerceSiteAdapterDeps): void => {
  app.get("/products", async (req, res) => {
    try {
      const products = await resolveStorefrontProducts(deps);
      const [activeThemeId, siteAssistantEnabled, siteTitle] = await Promise.all([
        resolveRenderThemeId(res, deps),
        resolveSiteAssistantWidgetForRequest({ request: req, deps }),
        resolveSiteTitleForRender(deps),
      ]);
      const resolved = resolveActiveTheme(deps, activeThemeId);
      if (resolved === null) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }
      // `NO_THEME_ID` -> `null`, which `renderSite` reads as "render this page unstyled". The two
      // must not share a guard: `null` here means nothing is INSTALLED (a broken site, hence the
      // 500 above), while the sentinel means the operator turned styling off on purpose and expects
      // a real page back.
      const theme = resolved === NO_THEME_ID ? null : resolved;
      const html = await renderSite({ theme, route: "products", siteTitle, posts: [], products, siteAssistantEnabled });
      res.set("Cache-Control", cacheControlFor(req)).type("html").send(markOffSiteLinksOpenInNewTab(html, req.hostname));
    } catch {
      res.status(500).type("html").send("<h1>The product catalog could not be loaded</h1><p>Please try again shortly.</p>");
    }
  });

  app.get("/products/:id", async (req, res) => {
    try {
      const id = String(req.params.id ?? "");
      const products = await resolveStorefrontProducts(deps);
      // Id or slug (readable-slugs S7) — id first, same fallback contract as posts/pages/menus.
      const product = products.find((p) => p.id === id) ?? products.find((p) => p.slug === id);
      if (!product) {
        res.status(404).type("html").send("<h1>404 — product not found</h1><p><a href='/products'>All products</a></p>");
        return;
      }
      const [activeThemeId, siteAssistantEnabled, siteTitle] = await Promise.all([
        resolveRenderThemeId(res, deps),
        resolveSiteAssistantWidgetForRequest({ request: req, deps }),
        resolveSiteTitleForRender(deps),
      ]);
      const resolved = resolveActiveTheme(deps, activeThemeId);
      if (resolved === null) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }
      // `NO_THEME_ID` -> `null`, which `renderSite` reads as "render this page unstyled". The two
      // must not share a guard: `null` here means nothing is INSTALLED (a broken site, hence the
      // 500 above), while the sentinel means the operator turned styling off on purpose and expects
      // a real page back.
      const theme = resolved === NO_THEME_ID ? null : resolved;
      let html = await renderSite({ theme, route: "product", siteTitle, posts: [], products, product, siteAssistantEnabled });
      html = await productCheckoutWhenReady({ html, workspaceId: deps.workspaceId, priceId: product.priceId,
        productSlug: product.slug || product.id, currentOrigin: `${resolveProtocol(req)}://${req.get("host")}`, commerce: deps.commerce });
      res.set("Cache-Control", cacheControlFor(req)).type("html").send(markOffSiteLinksOpenInNewTab(html, req.hostname));
    } catch {
      res.status(500).type("html").send("<h1>This product could not be loaded</h1><p>Please try again shortly.</p>");
    }
  });
};
