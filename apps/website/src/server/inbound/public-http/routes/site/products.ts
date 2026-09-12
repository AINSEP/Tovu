import { resolveActiveThemeId } from "#src/features/presentation/index";
import { isPublicAssistantEnabled } from "#src/assistant/index";
import { toSiteProducts } from "#src/features/commerce/index";
import { NO_THEME_ID, resolveActiveTheme } from "#src/features/theme/index";
import { renderSite, type SiteProduct } from "../../http/site/render.js";
import { resolveSiteTitleForRender } from "./pages.js";
import type { RouteDeps, RouteRegistrar } from "#src/server/routes/types";

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

/**
 * 2026-08-12 (wiring products into template render data): Commerce's real catalog
 * (`deps.commerceProductRepo`/`commercePriceRepo`, both optional — see `RouteDeps`'s own doc)
 * takes priority when it has at least one active, priced product for this workspace; the sample
 * `store` plugin is the fallback, preserving the existing demo experience when the real catalog
 * is empty (the templates' own "No products available yet" copy already anticipates exactly this
 * case). Workspace-scoped throughout — `commerceProductRepo.listActive`/`commercePriceRepo
 * .listByProduct` both take `deps.workspaceId` as a required query parameter, the same isolation
 * every other repo call in this file already relies on; a public site render can never see
 * another workspace's catalog through this path.
 *
 * `images`/`stock` are deliberately absent from Commerce-sourced products this pass — see
 * `features/commerce/storefront.ts`'s file header for why (the ADR-027 media-transform pipeline
 * for the former, no inventory tracking at all for the latter). The templates already degrade
 * gracefully for both.
 */
/** Exported (2026-08-15, static exporter) so `export/route-manifest.ts` enumerates the SAME
 *  product set `/products`/`/products/:id` actually render — one source of truth for the
 *  Commerce-vs-sample-store fallback below, rather than a second copy that could drift from it. */
export async function resolveStorefrontProducts(deps: RouteDeps): Promise<SiteProduct[]> {
  const { commerceProductRepo, commercePriceRepo, workspaceId } = deps;
  if (commerceProductRepo && commercePriceRepo) {
    const products = await commerceProductRepo.listActive({ workspaceId });
    const withPrices = await Promise.all(
      products.map(async (product) => ({
        product,
        prices: await commercePriceRepo.listByProduct({ workspaceId, productId: product.id }),
      }))
    );
    const mapped = toSiteProducts(withPrices);
    if (mapped.length > 0) return mapped;
  }
  return deps.store?.listProducts() ?? [];
}

/**
 * Public site: `/products` (grid) and `/products/:id` (detail), rendered through the active
 * theme's own `products`/`product` templates. Registered BEFORE the `/:slug` catch-all, same
 * reasoning as `registerStoreRoutes`.
 */
export const registerProductRoutes: RouteRegistrar = (app, deps) => {
  app.get("/products", async (req, res) => {
    try {
      const products = await resolveStorefrontProducts(deps);
      const [activeThemeId, siteAssistantEnabled, siteTitle] = await Promise.all([
        resolveActiveThemeId(deps),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }),
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
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("html").send(
        await renderSite({ theme, route: "products", siteTitle, posts: [], products, siteAssistantEnabled }),
      );
    } catch {
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });

  app.get("/products/:id", async (req, res) => {
    try {
      const id = String(req.params.id ?? "");
      const products = await resolveStorefrontProducts(deps);
      const product = products.find((p) => p.id === id);
      if (!product) {
        res.status(404).type("html").send("<h1>404 — product not found</h1><p><a href='/products'>All products</a></p>");
        return;
      }
      const [activeThemeId, siteAssistantEnabled, siteTitle] = await Promise.all([
        resolveActiveThemeId(deps),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }),
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
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("html").send(
        await renderSite({ theme, route: "product", siteTitle, posts: [], products, product, siteAssistantEnabled }),
      );
    } catch {
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};
