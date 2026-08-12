import type { Express } from "express";

import type { ComposioConnectors } from "#src/connectors/composio-service";
import { COMPOSIO_CALLBACK_PATH } from "../admin/connectors/callback-url";
import type { RateLimiter } from "#src/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/core/rate-limit/rate-limit";

/**
 * @file The PUBLIC Composio OAuth callback — the one connector route that is not behind
 * `requireAdminSession`, and deliberately so.
 *
 * Why it cannot be authenticated the normal way: `tovu_session` is `SameSite=Strict`
 * (`middleware/dev-auth.ts`). Composio redirects the operator's browser here from its own origin,
 * which is a cross-site top-level navigation, so the browser sends NO cookie. An authenticated
 * callback would reject every real handshake. The cookie policy is correct and stays untouched.
 *
 * What authenticates the request instead is the OAuth `state`:
 * - 24 cryptographically random bytes, minted server-side by `ComposioConnectorProvider.connect`;
 * - single-use — the provider deletes it from its pending map on the first lookup, so a replayed
 *   callback fails;
 * - expiring, and pruned on every access;
 * - BOUND to the connector that issued it, so a state stolen for one connector cannot be redeemed
 *   against another;
 * - and completion still re-fetches the account from Composio and rejects it unless it belongs to
 *   this workspace's user and the expected auth config.
 *
 * The credential material itself never travels through the browser — it is fetched server-side
 * during completion. The worst a leaked state buys an attacker is completing a connection the
 * operator had already started.
 *
 * A per-IP rate limiter sits in front as defence in depth: the route is anonymous and each hit can
 * cost outbound requests to Composio.
 */

export interface ComposioCallbackRouteDeps {
  composioConnectors: ComposioConnectors;
  callbackLimiter: RateLimiter;
}

/** Posted to `window.opener` on success. Must match `@jini-ai/ui`'s
 *  `CONNECTOR_CALLBACK_MESSAGE_TYPE`, which its `createBrowserConnectorAuthBridge` listens for. */
const CALLBACK_MESSAGE_TYPE = "jini:connector-connected";

/**
 * The page the popup lands on.
 *
 * NOTHING from the request is interpolated — not the connector id, not the error, not any query
 * parameter. The two variants below are fixed strings chosen by a boolean. That is the whole XSS
 * story for this endpoint: an attacker-controlled `state` or `status` cannot reach the document,
 * because no code path here concatenates request data into markup.
 *
 * `postMessage` targets `window.location.origin` rather than `"*"`, so the message cannot be read
 * by a cross-origin opener. The receiving bridge independently checks `event.origin`.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function callbackHtml(ok: boolean): string {
  const heading = ok ? "Connected" : "Couldn’t finish connecting";
  const body = ok
    ? "You can close this window and return to Tovu."
    : "Something went wrong finishing the connection. Close this window and try again from Tovu.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    text-align: center; padding: 24px;
  }
  h1 { font-size: 17px; margin: 0 0 6px; }
  p { margin: 0; opacity: 0.7; font-size: 13px; }
</style>
</head>
<body>
  <main>
    <h1>${heading}</h1>
    <p>${body}</p>
  </main>
  <script>
    (function () {
      try {
        if (window.opener) {
          window.opener.postMessage({ type: ${JSON.stringify(CALLBACK_MESSAGE_TYPE)} }, window.location.origin);
        }
      } catch (e) { /* opener gone or cross-origin — the bridge's refocus listener covers it */ }
      setTimeout(function () { try { window.close(); } catch (e) {} }, ${ok ? 400 : 2500});
    })();
  </script>
</body>
</html>`;
}

/** Composio has used both spellings across API versions; accept either rather than silently
 *  dropping the connection id and failing completion with a confusing "missing id". */
function readConnectionId(query: Record<string, unknown>): string | undefined {
  for (const key of ["connectedAccountId", "connected_account_id", "connectionId", "connection_id"]) {
    const value = query[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function registerComposioCallbackRoute(app: Express, deps: ComposioCallbackRouteDeps): void {
  app.get(`${COMPOSIO_CALLBACK_PATH}/:connectorId`, async (req, res) => {
    if (!deps.callbackLimiter.check(resolveClientIp(req)).allowed) {
      res.status(429).type("html").send(callbackHtml(false));
      return;
    }

    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!state) {
      // No state means this was not reached by a redirect the provider issued. Nothing to complete.
      res.status(400).type("html").send(callbackHtml(false));
      return;
    }

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const providerConnectionId = readConnectionId(req.query as Record<string, unknown>);

    try {
      await deps.composioConnectors.service.completeComposioConnection({
        connectorId: String(req.params.connectorId ?? ""),
        state,
        ...(providerConnectionId === undefined ? {} : { providerConnectionId }),
        ...(status === undefined ? {} : { status }),
      });
      // Await the seal-and-persist before telling the popup it worked: the operator's next action
      // is to close the window, and a write still in flight would be reported as success while the
      // connection was one restart from vanishing.
      await deps.composioConnectors.flushCredentials();
      res.status(200).type("html").send(callbackHtml(true));
    } catch (error) {
      // The failure reason is logged server-side, never rendered: it can carry provider request
      // detail, and this page is reachable by anyone who can guess a URL.
      // eslint-disable-next-line no-console
      console.error(
        `composio oauth callback failed: ${error instanceof Error ? error.message : String(error)}`
      );
      res.status(400).type("html").send(callbackHtml(false));
    }
  });
}
