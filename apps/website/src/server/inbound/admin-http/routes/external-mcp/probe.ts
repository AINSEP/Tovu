import type { Express, Request, Response } from "express";

import { probeExternalMcpServer, type ExternalMcpProbeServiceDeps } from "#src/server/runtime/services/external-mcp-probe";
export type { ExternalMcpProbeSessionFactory } from "#src/server/runtime/services/external-mcp-probe";
import { OUTBOUND_CALL_PER_IP, createRateLimiter, resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { ExternalMcpRouteDeps } from "./deps.js";
import { guardExternalMcpRequest } from "./guard.js";

/**
 * @file `POST .../mcp-servers/:serverId/probe` (C-007) — connects to ONE configured server, once,
 * lists its tools, describes the surface, and closes. Registers nothing into any `ToolRegistry`, so
 * R5 (`mcp-federation/trust.ts`'s "frozen at connect") is untouched by this route — see the
 * write-tools implementation outline §3.1/C-4 for the full argument that a probe run in the admin
 * web server cannot un-freeze anything the daemon holds.
 *
 * ## D-7: hosted connections only
 *
 * A `stdio` row is refused before anything is attempted, rather than spawned. The daemon already
 * pays the cost of a local-command child process at boot, with its own timeout and its own
 * catch-and-close (`mcp-federation/bootstrap.ts`); this on-demand admin action is a strictly worse
 * place for that risk to live a second time — a leaked child here is a leaked child in the process
 * serving the whole admin UI, not a subprocess the daemon already knows how to reap. The motivating
 * connection (Higgsfield) is hosted, so this is not a regression for the case that exists today; a
 * `stdio` operator keeps the plain text-field path exactly as it works now.
 *
 * ## Rate limiting sits IN FRONT of the guard
 *
 * Same ordering `oauth.ts` uses and for the same reason: a hit that will be rejected by the
 * permission check has still made this process reach for an outbound socket on the operator's own
 * credentials if the limiter did not run first.
 *
 * ## INV-006 — no secret in the response
 *
 * The response body is built ONLY from `describeRemoteToolSurface`'s output — a pure function over
 * the remote's `tools/list` reply and the two operator name lists (`mcp-federation/trust.ts`). It
 * never touches the resolved launch spec's headers/env, so there is no code path by which a bearer
 * token, a client secret, or an env value could reach this route's response. Any other error this
 * route can raise is either fixed, Tovu-authored copy, or a stored failure REASON string that
 * `external-mcp-store.ts` itself already guarantees is secret-free (it exists specifically to be
 * shown to the operator). See this file's test for the direct property assertion.
 */

export type ExternalMcpProbeRouteDeps = ExternalMcpRouteDeps & ExternalMcpProbeServiceDeps;

/** Builds this route's own probe rate limiter. Reuses {@link OUTBOUND_CALL_PER_IP} rather than
 *  a new profile: a probe is the same self-DoS shape that profile already names — a real outbound
 *  call using the workspace's own credentials — with its own instance so a burst on one connector
 *  family never eats another's budget. */
export function createExternalMcpProbeLimiter(deps: Pick<ExternalMcpRouteDeps, "clock">): RateLimiter {
  return createRateLimiter({ profile: OUTBOUND_CALL_PER_IP, clock: deps.clock });
}

/** Answers the shared limiter check, writing the 429 itself. Mirrors `oauth.ts`'s
 *  `withinRateLimit` — not imported from there, so this route stays independent of a sibling
 *  family's file (see the implementation outline's own "different failure modes, different copy"
 *  argument for why `probe.ts` and `admissions.ts` are separate files in the first place). */
async function withinProbeRateLimit(limiter: RateLimiter, req: Request, res: Response): Promise<boolean> {
  const result = await limiter.check({ key: resolveClientIp(req) });
  if (result.allowed) return true;
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({
    error: "too many probe attempts",
    code: "RATE_LIMIT_EXCEEDED",
    details: { retryAfterSeconds: result.retryAfterSeconds },
  });
  return false;
}

/**
 * `POST .../mcp-servers/:serverId/probe`.
 *
 * @complexity O(t) in the remote's advertised tool count, plus one round trip.
 */
export function registerAdminExternalMcpProbeRoute(app: Express, deps: ExternalMcpProbeRouteDeps, limiter: RateLimiter): void {
  app.post("/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/probe", async (req, res) => {
    if (!(await withinProbeRateLimit(limiter, req, res))) return;
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;
      const serverId = String(req.params.serverId ?? "");

      const outcome = await probeExternalMcpServer(deps, serverId);
      res.status(outcome.ok ? 200 : outcome.status).json(outcome.body);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`external-mcp probe route failed: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
