import { getPresentationSettings } from "#src/features/presentation/index";
import { isPublicAssistantEnabled } from "#src/assistant/index";
import { toSiteProducts } from "#src/features/commerce/index";
import { resolveActiveTheme } from "#src/features/theme/index";
import { renderSite, type SiteProduct } from "../../http/site/render.js";
import type { RouteDeps, RouteRegistrar } from "../types.js";

const SITE_TITLE = "Tovu Demo Site";

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
      const [settings, siteAssistantEnabled] = await Promise.all([
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }),
      ]);
      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("html").send(
        await renderSite({ theme, route: "products", siteTitle: SITE_TITLE, posts: [], products, siteAssistantEnabled }),
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
      const [settings, siteAssistantEnabled] = await Promise.all([
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }),
      ]);
      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("html").send(
        await renderSite({ theme, route: "product", siteTitle: SITE_TITLE, posts: [], products, product, siteAssistantEnabled }),
      );
    } catch {
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};
