import type { Express } from "express";

import type { ComposioConnectors } from "#src/platform/connectors/composio-service";
import { COMPOSIO_CALLBACK_PATH } from "../admin/connectors/callback-url.js";
import { CONNECTOR_CALLBACK_MESSAGE_TYPE, renderOAuthCallbackPage } from "../oauth/callback-page.js";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";

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

/**
 * The page the popup lands on.
 *
 * Moved to `routes/oauth/callback-page.ts` on 2026-08-25 so the external-MCP OAuth flow inherits
 * this page's properties rather than growing a second, subtly different copy of them. Behaviour here
 * is unchanged: the same fixed strings, the same origin-targeted `postMessage`, the same
 * `CONNECTOR_CALLBACK_MESSAGE_TYPE` that `@jini-ai/ui`'s `createBrowserConnectorAuthBridge` listens
 * for. See that file's header for why the page is XSS-safe by construction.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function callbackHtml(ok: boolean): string {
  return renderOAuthCallbackPage({ ok, messageType: CONNECTOR_CALLBACK_MESSAGE_TYPE });
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

/** This callback's three relevant query fields, read off the request in one place.
 *  @complexity O(1). */
function parseCallbackQuery(query: Record<string, unknown>): {
  state: string;
  status: string | undefined;
  providerConnectionId: string | undefined;
} {
  return {
    state: typeof query.state === "string" ? query.state : "",
    status: typeof query.status === "string" ? query.status : undefined,
    providerConnectionId: readConnectionId(query),
  };
}

/** Builds `completeComposioConnection`'s input — `providerConnectionId`/`status` stay
 *  spreadable-optional rather than `undefined`-valued, matching that call's own contract.
 *  @complexity O(1). */
function buildCompletionInput(
  connectorId: string,
  parsed: ReturnType<typeof parseCallbackQuery>
): { connectorId: string; state: string; providerConnectionId?: string; status?: string } {
  return {
    connectorId,
    state: parsed.state,
    ...(parsed.providerConnectionId === undefined ? {} : { providerConnectionId: parsed.providerConnectionId }),
    ...(parsed.status === undefined ? {} : { status: parsed.status }),
  };
}

export function registerComposioCallbackRoute(app: Express, deps: ComposioCallbackRouteDeps): void {
  app.get(`${COMPOSIO_CALLBACK_PATH}/:connectorId`, async (req, res) => {
    if (!deps.callbackLimiter.check(resolveClientIp(req)).allowed) {
      res.status(429).type("html").send(callbackHtml(false));
      return;
    }

    const parsedQuery = parseCallbackQuery(req.query as Record<string, unknown>);
    if (!parsedQuery.state) {
      // No state means this was not reached by a redirect the provider issued. Nothing to complete.
      res.status(400).type("html").send(callbackHtml(false));
      return;
    }

    try {
      await deps.composioConnectors.service.completeComposioConnection(
        buildCompletionInput(String(req.params.connectorId ?? ""), parsedQuery)
      );
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
