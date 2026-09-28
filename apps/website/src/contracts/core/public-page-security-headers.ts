/**
 * @file The ONE header set every public page carries, wherever it is served from. The live server
 * sends it as response headers (`server/inbound/public-http/middleware/public-page-security-headers.ts`,
 * which documents each header and why the CSP is report-only); a static export carries it as the
 * host's own header config or an HTML `<meta>` (`features/site-export/static-security-headers.ts`).
 * Lives in `contracts/` because `features/site-export` never imports from `server/inbound/**`.
 * Change a value here and both follow; never copy these values anywhere else.
 */

export type SecurityHeaderSet = Readonly<Record<string, string>>;

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

export const PUBLIC_PAGE_SECURITY_HEADERS: SecurityHeaderSet = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy-Report-Only": PUBLIC_PAGE_CSP_REPORT_ONLY,
});
