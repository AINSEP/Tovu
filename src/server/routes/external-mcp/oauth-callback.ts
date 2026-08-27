import type { Express } from "express";

import { ExternalMcpValidationError } from "#src/assistant/index";
import type { ExternalMcpOAuthService } from "#src/assistant/index";
import { isOAuthError } from "#src/oauth/index";
import type { RateLimiter } from "#src/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/core/rate-limit/rate-limit";
import { EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE, renderOAuthCallbackPage, type OAuthCallbackFailureReason } from "../oauth/callback-page.js";
import { EXTERNAL_MCP_OAUTH_CALLBACK_PATH } from "./oauth-callback-url.js";

/**
 * @file The PUBLIC external-MCP OAuth callback — the second route in this codebase that is not
 * behind `requireAdminSession`, and for exactly the same reason as the first
 * (`routes/connectors/composio-callback.ts`, whose header carries the full argument).
 *
 * Short version: `tovu_session` is `SameSite=Strict`, the provider redirects the operator's browser
 * here from its own origin, that is a cross-site top-level navigation, and the browser sends NO
 * cookie. An authenticated callback would reject every real handshake. The cookie policy is correct
 * and stays untouched.
 *
 * What authenticates the request instead is the OAuth `state`
 * (`oauth/pending-authorizations.ts`): 24 cryptographically random bytes minted server-side,
 * single-use, expiring, and BOUND to `${workspaceId}:${serverId}` so a state issued for one
 * connection cannot be redeemed against another. Credential material never travels through the
 * browser — the token exchange is a server-side POST during completion.
 *
 * ## Everything on this request is untrusted
 *
 * `state`, `code` and `error` arrive from a third party. They are narrowed to strings here and
 * validated (charset, length, single-use redemption) in `oauth/authorization-code.ts` before any of
 * them reaches a token endpoint. Nothing from the request reaches the response body — see
 * `routes/oauth/callback-page.ts`.
 *
 * ## The full failure is logged, never rendered
 *
 * A completion failure can carry provider request detail, and this page is reachable by anyone who
 * can guess a URL. The full reason — including anything `OAuthError.message` or a provider's own
 * response carries — goes to the server log only. {@link classifyCallbackFailure} below is the one
 * place that failure is translated into something safe to send back, and it reads only a closed
 * union (`OAuthError.code`) or an error's class identity — never `.message`, never
 * `OAuthError.providerErrorCode`. The browser gets one of a small, fixed set of Tovu-authored reasons
 * (`OAuthCallbackFailureReason`), never a word of what the provider actually said.
 */

export interface ExternalMcpOAuthCallbackRouteDeps {
  readonly oauth: ExternalMcpOAuthService;
  readonly callbackLimiter: RateLimiter;
}

/** The three query fields this callback reads, narrowed once at the edge. Anything else a provider
 *  appends is ignored rather than rejected — providers add their own bookkeeping parameters, and
 *  refusing them would break real handshakes. */
function parseCallbackQuery(query: Record<string, unknown>): { state: string; code?: string; error?: string } {
  return {
    state: typeof query.state === "string" ? query.state : "",
    ...(typeof query.code === "string" && query.code.length > 0 ? { code: query.code } : {}),
    ...(typeof query.error === "string" && query.error.length > 0 ? { error: query.error } : {}),
  };
}

/**
 * Classifies a caught completion failure into the closed, Tovu-authored reason vocabulary the
 * callback page renders.
 *
 * This is the whole security boundary for this route: it reads only `error.code` — a closed union,
 * `OAuthErrorCode` — or the error's class identity, and NEVER `error.message` or
 * `OAuthError.providerErrorCode`, either of which can carry a provider's own response text verbatim
 * (see `src/oauth/errors.ts`'s header). Whatever this function returns is
 * safe to render and safe to put in the `postMessage` payload, because it can only ever be one of
 * the six fixed strings in {@link OAuthCallbackFailureReason} — nothing it reads from `error` can
 * reach the return value directly.
 *
 * `OAUTH_INVALID_STATE` covers an unknown, expired, replayed, or wrongly-owned state alike (see
 * `authorization-code.ts`'s `completeAuthorizationCode` doc) — `"state_expired"` is the one reason
 * name from the vocabulary that fits all of those, and is distinct from `"no_state"`, which the route
 * itself reports before ever calling the service (the query carried no `state` at all). Any
 * `OAuthError` code this function does not special-case, and any error that is not an `OAuthError` or
 * an `ExternalMcpValidationError` at all, becomes `"exchange_failed"` — the same generic reason a
 * caller that never classifies gets by default (`callback-page.ts`'s `renderOAuthCallbackPage`).
 *
 * @complexity O(1).
 */
function classifyCallbackFailure(error: unknown): OAuthCallbackFailureReason {
  if (error instanceof ExternalMcpValidationError) return "server_unknown";
  if (isOAuthError(error)) {
    if (error.code === "OAUTH_INVALID_STATE") return "state_expired";
    if (error.code === "OAUTH_ACCESS_DENIED") return "provider_denied";
    return "exchange_failed";
  }
  return "exchange_failed";
}

/**
 * Mounts `GET {EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/:serverId`.
 *
 * @complexity O(1) per request, plus one bounded token exchange.
 */
export function registerExternalMcpOAuthCallbackRoute(app: Express, deps: ExternalMcpOAuthCallbackRouteDeps): void {
  app.get(`${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/:serverId`, async (req, res) => {
    // In front of everything, matching `composio-callback.ts`: the route is anonymous and each hit
    // can cost an outbound token exchange.
    if (!deps.callbackLimiter.check(resolveClientIp(req)).allowed) {
      res.status(429).type("html").send(renderOAuthCallbackPage({ ok: false, reason: "rate_limited", messageType: EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE }));
      return;
    }

    const params = parseCallbackQuery(req.query as Record<string, unknown>);
    if (params.state === "") {
      // No state means this was not reached by a redirect the provider issued. Nothing to complete.
      res.status(400).type("html").send(renderOAuthCallbackPage({ ok: false, reason: "no_state", messageType: EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE }));
      return;
    }

    try {
      await deps.oauth.completeAuthorizationCallback({ serverId: String(req.params.serverId ?? ""), params });
      // The seal-and-persist is already awaited inside `completeAuthorizationCallback`, so by the
      // time this responds the token is durable — the operator's next action is to close the window,
      // and reporting success over a write still in flight would report a connection that is one
      // restart from vanishing.
      res.status(200).type("html").send(renderOAuthCallbackPage({ ok: true, messageType: EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`external-mcp oauth callback failed: ${error instanceof Error ? error.message : String(error)}`);
      res.status(400).type("html").send(
        renderOAuthCallbackPage({ ok: false, reason: classifyCallbackFailure(error), messageType: EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE }),
      );
    }
  });
}
