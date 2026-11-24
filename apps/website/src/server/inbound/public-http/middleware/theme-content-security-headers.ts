import type { NextFunction, Request, Response } from "express";
import { themeAssetSecurityHeaderSet } from "@jini-ai/cms/public-http/middleware/theme-content-security-headers";

/**
 * @file Express adapter for the theme-file mounts' shared response headers (security pass 2026-08-13
 * Finding 1). The policy itself, and the reasoning for every header, lives in
 * `@jini-ai/cms/public-http/middleware/theme-content-security-headers`; this file only writes that set
 * onto Express's response.
 */

/**
 * Express middleware: writes `themeAssetSecurityHeaderSet` for the request path, then calls `next()`
 * unconditionally. Mounted BEFORE `express.static` so every outcome (200, 304, 404 fallthrough, 206)
 * carries the headers. Keeps its name: the route-table snapshot pins it.
 *
 * @complexity O(1).
 */
export function themeAssetSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  for (const [name, value] of Object.entries(themeAssetSecurityHeaderSet({ path: req.path }))) res.setHeader(name, value);
  next();
}
