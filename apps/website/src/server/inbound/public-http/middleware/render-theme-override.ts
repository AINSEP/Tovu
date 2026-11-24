import type { Express } from "express";

import { setRequestRenderTheme } from "@jini-ai/cms/public-http/middleware/render-theme-override";

/**
 * @file Host adapter: installs the per-request render-theme override (see Jini cms
 * `public-http/middleware/render-theme-override` for the request-local seam and why it exists) for
 * every request an app built with `createApp(deps, { themeIdOverride })` serves.
 */

/** Installs the override for every request `app` serves. Call before the site routes are registered. */
export function applyRenderThemeOverride({ app, themeId }: { app: Express; themeId: string }, _optional: Record<string, never> = {}): void {
  app.use((_req, res, next) => {
    setRequestRenderTheme({ response: res, themeId });
    next();
  });
}
