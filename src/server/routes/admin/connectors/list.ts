import type { Express } from "express";

import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RateLimiter } from "#src/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/core/rate-limit/rate-limit";
import type { ConnectorsRouteDeps } from "./deps";
import { sendConnectorError } from "./errors";

/**
 * GET the Composio connector catalog. Answers `ConnectorsPort.fetchConnectors` (and, with
 * `?refresh=1`, `fetchConnectorEnrichment`) in `@jini-ai/ui`'s connectors feature.
 *
 * Without `refresh` this serves the provider's STATIC catalog — 3 featured connectors plus 183
 * documented toolkits, built in-process at construction. That path needs no Composio API key and
 * makes no outbound request, which is why the tab renders a populated grid even on a workspace
 * that has never configured Composio.
 *
 * `?refresh=1` asks the provider to re-fetch from Composio and therefore DOES require a configured
 * key; it is the enrichment call `ConnectorsBrowser` only makes once `unlocked`. That path is
 * rate-limited (`CONNECTOR_OUTBOUND_PER_IP`) for the same reason `connect`/`disconnect` are — a
 * real outbound Composio call that `requireAdminSession` alone does not bound the frequency of. The
 * static (no-refresh) path stays unlimited since it makes no outbound call.
 *
 * Gated by `admin.integrations.manage` — the existing third-party-integration permission, reused
 * rather than minting a new string, the same call `assistant/mcp-federation/trust.ts` documents.
 */
export function registerAdminConnectorsListRoute(
  app: Express,
  deps: ConnectorsRouteDeps,
  outboundLimiter: RateLimiter
): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/connectors", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
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

      const refresh = req.query.refresh === "1" || req.query.refresh === "true";

      if (refresh) {
        const rateLimitResult = outboundLimiter.check(resolveClientIp(req));
        if (!rateLimitResult.allowed) {
          res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
          res.status(429).json({
            error: "too many catalog refresh attempts",
            code: "RATE_LIMIT_EXCEEDED",
            details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
          });
          return;
        }
      }

      const result = await deps.composioConnectors.service.listConnectorDiscovery(
        refresh ? { refresh: true } : {}
      );
      res.json(result);
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
}
