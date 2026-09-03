import type { Express } from "express";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import type { ConnectorsRouteDeps, ConnectorsRouteRegistrar } from "./deps.js";
import { sendConnectorError } from "./errors.js";

/**
 * POST to disconnect a connector, and POST to cancel an in-flight authorization.
 *
 * Both live here because they are the same shape and the same permission, and both differ from
 * `connect.ts` in one way that matters: neither ever produces a redirect, so the client can treat
 * the response as final.
 *
 * `disconnect` revokes the account at Composio AND deletes the sealed local credentials; the flush
 * is awaited so a 200 really means the row is gone. `cancel` only drops the provider's in-memory
 * pending-authorization entry — nothing was ever stored, so there is nothing to flush.
 *
 * `disconnect` is rate-limited (`CONNECTOR_OUTBOUND_PER_IP`) the same way `connect.ts` is: it makes
 * a real outbound call to Composio to revoke the account, so `requireAdminSession` alone does not
 * bound how often it can be hit. `cancel` is NOT limited — it only touches the provider's in-memory
 * pending-authorization map and makes no outbound call.
 */
export function registerAdminConnectorsDisconnectRoute(
  app: Express,
  deps: ConnectorsRouteDeps,
  outboundLimiter: RateLimiter
): void {
  app.post("/api/admin/v1/workspaces/:workspaceId/connectors/:connectorId/disconnect", async (req, res) => {
    // `req.params.workspaceId`/`connectorId` are always strings once Express has matched this
    // route (`ParamsDictionary` types every required param as `string`, never `undefined`), so a
    // `?? ""` fallback here would be dead code — never reachable through real HTTP.
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const rateLimitResult = outboundLimiter.check(resolveClientIp(req));
    if (!rateLimitResult.allowed) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      res.status(429).json({
        error: "too many disconnect attempts",
        code: "RATE_LIMIT_EXCEEDED",
        details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
      });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "admin.integrations.manage",
        workspaceId: deps.workspaceId,
        entityType: "integration",
      });
      if (!authorized) return;

      const connector = await deps.composioConnectors.service.disconnect(req.params.connectorId);
      await deps.composioConnectors.flushCredentials();
      res.json(connector);
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
}

export const registerAdminConnectorsCancelRoute: ConnectorsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/connectors/:connectorId/cancel", async (req, res) => {
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
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

      res.json(
        await deps.composioConnectors.service.cancelPendingAuthorization(req.params.connectorId)
      );
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
};
