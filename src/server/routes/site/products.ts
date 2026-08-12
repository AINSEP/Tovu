import { getPresentationSettings } from "#src/features/presentation/index";
import { isPublicAssistantEnabled } from "#src/assistant/public-assistant-settings";
import { findTheme, type DiscoveredTheme } from "#src/features/theme/index";
import { renderSite, type SiteProduct } from "../../http/site/render";
import type { RouteDeps, RouteRegistrar } from "../types";

const SITE_TITLE = "Tovu Demo Site";

/** Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2) — same header,
 *  same reasoning as `pages.ts`'s own `CACHE_CONTROL_PUBLIC_PAGE` (see that file's doc): neither
 *  handler below reads `req` for anything beyond the route param, so the response is identical for
 *  every anonymous visitor requesting the same URL. Not shared as a cross-file export — two short,
 *  independently-readable copies over a new cross-file coupling for one string constant. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

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
      const [settings, siteAssistantEnabled] = await Promise.all([
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId }),
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
      const products: SiteProduct[] = deps.store?.listProducts() ?? [];
      const product = products.find((p) => p.id === id);
      if (!product) {
        res.status(404).type("html").send("<h1>404 — product not found</h1><p><a href='/products'>All products</a></p>");
        return;
      }
      const [settings, siteAssistantEnabled] = await Promise.all([
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId }),
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
