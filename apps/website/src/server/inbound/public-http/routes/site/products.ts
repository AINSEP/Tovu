import { serveStorefrontProducts, serveStorefrontProduct } from "@jini-ai/cms/public-http/routes/site/products";
import { resolveProtocol } from "../../../../../platform/express/public-origin.js";
import { failureReporterOf, reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { productCheckoutWhenReady, type ProductCheckoutReadiness } from "@jini-ai/cms/public-http/routes/site/product-checkout";
import { resolveRenderThemeId } from "@jini-ai/cms/public-http/middleware/render-theme-override";
import { resolveActiveThemeId } from "@jini-ai/cms/presentation/site/active-theme-id";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme } from "#src/features/theme/active-theme";
import { renderSite } from "../../http/site/render-site.js";
import type { SiteProduct } from "@jini-ai/cms/public-http/http/site/render-context";
import { resolveSiteAssistantWidgetForRequest } from "./pages/render-context/widgets.js";
import { resolvePerVisitorResponse, sendPublicPage } from "./pages/response.js";
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
 * The response finalization is shared with `pages.ts` too — see `sendStorefrontPage` below.
 */

/** Commerce owns the bounded catalog projection. The host's adapter applies the activation
 * guard before any catalog reads. The public renderer has no legacy store or payment access. */
export interface CommerceSiteAdapterDeps extends RouteDeps {
  commerceCatalog?: {
    listProducts(required?: Record<string, never>, optional?: { readiness?: ProductCheckoutReadiness }): Promise<SiteProduct[]>;
    findProduct?(required: { idOrSlug: string }, optional?: { readiness?: ProductCheckoutReadiness }): Promise<SiteProduct | null>;
  };
}

/**
 * Both handlers finish through `pages/response.ts`'s `sendPublicPage` (B230, owner decision): plugin
 * head and widget partials, form attempt tokens and results, the member sign-in script and
 * off-site-link targets are applied exactly as on every other public page. They used to apply only
 * the off-site-link pass, so a plugin's head markup, forms and member sign-in silently did not work on
 * storefront pages. `Cache-Control` therefore comes from the shared per-visitor policy
 * (`resolvePerVisitorResponse`): public for an anonymous visitor, never-store for a member, a form
 * result or the static-export marker — the owner accepted that change for member/form requests.
 */
/**
 * Public site: `/products` (grid) and `/products/:id` (detail), rendered through the active
 * theme's own `products`/`product` templates. Registered BEFORE the `/:slug` catch-all, same
 * reasoning as `registerStoreRoutes`.
 */
export const registerProductRoutes = ({ app, deps }: { app: import("express").IRouter; deps: CommerceSiteAdapterDeps }, _optional: Record<string, never> = {}): void => (
  void app.get("/products", (req, res) => serveStorefrontProducts({
    list: deps.commerceCatalog?.listProducts.bind(deps.commerceCatalog),
    readiness: () => res.locals?.commerceStatus,
    context: {
      resolveRenderThemeId: () => resolveRenderThemeId({ response: res, resolveStoredThemeId: () => resolveActiveThemeId(deps) }),
      resolveSiteAssistantWidgetForRequest: () => resolveSiteAssistantWidgetForRequest({ request: req, deps }), title: () => resolveSiteTitleForRender(deps),
      resolveActiveTheme: required => resolveActiveTheme({ deps, ...required }), noThemeId: NO_THEME_ID,
      missingTheme: () => void res.status(500).type("html").send("<h1>No themes installed</h1>"),
    },
    renderSite: required => renderSite({ renderAssets: res.locals.siteConsentAssets, ...required }),
    perVisitor: () => resolvePerVisitorResponse({ req, res }), send: required => sendPublicPage({ req, res, deps, ...required }),
    reportFault: required => reportServerFailure(required, { reporter: failureReporterOf({ res }) }),
    sendFault: html => void res.status(500).type("html").send(html),
    operation: "products:catalog", faultHtml: ({ errorId }) => `<h1>The product catalog could not be loaded</h1><p>Please try again shortly.</p><p>Reference: ${errorId}</p>`,
  })),
  void app.get("/products/:id", (req, res) => serveStorefrontProduct({
    get id() { return String(req.params.id ?? ''); }, find: deps.commerceCatalog?.findProduct?.bind(deps.commerceCatalog),
    readiness: () => res.locals?.commerceStatus,
    context: {
      resolveRenderThemeId: () => resolveRenderThemeId({ response: res, resolveStoredThemeId: () => resolveActiveThemeId(deps) }),
      resolveSiteAssistantWidgetForRequest: () => resolveSiteAssistantWidgetForRequest({ request: req, deps }), title: () => resolveSiteTitleForRender(deps),
      resolveActiveTheme: required => resolveActiveTheme({ deps, ...required }), noThemeId: NO_THEME_ID,
      missingTheme: () => void res.status(500).type("html").send("<h1>No themes installed</h1>"),
    },
    renderSite: required => renderSite({ renderAssets: res.locals.siteConsentAssets, ...required }),
    perVisitor: () => resolvePerVisitorResponse({ req, res }), send: required => sendPublicPage({ req, res, deps, ...required }),
    reportFault: required => reportServerFailure(required, { reporter: failureReporterOf({ res }) }),
    sendFault: html => void res.status(500).type("html").send(html),
    decorateCheckout: ({ html, product }) => productCheckoutWhenReady({ html, workspaceId: deps.workspaceId, priceId: product.priceId,
      productSlug: product.slug || product.id, currentOrigin: `${resolveProtocol(req)}://${req.get("host")}`, commerce: deps.commerce }, { readiness: res.locals?.commerceStatus }),
    missing: () => void res.status(404).type("html").send("<h1>404 — product not found</h1><p><a href='/products'>All products</a></p>"),
    operation: "products:detail", faultHtml: ({ errorId }) => `<h1>This product could not be loaded</h1><p>Please try again shortly.</p><p>Reference: ${errorId}</p>`,
  }))
);
