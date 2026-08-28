import type { Express, Request, Response } from "express";

import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import type { ConnectorsRouteDeps } from "./deps.js";
import { sendConnectorError } from "./errors.js";

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

/** Reads the `?hydrateTools=1|true` query flag off the request. @complexity O(1). */
function wantsHydratedTools(req: Request): boolean {
  return req.query.hydrateTools === "1" || req.query.hydrateTools === "true";
}

/**
 * Enforces `CONNECTOR_OUTBOUND_PER_IP` on hydrated (Composio-calling) reads. Writes the 429 itself
 * and returns `false` when the caller must stop; `true` means proceed.
 *
 * @complexity O(1).
 */
function checkHydrateRateLimit(outboundLimiter: RateLimiter, clientIp: string, res: Response): boolean {
  const rateLimitResult = outboundLimiter.check(clientIp);
  if (rateLimitResult.allowed) return true;
  res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
  res.status(429).json({
    error: "too many tool-preview requests",
    code: "RATE_LIMIT_EXCEEDED",
    details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
  });
  return false;
}

/**
 * Fetches the connector — the bounded preview path with a tools page when `hydrateTools` is set,
 * the cheap plain read otherwise. Collapses the two request-shape branches (which path, and whether
 * a cursor was supplied) that otherwise live inline in the route handler.
 *
 * @complexity O(1) plus one outbound call to Composio when `hydrateTools` is set.
 */
async function fetchRequestedConnector(
  service: ConnectorsRouteDeps["composioConnectors"]["service"],
  connectorId: string,
  query: Request["query"],
  hydrateTools: boolean
) {
  if (!hydrateTools) return service.getConnector(connectorId);
  const toolsCursor = typeof query.toolsCursor === "string" ? query.toolsCursor : undefined;
  return service.getPreviewConnector(connectorId, {
    toolsLimit: parseToolsLimit(query.toolsLimit),
    ...(toolsCursor === undefined ? {} : { toolsCursor }),
  });
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
      const hydrateTools = wantsHydratedTools(req);

      if (hydrateTools && !checkHydrateRateLimit(outboundLimiter, resolveClientIp(req), res)) {
        return;
      }

      const connector = await fetchRequestedConnector(
        deps.composioConnectors.service,
        connectorId,
        req.query,
        hydrateTools
      );

      res.json(connector);
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
}
