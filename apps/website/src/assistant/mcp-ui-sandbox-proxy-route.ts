import type { Express, Request, Response } from "express";

import { SANDBOX_PROXY_HTML } from "@jini-ai/ui/mcp-ui/surfaces";

/**
 * @file The MCP-UI **sandbox proxy** page — the one piece of new infrastructure the official
 * `@mcp-ui/client` swap needs that the old hand-rolled `McpUiHost` never did.
 *
 * ## Why this route exists
 *
 * `@mcp-ui/client`'s `AppFrame`/`AppRenderer` does not mount a View by writing HTML into an
 * iframe's `srcdoc`. Instead it points the iframe's `src` at a real, separately-served URL — the
 * sandbox proxy — waits for that page to announce `ui/notifications/sandbox-proxy-ready`, and only
 * then hands it the View's HTML via `ui/notifications/sandbox-resource-ready`. Nothing in Tovu ever
 * served such a page, so every MCP-UI surface (`assistant_ask_choice`'s form included) loaded an
 * iframe pointed at nothing, timed out after 10s waiting for a ready signal that would never come,
 * and never painted.
 *
 * `@jini-ai/ui/mcp-ui/surfaces` (the React-free server entry — see its own module doc for why the
 * builders live outside the `react/` entry point) exports the proxy page's complete source as
 * {@link SANDBOX_PROXY_HTML}, built for exactly this kind of one-route wiring: `app.get(path, (_req,
 * res) => res.type('html').send(SANDBOX_PROXY_HTML))`. This module is that wiring for Tovu.
 *
 * ## Superseded as `AssistantDock.tsx`'s sandbox proxy (2026-09-03) — kept mounted, no longer used there
 *
 * This route used to be the one `AssistantDock.tsx`'s `sandboxProxyUrl` pointed at, and it carried a
 * genuine, flagged security gap: served from the same origin as the admin app, combined with
 * `@mcp-ui/client`'s hardcoded `allow-same-origin` sandbox flag, any third-party MCP server's HTML
 * `document.write`-n into that iframe got this admin origin's real cookies, storage, and same-origin
 * fetches — official MCP-UI guidance is explicit that a production sandbox proxy SHOULD be served
 * from an origin distinct from the host application's own, precisely so that access reaches nothing
 * sensitive, and this route did not honor that. `AssistantDock.tsx` now builds its iframe URL via
 * `buildAssistantMcpUiSandboxProxyUrl` (`AssistantDock.hooks.tsx`) instead — a `data:` URL, which gets
 * an opaque origin under the URL Standard's own origin algorithm regardless of `allow-same-origin` (no
 * second host, DNS entry, or CORS change needed; see that function's own doc and this session's
 * report). This route stays mounted rather than removed — it is still exactly correct same-origin
 * infrastructure for any future consumer that genuinely wants that (e.g. a context with nothing
 * sensitive at this origin to protect), and removing tested, working infrastructure is a bigger,
 * separate change than closing the admin dock's own gap.
 *
 * ## Why unauthenticated and root-relative
 *
 * This is an iframe `src` the browser navigates to BEFORE any handshake — there is no session, no
 * principal, nothing to authenticate yet when the request arrives. The page itself is a static,
 * content-free shell: it holds no data, reads no request state, and returns the exact same bytes to
 * every caller. That combination — no data, no state, identical output — is the same reasoning
 * `/agent-icons` (`server/runtime/composition/app.ts`) and `/readyz` (`ops/health.ts`) already rely
 * on for their own unauthenticated, root-relative mounts. It must also be root-relative rather than
 * living under `/admin/*`: `AssistantDock.tsx` builds `sandboxProxyUrl` against
 * `globalThis.location.origin` (a root-relative URL), because the iframe needs a URL that resolves
 * the same way regardless of which page embedded the dock — the same constraint `/agent-icons`
 * documents for itself.
 */

/** Must match the literal `AssistantDock.tsx` hardcodes — see that file's comment beside
 *  `sandboxProxyUrl`. `apps/website` and `apps/admin` are separate deployable apps with no shared
 *  module either side can import this path from, so the two copies are pinned together only by a
 *  test (`__tests__/mcp-ui-sandbox-proxy-route.test.ts`), same as `AG_UI_RUN_PATH`'s duplication. */
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
 * `@mcp-ui/client`'s `AppFrame` navigates an iframe here from the admin app, and that iframe is
 * same-origin with the page in every topology Tovu actually runs. In production one server serves
 * `/admin/*` and this route. In dev there are now two ways to reach the admin page, both still
 * same-origin with this route: by default (`TOVU_ADMIN_DEV_PROXY_URL`, `admin-dev-proxy.ts`) the
 * website server proxies `/admin/*` to Vite, so the browser sees `localhost:3000` for the admin page
 * and this route alike — the two ports have merged into one origin, not diverged. Reached directly
 * at `:5173` instead (Vite's own fallback), `apps/admin/vite.config.ts` proxies `/mcp-ui` to the
 * website server with `changeOrigin: false`, so the browser sees `localhost:5173` for both there too.
 * A blanket `DENY` would therefore break every MCP-UI surface — `assistant_ask_choice`'s form
 * included — which is strictly worse than the hole it closes.
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
