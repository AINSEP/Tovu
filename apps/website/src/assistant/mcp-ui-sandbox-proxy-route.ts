import type { Express, Request, Response } from "express";

import { SANDBOX_PROXY_HTML } from "@jini-ai/ui/mcp-ui/surfaces";

/**
 * @file Static MCP-UI sandbox proxy route, wired to Jini's SANDBOX_PROXY_HTML.
 * AppFrame loads a proxy URL, waits for sandbox-proxy-ready, then sends the View's HTML through
 * sandbox-resource-ready; the shell must therefore be available before the handshake.
 *
 * Same-origin proxies combined with allow-same-origin give guest HTML access to that origin's
 * cookies, storage and fetches. The admin dock uses buildAssistantMcpUiSandboxProxyUrl's opaque
 * data: origin instead. This public route remains available for same-origin consumers whose
 * embedding context has no sensitive state; it is not the admin dock's security boundary.
 *
 * ## Why unauthenticated and root-relative
 *
 * This is an iframe `src` the browser navigates to BEFORE any handshake — there is no session, no
 * principal, nothing to authenticate yet when the request arrives. The page itself is a static,
 * content-free shell: it holds no data, reads no request state, and returns the exact same bytes to
 * every caller. With no data or request state, authentication adds no protection to this shell.
 * A root-relative mount resolves consistently regardless of the embedding page's path.
 */

/** Public root-relative proxy path. Separate website/admin deployments cannot share a runtime
 *  module for it; __tests__/mcp-ui-sandbox-proxy-route.test.ts pins the route contract. */
export const MCP_UI_SANDBOX_PROXY_PATH = "/mcp-ui/sandbox-proxy.html";

/**
 * The page's framing policy. This route serves a document whose entire job is to `document.write`
 * HTML handed to it over `postMessage` — script execution on this server's own origin. The page
 * itself now refuses any message that did not come from its embedder on this same origin (see
 * `@jini-ai/ui`'s `sandbox-proxy.ts` module doc), but that guard lives in a string constant an
 * upgrade could regress; this header is the layer that keeps a third-party site from framing the
 * page at all, and it holds independently of the script inside.
 *
 * **`'self'`, deliberately not `'none'`/`DENY`.** Being framed is the entire point of this route:
 * Same-origin consumers navigate an iframe here, so their embedding origin must be permitted. In production one server serves
 * `/admin/*` and this route. In dev there are now two ways to reach the admin page, both still
 * same-origin with this route: by default (`TOVU_ADMIN_DEV_PROXY_URL`, `admin-dev-proxy.ts`) the
 * website server proxies `/admin/*` to Vite, so the browser sees `localhost:3000` for the admin page
 * and this route alike — the two ports have merged into one origin, not diverged. Reached directly
 * at `:5173` instead (Vite's own fallback), `apps/admin/vite.config.ts` proxies `/mcp-ui` to the
 * website server with `changeOrigin: false`, so the browser sees `localhost:5173` for both there too.
 * A blanket DENY would prevent the same-origin embeddings this route is intended to support.
 *
 * **Nothing but `frame-ancestors`.** A header CSP survives the page's own `document.open()`, so any
 * `default-src`/`script-src` directive added here would go on to apply to the guest HTML written in
 * afterwards. Jini's own surfaces already ship the tight `default-src 'none'` policy as a `<meta>`
 * tag inside each generated document (`surfaces/document.ts`'s `SURFACE_CSP`), so a header copy
 * would buy them nothing while silently breaking any UIResource whose HTML Jini did not build —
 * e.g. one returned by an external MCP server that legitimately loads a remote asset.
 */
export const MCP_UI_SANDBOX_PROXY_FRAME_ANCESTORS = "frame-ancestors 'self'";

/** Defence in depth for browsers predating `frame-ancestors`. `SAMEORIGIN`, not `DENY`, for the
 *  reason {@link MCP_UI_SANDBOX_PROXY_FRAME_ANCESTORS} spells out — `DENY` would break the intended
 *  same-origin iframe along with the third-party one. */
export const MCP_UI_SANDBOX_PROXY_LEGACY_FRAME_OPTIONS = "SAMEORIGIN";

/**
 * Registers `GET {@link MCP_UI_SANDBOX_PROXY_PATH}` on the website server's `app`.
 *
 * `Cache-Control: public, max-age=300` — the body is a constant string tied to the installed
 * `@jini-ai/ui` version, not request state, so a short cache is safe; kept short (rather than
 * immutable/far-future) so a redeploy that changes the page's bytes reaches an already-open browser
 * tab within minutes rather than needing a hard refresh.
 *
 * `Content-Security-Policy: frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` — see
 * {@link MCP_UI_SANDBOX_PROXY_FRAME_ANCESTORS} for why those exact values and not `DENY`/`'none'`,
 * and why the CSP deliberately carries nothing but `frame-ancestors`.
 *
 * @complexity O(1) — one static response, no branching.
 * @overallScore 100
 */
export function registerMcpUiSandboxProxyRoute(app: Express): void {
  app.get(MCP_UI_SANDBOX_PROXY_PATH, (_req: Request, res: Response) => {
    res.set("Cache-Control", "public, max-age=300");
    res.set("Content-Security-Policy", MCP_UI_SANDBOX_PROXY_FRAME_ANCESTORS);
    res.set("X-Frame-Options", MCP_UI_SANDBOX_PROXY_LEGACY_FRAME_OPTIONS);
    res.type("html").send(SANDBOX_PROXY_HTML);
  });
}
