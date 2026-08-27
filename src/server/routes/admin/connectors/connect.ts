import type { Express } from "express";

import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { composioCallbackUrl } from "./callback-url.js";
import type { ConnectorsRouteDeps } from "./deps.js";
import { sendConnectorError } from "./errors.js";

/**
 * POST to begin authorizing a connector. Answers `ConnectorsPort.connectConnector`.
 *
 * Returns `{ connector, auth }` where `auth.kind` is one of:
 * - `redirect_required` — the normal OAuth path; `auth.redirectUrl` is opened in a popup and the
 *   handshake finishes at the public callback route.
 * - `connected` — Composio already had a validated account for this connector and user, so no
 *   round trip was needed.
 * - `pending` — Composio accepted the request but has not produced a redirect yet.
 *
 * The credential flush is awaited before responding: `connected` writes real account credentials
 * synchronously into the snapshot store, and returning before they are sealed to disk would report
 * a connection that disappears on the next restart.
 *
 * Rate-limited (`CONNECTOR_CONNECT_PER_IP`) BEFORE the auth check, same ordering the login route
 * uses: every hit here — even a rejected one — makes it to `service.connect`, which calls out to
 * Composio, so the guard has to sit in front of everything that costs a real network round trip.
 * `requireAdminSession` alone bounds WHO can call this, not how often; see
 * `core/rate-limit/rate-limit.ts`'s `CONNECTOR_CONNECT_PER_IP` doc for the self-DoS this closes.
 */
export function registerAdminConnectorsConnectRoute(
  app: Express,
  deps: ConnectorsRouteDeps,
  connectLimiter: RateLimiter
): void {
  app.post("/api/admin/v1/workspaces/:workspaceId/connectors/:connectorId/connect", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const rateLimitResult = connectLimiter.check(resolveClientIp(req));
    if (!rateLimitResult.allowed) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      res.status(429).json({
        error: "too many connect attempts",
        code: "RATE_LIMIT_EXCEEDED",
        details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
      });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.integrations.manage",
        workspaceId: deps.workspaceId,
        entityType: "integration",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.integrations.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.integrations.manage", reason: authResult.reason },
        });
        return;
      }

      const connectorId = String(req.params.connectorId ?? "");
      const result = await deps.composioConnectors.service.connect(connectorId, {
        callbackUrl: composioCallbackUrl(req, connectorId),
      });
      await deps.composioConnectors.flushCredentials();
      res.json(result);
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
}
