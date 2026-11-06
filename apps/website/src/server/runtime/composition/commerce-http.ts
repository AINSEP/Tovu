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

/** Off commerce has no public storefront. Existing started orders remain readable during drain.
 * @complexity O(1) wiring and one activation/readiness check per storefront request.
 */
export function registerCommerceHttp({ app, deps }: { app: Express; deps: RouteDeps }, _optional = {}): void {
  if (!deps.commerce) return;
  registerCommerceRoutes({ app, deps: { ...deps, renderCommercePage: async ({ res, title, body }) => {
    const [themeId, siteTitle] = await Promise.all([resolveRenderThemeId(res, deps), resolveSiteTitleForRender(deps)]);
    const resolved = resolveActiveTheme(deps, themeId);
    // Payment status remains readable even when no theme is installed.
    return pageShell({ title: `${title} | ${siteTitle}`, theme: resolved === NO_THEME_ID ? null : resolved, body });
  } } });
  app.get("/commerce/checkout.js", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").type("text/javascript").send(COMMERCE_CHECKOUT_SCRIPT);
  });
  const products = express();
  registerProductRoutes(products, deps);
  app.use(async (req, res, next) => {
    if (req.path !== "/products" && !req.path.startsWith("/products/")) { next(); return; }
    try {
      const status = await deps.commerce!.status();
      if (!status.active) { next(); return; }
      if (!status.ready) {
        res.status(404).type("html").send("<h1>This shop is not accepting purchases.</h1>"); return;
      }
      res.locals.commerceStatus = status;
      products(req, res, next);
    } catch {
      res.status(503).type("html").send("<h1>The shop catalog is temporarily unavailable.</h1><p>Please try again shortly.</p>");
    }
  });
}
