import type { Express } from "express";

import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RateLimiter } from "#src/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/core/rate-limit/rate-limit";
import type { ConnectorsRouteDeps } from "./deps";
import { sendConnectorError } from "./errors";

/**
 * GET one connector, optionally with a page of its tools. Answers
 * `ConnectorsPort.fetchConnectorDetail` — what the detail drawer opens with.
 *
 * `?hydrateTools=1` selects the provider's bounded PREVIEW path (`getPreviewConnector`) rather than
 * `getHydratedConnector`. The distinction is deliberate and not interchangeable: hydration is the
 * strict "current tools or deny" path that gates EXECUTION authority, while preview is a paginated
 * display read. This route only ever renders a drawer, so it must not take the execution path — and
 * taking it would also fail the whole request whenever a tool list is briefly unavailable.
 *
 * `toolsLimit` is clamped to {@link MAX_TOOLS_LIMIT}: the value arrives from the client, and the
 * provider forwards it to Composio as a page size.
 *
 * MUST be registered after `statuses.ts` and `get-config.ts` — see `server/modules/connectors.ts`.
 *
 * `?hydrateTools=1` is rate-limited (`CONNECTOR_OUTBOUND_PER_IP`): it makes a real, paginated
 * outbound call to Composio, so `requireAdminSession` alone does not bound how often it can be
 * paged through. Plain `getConnector` (no `hydrateTools`) is a cheap local read and stays
 * unlimited.
 */

/** Upper bound on a client-supplied tool page size. Composio's own pagination is the real limit;
 *  this stops a crafted request from asking for an unbounded page. */
const MAX_TOOLS_LIMIT = 100;
const DEFAULT_TOOLS_LIMIT = 20;

/**
 * Clamps a query-string tool limit into `[1, MAX_TOOLS_LIMIT]`.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function parseToolsLimit(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TOOLS_LIMIT;
  return Math.min(parsed, MAX_TOOLS_LIMIT);
}

export function registerAdminConnectorsGetByIdRoute(
  app: Express,
  deps: ConnectorsRouteDeps,
  outboundLimiter: RateLimiter
): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/connectors/:connectorId", async (req, res) => {
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

      const connectorId = String(req.params.connectorId ?? "");
      const hydrateTools = req.query.hydrateTools === "1" || req.query.hydrateTools === "true";

      if (hydrateTools) {
        const rateLimitResult = outboundLimiter.check(resolveClientIp(req));
        if (!rateLimitResult.allowed) {
          res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
          res.status(429).json({
            error: "too many tool-preview requests",
            code: "RATE_LIMIT_EXCEEDED",
            details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
          });
          return;
        }
      }

      const toolsCursor = typeof req.query.toolsCursor === "string" ? req.query.toolsCursor : undefined;

      const connector = hydrateTools
        ? await deps.composioConnectors.service.getPreviewConnector(connectorId, {
            toolsLimit: parseToolsLimit(req.query.toolsLimit),
            ...(toolsCursor === undefined ? {} : { toolsCursor }),
          })
        : await deps.composioConnectors.service.getConnector(connectorId);

      res.json(connector);
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
}
