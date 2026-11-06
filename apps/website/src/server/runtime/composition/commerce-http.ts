/** Tovu mounts Jini's raw webhook adapter before JSON, then its member/catalog HTTP adapters. */
import express, { type Express } from "express";
import { registerPaymentsWebhookRoute } from "@jini-ai/commerce/http";
import { COMMERCE_CHECKOUT_SCRIPT } from "@jini-ai/commerce/checkout-browser";
import type { RouteDeps } from "#src/server/routes/types";
import { registerCommerceRoutes } from "#src/server/inbound/public-http/routes/commerce/purchase";
import { registerProductRoutes } from "#src/server/inbound/public-http/routes/site/products";
import { pageShell } from "#src/server/inbound/public-http/http/site/render";
import { resolveRenderThemeId } from "#src/server/inbound/public-http/middleware/render-theme-override";
import { resolveSiteTitleForRender } from "#src/server/inbound/public-http/routes/site/pages";
import { NO_THEME_ID, resolveActiveTheme } from "#src/features/theme/active-theme";

/** Raw bytes must reach the signature verifier before the public JSON parser. O(1) mounting. */
export function registerCommerceWebhooks({ app, deps }: { app: Express; deps: RouteDeps }, _optional = {}): void {
  if (!deps.commerce) return;
  registerPaymentsWebhookRoute({ app, deps: { resolveReceiver: () => deps.commerce?.resolveReceiver() ?? null } }, { prefix: "/api" });
}

/** Off commerce has no public storefront; payment webhooks keep their separate drain route.
 * @complexity O(1) wiring and one activation/readiness check per storefront request.
 */
export function registerCommerceHttp({ app, deps }: { app: Express; deps: RouteDeps }, _optional = {}): void {
  if (!deps.commerce) return;
  // A router, not a second Express app: an app called directly gets its own defaults, so behind a
  // proxy every buyer would share the proxy's address and one rate budget. Requests stay on the host app.
  const storefront = express.Router();
  registerCommerceRoutes({ app: storefront, deps: { ...deps, renderCommercePage: async ({ res, title, body }) => {
    const [themeId, siteTitle] = await Promise.all([resolveRenderThemeId(res, deps), resolveSiteTitleForRender(deps)]);
    const resolved = resolveActiveTheme(deps, themeId);
    // Payment status remains readable even when no theme is installed.
    return pageShell({ title: `${title} | ${siteTitle}`, theme: resolved === NO_THEME_ID ? null : resolved, body });
  } } });
  storefront.get("/commerce/checkout.js", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").type("text/javascript").send(COMMERCE_CHECKOUT_SCRIPT);
  });
  registerProductRoutes(storefront, deps);
  app.use(async (req, res, next) => {
    // Match the router's case-insensitive paths without changing requested IDs or slugs.
    const requestPath = req.path.toLowerCase();
    // Order APIs keep their own member and write admission, including reads during drain.
    if (requestPath.startsWith("/api/commerce/v1/")) { storefront(req, res, next); return; }
    // The router below ignores one trailing slash, so this gate must too or the route is never reached.
    const productPath = requestPath === "/products" || requestPath.startsWith("/products/");
    if (!productPath && !["/commerce/return", "/commerce/cancel", "/commerce/checkout.js"].includes(requestPath.replace(/\/$/, ""))) { next(); return; }
    try {
      const status = await deps.commerce!.storefrontStatus();
      if (!status.active) { next(); return; }
      if (productPath && !status.ready) {
        res.status(404).type("html").send("<h1>This shop is not accepting purchases.</h1>"); return;
      }
      res.locals.commerceStatus = status;
      storefront(req, res, next);
    } catch {
      res.status(503).type("html").send("<h1>The shop catalog is temporarily unavailable.</h1><p>Please try again shortly.</p>");
    }
  });
}
