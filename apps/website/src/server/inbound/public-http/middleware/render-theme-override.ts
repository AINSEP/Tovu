import type { Express, Response } from "express";

import { resolveActiveThemeId, type ActiveThemeIdResolutionDeps } from "#src/features/presentation/index";

/**
 * @file Per-request render-theme override for one app instance (2026-10-08): an app built with
 * `createApp(deps, { themeIdOverride })` — only ever `RouteDeps.createSiteApp({ themeId })`'s
 * throwaway loopback app for `web_screenshot_page` — stamps that id on every request it serves, and
 * the site's page routes render through it instead of the stored active theme. Lets the agent SEE a
 * theme copy before the owner approves activating it.
 *
 * Unreachable by visitors by construction: the value comes from the app's construction options, not
 * from the request. The serving app never installs {@link applyRenderThemeOverride}, and nothing reads
 * a header, query parameter or cookie for it, so {@link resolveRenderThemeId} there is exactly
 * `resolveActiveThemeId`.
 */

/** `res.locals` key. Only {@link applyRenderThemeOverride} writes it. */
const LOCAL_KEY = "tovuRenderThemeIdOverride";

/** Installs the override for every request `app` serves. Call before the site routes are registered. */
export function applyRenderThemeOverride(app: Express, { themeId }: { themeId: string }): void {
  app.use((_req, res, next) => {
    res.locals[LOCAL_KEY] = themeId;
    next();
  });
}

/**
 * The theme id this request renders with: the app's override when it has one, else the workspace's
 * stored active theme (with `resolveActiveThemeId`'s own "no settings row yet" fallback).
 * @complexity O(1) plus one settings read when there is no override.
 */
export function resolveRenderThemeId(res: Pick<Response, "locals">, deps: ActiveThemeIdResolutionDeps): Promise<string> {
  const override = res.locals?.[LOCAL_KEY];
  return typeof override === "string" ? Promise.resolve(override) : resolveActiveThemeId(deps);
}
