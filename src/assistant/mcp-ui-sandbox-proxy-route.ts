import { SANDBOX_PROXY_HTML } from "@jini-ai/ui/mcp-ui/surfaces";
import type { Express, Request, Response } from "express";

/**
 * @file Serves `@jini-ai/ui`'s sandbox proxy page — the one piece of new infrastructure the real
 * `@mcp-ui/client` `AppRenderer` needs that the old hand-rolled `srcdoc` Host never did (see
 * `SANDBOX_PROXY_HTML`'s own doc for the full protocol it implements). `McpUiHost`/`useMcpUiHost`
 * point their iframe at this route's URL via the `sandboxProxyUrl` prop.
 *
 * **Known, deliberately accepted shortcut, not an oversight:** `SANDBOX_PROXY_HTML`'s own doc is
 * explicit that a production deployment should serve this from an origin DISTINCT from the host
 * admin app, so the guest surface's same-origin access (inherent to the single-hop proxy design;
 * see that doc for why) only ever reaches an origin holding nothing sensitive. This route serves
 * it same-origin, as a same-origin convenience, because Tovu has no second origin to put it on
 * today. Every real caller of this surface is a first-party Tovu tool result rendered for an
 * already-authenticated admin — not arbitrary third-party content — so the immediate exposure is
 * bounded, but this is still real technical debt: revisit before this surface ever renders
 * anything from a source Tovu does not fully control.
 */
export const MCP_UI_SANDBOX_PROXY_PATH = "/mcp-ui/sandbox-proxy.html";

export function registerMcpUiSandboxProxyRoute(app: Express): void {
  // No session gate: the page carries no session-scoped data of its own, and the iframe navigation
  // that loads it is not guaranteed to send the admin's session cookie the same way an XHR would.
  app.get(MCP_UI_SANDBOX_PROXY_PATH, (_req: Request, res: Response) => {
    res.type("html").send(SANDBOX_PROXY_HTML);
  });
}
