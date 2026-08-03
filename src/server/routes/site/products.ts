import { getPresentationSettings } from "#src/features/presentation/index";
import { findTheme, type DiscoveredTheme } from "#src/features/theme/index";
import { renderSite, type SiteProduct } from "../../http/site/render";
import type { RouteDeps, RouteRegistrar } from "../types";

const SITE_TITLE = "Tovu Demo Site";

/** Same fallback chain `pages.ts`'s `resolveActiveTheme` uses — kept as its own copy here rather
 * than exported/shared, since `pages.ts` is post/page-specific and this is products-specific; the
 * two call sites would otherwise need to agree on a shared module for one three-line function. */
function resolveActiveTheme(deps: RouteDeps, activeThemeId: string): DiscoveredTheme | null {
  const active = findTheme({ themes: deps.themes, id: activeThemeId });
  if (active && active.status === "valid") return active;
  return deps.themes.find((t) => t.status === "valid") ?? deps.themes[0] ?? null;
}

/**
 * Public site: `/products` (grid) and `/products/:id` (detail), rendered through the active
 * theme's own `products`/`product` templates. Data comes from the sample Tier-3 `store` plugin
 * (`deps.store`, optional — memory-mode runtimes never wire it, same as `/store`). Registered
 * BEFORE the `/:slug` catch-all, same reasoning as `registerStoreRoutes`.
 */
export const registerProductRoutes: RouteRegistrar = (app, deps) => {
  app.get("/products", async (req, res) => {
    try {
      const products: SiteProduct[] = deps.store?.listProducts() ?? [];
      const settings = await getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } });
      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }
      res.type("html").send(await renderSite({ theme, route: "products", siteTitle: SITE_TITLE, posts: [], products }));
    } catch {
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });

  app.get("/products/:id", async (req, res) => {
    try {
      const id = String(req.params.id ?? "");
      const products: SiteProduct[] = deps.store?.listProducts() ?? [];
      const product = products.find((p) => p.id === id);
      if (!product) {
        res.status(404).type("html").send("<h1>404 — product not found</h1><p><a href='/products'>All products</a></p>");
        return;
      }
      const settings = await getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } });
      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }
      res.type("html").send(await renderSite({ theme, route: "product", siteTitle: SITE_TITLE, posts: [], products, product }));
    } catch {
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};
