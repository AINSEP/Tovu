import type { Express, NextFunction, Request, Response } from "express";

/**
 * @file Baseline security headers for every public response (build-vs-borrow-verified 2026-09-28
 * §5b). Two headers are safe to enforce now; the Content-Security-Policy ships REPORT-ONLY.
 *
 * - `X-Content-Type-Options: nosniff` — a browser never runs a response as a type it was not served
 *   as. The theme-asset mounts already send it (`theme-content-security-headers.ts`).
 * - `Referrer-Policy: strict-origin-when-cross-origin` — other sites see only the origin, never the
 *   full path a visitor came from. This is already every modern browser's default; sending it pins it.
 * - `Content-Security-Policy-Report-Only` — an ENFORCED policy would break things that work today:
 *   html-format Pages are stored unsanitized by design and may carry inline scripts and vendor
 *   embeds, themes use inline scripts and a CDN, and the site assistant bubble injects its own
 *   script. Report-only lets a browser's console show what a real policy would block before any
 *   per-embed host allowlist exists. There is no `report-uri` yet, so violations only reach the
 *   console. The hosts listed are the ones the renderer and shipped themes load today.
 *
 * Deliberately NOT here:
 * - `frame-ancestors` / `X-Frame-Options`: see `theme-content-security-headers.ts`'s rationale; the
 *   public site may legitimately be embedded elsewhere.
 * - `helmet`: its default CSP is enforced and would break the pages above.
 * - Admin (`/admin`, `/api/admin`): a separate app with its own headers; left unchanged.
 *
 * Static exports are served by whatever host they are deployed to, so these headers do not travel
 * with them. They would need the deploy target's own header config (e.g. `vercel.json`) or a
 * `<meta http-equiv>`; not built yet.
 */

export const PUBLIC_PAGE_CSP_REPORT_ONLY = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin");
}

/**
 * Sets the three headers above before any public route runs, so every outcome (page, 404, error)
 * carries them. A later handler may still set its own enforced `Content-Security-Policy`
 * (theme assets do); report-only and enforced policies are independent headers.
 *
 * @complexity O(1).
 */
export function publicPageSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminPath(req.path)) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy-Report-Only", PUBLIC_PAGE_CSP_REPORT_ONLY);
  }
  next();
}

export function applyPublicPageSecurityHeaders(app: Express): void {
  app.use(publicPageSecurityHeaders);
}
