import type { Express } from "express";

import { ExternalMcpReauthRequiredError, ExternalMcpValidationError } from "#src/assistant/index";
import type { ExternalMcpOAuthService } from "#src/assistant/index";
import { isOAuthError } from "#src/oauth/index";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { externalMcpOAuthCallbackUrl } from "../../external-mcp/oauth-callback-url.js";
import type { ExternalMcpRouteDeps } from "./deps.js";
import { guardExternalMcpRequest } from "./guard.js";

/**
 * @file The operator-facing half of external-MCP OAuth: start a connection, poll a device
 * authorization, drop a connection.
 *
 * Three routes, all behind `requireAdminSession` under `/api/admin` and all through
 * `guardExternalMcpRequest`'s `admin.integrations.manage` gate. The fourth route in this flow — the
 * callback — is public and lives in `routes/external-mcp/oauth-callback.ts`, because a
 * `SameSite=Strict` cookie cannot survive the cross-site redirect that reaches it.
 *
 * ## Rate limiting sits IN FRONT of the auth check
 *
 * Same ordering `routes/admin/connectors/connect.ts` uses, and for the same reason restated for
 * this flow: every hit — even one that will be rejected — reaches a handler that mints a pending
 * `state` or makes a real outbound call to a third-party authorization server using the workspace's
 * own client id. `requireAdminSession` bounds WHO can call this, not how often. See
 * `EXTERNAL_MCP_OAUTH_PER_IP`'s doc for the self-DoS this closes.
 *
 * ## Nothing here retries
 *
 * A connect attempt is a foreground action with a human watching. Failures are reported with a
 * specific code and left in a re-clickable state; the operator retries with one click. The machine
 * does not, because an authorization code is single-use and the first response may have been lost
 * after the provider already redeemed it. `errors.ts` in `src/oauth/` carries the full argument.
 */

/** OAuth-specific route dependencies, on top of the roster slice the other three routes use.
 *  `externalMcpOAuth` is `RouteDeps`' own optional field, narrowed to required here — a route family
 *  that cannot run without the service should not be able to compile without it. */
export type ExternalMcpOAuthRouteDeps = ExternalMcpRouteDeps & { readonly externalMcpOAuth: ExternalMcpOAuthService };

/**
 * Maps a caught error onto an HTTP response.
 *
 * Provider response bodies never reach the caller — `OAuthError.message` is built from a closed
 * vocabulary, and `operatorAction` is Tovu's own copy. The `retryable` flag is forwarded so an admin
 * client can tell "wait and poll again" from "this is over", without re-deriving that rule.
 *
 * @complexity O(1).
 */
function sendExternalMcpOAuthError(res: import("express").Response, error: unknown): void {
  if (error instanceof ExternalMcpValidationError) {
    res.status(400).json({ error: error.message, code: "INVALID_MCP_SERVER", details: { field: error.field } });
    return;
  }
  if (error instanceof ExternalMcpReauthRequiredError) {
    res.status(409).json({ error: error.message, code: error.code, details: { retryable: false, settingsLink: error.settingsLink } });
    return;
  }
  if (isOAuthError(error)) {
    // 502 for "we could not reach them", 400 for "they refused us or we asked wrongly" — the two
    // demand different things of the operator (wait/check network vs. check configuration), and
    // collapsing them would tell someone behind a flaky network that their client id is wrong.
    const status = error.code === "OAUTH_PROVIDER_UNREACHABLE" ? 502 : 400;
    res.status(status).json({
      error: error.message,
      code: error.code,
      details: {
        retryable: error.retryable,
        operatorAction: error.operatorAction,
        ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
      },
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(`external-mcp oauth route failed: ${error instanceof Error ? error.message : String(error)}`);
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/** Answers the shared limiter check, writing the 429 itself. `Retry-After` is set so a client can
 *  back off correctly instead of hammering. */
function withinRateLimit(limiter: RateLimiter, req: import("express").Request, res: import("express").Response): boolean {
  const result = limiter.check(resolveClientIp(req));
  if (result.allowed) return true;
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({
    error: "too many OAuth attempts",
    code: "RATE_LIMIT_EXCEEDED",
    details: { retryAfterSeconds: result.retryAfterSeconds },
  });
  return false;
}

/**
 * `POST .../mcp-servers/:serverId/oauth/connect` — begins an authorization.
 *
 * The response shape is discriminated by `kind`, mirroring the connectors connect route's
 * `auth.kind`: `redirect_required` carries a URL the admin opens in a popup, `device_code` carries a
 * user code and verification URL the admin renders directly. The device variant never returns the
 * device code itself — that stays server-side and the poll route looks it up.
 *
 * The callback URL is built FROM THE REQUEST (`externalMcpOAuthCallbackUrl`) so a reverse-proxied
 * deployment gets the origin the browser actually used, not the one this process thinks it has.
 */
export function registerAdminExternalMcpOAuthConnectRoute(
  app: Express,
  deps: ExternalMcpOAuthRouteDeps,
  limiter: RateLimiter,
): void {
  app.post("/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/oauth/connect", async (req, res) => {
    if (!withinRateLimit(limiter, req, res)) return;
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;
      const serverId = String(req.params.serverId ?? "");
      const started = await deps.externalMcpOAuth.beginConnect({
        serverId,
        redirectUri: externalMcpOAuthCallbackUrl(req, serverId),
      });
      res.json({ auth: started });
    } catch (error) {
      sendExternalMcpOAuthError(res, error);
    }
  });
}

/**
 * `POST .../mcp-servers/:serverId/oauth/device/poll` — one poll of a device authorization.
 *
 * ONE poll per request, deliberately. The loop belongs to the admin client, which already has a
 * timer and a visible cancel affordance; a server-side loop would hold a request open for minutes,
 * hide the RFC 8628 `slow_down` contract inside a catch block, and give the operator nothing to
 * cancel. `status: "pending"` carries the interval to wait before calling again.
 */
export function registerAdminExternalMcpOAuthDevicePollRoute(
  app: Express,
  deps: ExternalMcpOAuthRouteDeps,
  limiter: RateLimiter,
): void {
  app.post("/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/oauth/device/poll", async (req, res) => {
    if (!withinRateLimit(limiter, req, res)) return;
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;
      res.json(await deps.externalMcpOAuth.pollDeviceAuthorization({ serverId: String(req.params.serverId ?? "") }));
    } catch (error) {
      sendExternalMcpOAuthError(res, error);
    }
  });
}

/**
 * `DELETE .../mcp-servers/:serverId/oauth` — drops the stored authorization.
 *
 * Clears the token and returns the connection to `disconnected`. It does NOT delete the row: the
 * operator's command, args and allowlist survive, so reconnecting is one click rather than a
 * re-entry. Deleting the server itself is the existing DELETE route's job.
 *
 * Not rate-limited: it makes no outbound call, so the self-DoS the other two guard against does not
 * exist here.
 */
export function registerAdminExternalMcpOAuthDisconnectRoute(app: Express, deps: ExternalMcpOAuthRouteDeps): void {
  app.delete("/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/oauth", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;
      await deps.externalMcpOAuth.disconnect({ serverId: String(req.params.serverId ?? "") });
      res.json({ disconnected: true, restartRequired: true });
    } catch (error) {
      sendExternalMcpOAuthError(res, error);
    }
  });
}
