import type { Request, Response } from "express";
import { resolveProtocol } from "../../../../../platform/express/public-origin.js";
import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { productCheckoutWhenReady, type ProductCheckoutReadiness } from "./product-checkout.js";
import { resolveRenderThemeId } from "../../middleware/render-theme-override.js";
import { NO_THEME_ID, resolveActiveTheme } from "#src/features/theme/active-theme";
import { renderSite } from "../../http/site/render-site.js";
import type { SiteProduct } from "../../http/site/render-context.js";
import { markOffSiteLinksOpenInNewTab } from "../../http/site/external-links.js";
import { resolveSiteAssistantWidgetForRequest } from "./pages/render-context/widgets.js";
import { CACHE_CONTROL_PRIVATE_STATIC_EXPORT, isStaticExportRequest } from "./pages/request-policy.js";
import { resolveSiteTitleForRender } from "./pages/render-context/site-title.js";
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
  commerceCatalog?: {
    listProducts(required?: Record<string, never>, optional?: { readiness?: ProductCheckoutReadiness }): Promise<SiteProduct[]>;
    findProduct?(required: { idOrSlug: string }, optional?: { readiness?: ProductCheckoutReadiness }): Promise<SiteProduct | null>;
  };
}

/** Shared by live routes and static export: one bounded projection, no per-product price reads.
 * An absent commerce plugin exposes no products. @complexity O(24) response rows, <=2 DB reads. */
export async function resolveStorefrontProducts(deps: CommerceSiteAdapterDeps, optional: { readiness?: ProductCheckoutReadiness } = {}): Promise<SiteProduct[]> {
  return (await deps.commerceCatalog?.listProducts({}, optional)) ?? [];
}

/** Missing adapters expose no product, while registered adapters keep the scoped point lookup. */
async function findStorefrontProduct({ deps, id, readiness }: { deps: CommerceSiteAdapterDeps; id: string; readiness: ProductCheckoutReadiness | undefined }): Promise<SiteProduct | null> {
  return await deps.commerceCatalog?.findProduct?.({ idOrSlug: id }, { readiness }) ?? null;
}

/** The theme, assistant widget flag and site title a storefront page renders with; null once the "no themes installed" 500 is sent. */
async function resolveStorefrontPage(required: { req: Request; res: Response; deps: CommerceSiteAdapterDeps }, _optional = {}) {
  const { req, res, deps } = required;
  const [activeThemeId, siteAssistantEnabled, siteTitle] = await Promise.all([
    resolveRenderThemeId(res, deps),
    resolveSiteAssistantWidgetForRequest({ request: req, deps }),
    resolveSiteTitleForRender(deps),
  ]);
  const resolved = resolveActiveTheme({ deps, activeThemeId });
  if (resolved === null) {
    res.status(500).type("html").send("<h1>No themes installed</h1>");
    return null;
  }
  // `NO_THEME_ID` -> `null`, which `renderSite` reads as "render this page unstyled". The two
  // must not share a guard: `null` here means nothing is INSTALLED (a broken site, hence the
  // 500 above), while the sentinel means the operator turned styling off on purpose and expects
  // a real page back.
  const theme = resolved === NO_THEME_ID ? null : resolved;
  return { theme, siteAssistantEnabled, siteTitle };
}

/**
 * Public site: `/products` (grid) and `/products/:id` (detail), rendered through the active
 * theme's own `products`/`product` templates. Registered BEFORE the `/:slug` catch-all, same
 * reasoning as `registerStoreRoutes`.
 */
export const registerProductRoutes = ({ app, deps }: { app: import("express").IRouter; deps: CommerceSiteAdapterDeps }, _optional: Record<string, never> = {}): void => {
  app.get("/products", async (req, res) => {
    try {
      const products = await resolveStorefrontProducts(deps, { readiness: res.locals?.commerceStatus });
      const page = await resolveStorefrontPage({ req, res, deps });
      if (page === null) return;
      const { theme, siteAssistantEnabled, siteTitle } = page;
      const html = await renderSite({ renderAssets: res.locals.siteConsentAssets, theme, route: "products", siteTitle, posts: [], products, siteAssistantEnabled });
      res.set("Cache-Control", cacheControlFor(req)).type("html").send(markOffSiteLinksOpenInNewTab({ html, siteHost: req.hostname }));
    } catch (error) {
      const { errorId } = reportServerFailure({ error, operation: "products:catalog" }, { tracker: res.locals.adminFailureTracker });
      res.status(500).type("html").send(`<h1>The product catalog could not be loaded</h1><p>Please try again shortly.</p><p>Reference: ${errorId}</p>`);
    }
  });

  app.get("/products/:id", async (req, res) => {
    try {
      const id = String(req.params.id ?? "");
      // The database point lookup reaches products beyond the bounded grid; id wins over slug.
      const product = await findStorefrontProduct({ deps, id, readiness: res.locals?.commerceStatus });
      if (!product) {
        res.status(404).type("html").send("<h1>404 — product not found</h1><p><a href='/products'>All products</a></p>");
        return;
      }
      const page = await resolveStorefrontPage({ req, res, deps });
      if (page === null) return;
      const { theme, siteAssistantEnabled, siteTitle } = page;
      let html = await renderSite({ renderAssets: res.locals.siteConsentAssets, theme, route: "product", siteTitle, posts: [], products: [product], product, siteAssistantEnabled });
      html = await productCheckoutWhenReady({ html, workspaceId: deps.workspaceId, priceId: product.priceId,
        productSlug: product.slug || product.id, currentOrigin: `${resolveProtocol(req)}://${req.get("host")}`, commerce: deps.commerce }, { readiness: res.locals?.commerceStatus });
      res.set("Cache-Control", cacheControlFor(req)).type("html").send(markOffSiteLinksOpenInNewTab({ html, siteHost: req.hostname }));
    } catch (error) {
      const { errorId } = reportServerFailure({ error, operation: "products:detail" }, { tracker: res.locals.adminFailureTracker });
      res.status(500).type("html").send(`<h1>This product could not be loaded</h1><p>Please try again shortly.</p><p>Reference: ${errorId}</p>`);
    }
  });
};
