import { PUBLIC_PAGE_SECURITY_HEADERS, type SecurityHeaderSet } from "#src/contracts/core/public-page-security-headers";
import { escapeHtml } from "#src/platform/html/escape";

/**
 * @file Carries the live server's public-page security headers into a static export, which is
 * plain files served by someone else's host. Every value comes from the ONE shared set in
 * `contracts/core/public-page-security-headers.ts`; nothing here retypes a header.
 *
 * - Netlify: a `_headers` file ({@link renderHeadersFile}), applied by Netlify to every path.
 * - Vercel: `vercel.json`'s `headers` block ({@link renderVercelConfig}).
 * - Everywhere else (GitHub Pages, S3-compatible buckets, Cloudflare Pages, a hand-copied folder):
 *   only what HTML itself can say, via {@link withSecurityMeta}. Cloudflare Pages does read a
 *   `_headers` file, but only when the uploader sends it as its own form field; Jini's direct upload
 *   sends every file as a plain asset, so Pages would serve it publicly instead of applying it.
 *
 * What a `<meta>` CANNOT carry, so those hosts go without it:
 * - `X-Content-Type-Options`: a response header only; no HTML equivalent exists.
 * - `Content-Security-Policy-Report-Only`: browsers ignore report-only in `<meta http-equiv>`. An
 *   ENFORCED meta CSP is deliberately not emitted instead: the live server does not enforce one
 *   (it would break html-format Pages and vendor embeds, see the live middleware's doc), and a static
 *   copy must not break where the live site works.
 * `Referrer-Policy` has an exact HTML equivalent (`<meta name="referrer">`) and is written into every
 * exported HTML page for every host, so it holds even where a header file is not applied.
 */

export const HEADERS_FILE_NAME = "_headers";
export const VERCEL_CONFIG_FILE_NAME = "vercel.json";

/** Netlify's `_headers` format: a path pattern, then two-space-indented `Name: value` lines. */
export function renderHeadersFile(headers: SecurityHeaderSet = PUBLIC_PAGE_SECURITY_HEADERS): string {
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`);
  return `/*\n${lines.join("\n")}\n`;
}

/** A `vercel.json` whose only content is one `headers` rule covering every path. */
export function renderVercelConfig(headers: SecurityHeaderSet = PUBLIC_PAGE_SECURITY_HEADERS): string {
  const rule = { source: "/(.*)", headers: Object.entries(headers).map(([key, value]) => ({ key, value })) };
  return `${JSON.stringify({ headers: [rule] }, null, 2)}\n`;
}

const HEAD_OPEN_TAG = /<head(\s[^>]*)?>/i;

/**
 * Inserts `<meta name="referrer">` as the first child of `<head>`, so a page's own later referrer
 * meta (if any) still wins, exactly as it would over the live header. Unchanged when the HTML has no
 * `<head>` or the set has no `Referrer-Policy`.
 *
 * @complexity O(n) in the length of `html` (one regex scan).
 */
export function withSecurityMeta(html: string, headers: SecurityHeaderSet = PUBLIC_PAGE_SECURITY_HEADERS): string {
  const referrerPolicy = headers["Referrer-Policy"];
  if (referrerPolicy === undefined) return html;
  return html.replace(HEAD_OPEN_TAG, (tag) => `${tag}<meta name="referrer" content="${escapeHtml(referrerPolicy)}">`);
}
