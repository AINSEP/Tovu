import { fetchDaemonAdmissions } from "#src/server/runtime/services/external-mcp-admissions";
import type { ExternalMcpRouteRegistrar } from "./deps.js";
import { guardExternalMcpRequest } from "./guard.js";

/**
 * @file `GET .../mcp-servers/admissions` (C-008) — proxies the agent daemon's own
 * `GET /api/federation/admissions` (`server/inbound/assistant/federation-admissions-route.ts`, C-009) so
 * the admin tab can state the truth an operator actually needs: "you ticked 3 tools; the assistant
 * is running with 1." Everything else about a saved-but-not-yet-restarted roster is inference.
 *
 * Deliberately its own file, not folded into `probe.ts`: a probe asks a THIRD-PARTY vendor whether
 * it is reachable; this route asks TOVU'S OWN daemon what it already admitted at boot. Different
 * failure modes (an unreachable vendor vs. a stopped local process) want different copy, and one
 * file trying to speak both ends up vague about both.
 *
 * ## The 503 contract
 *
 * A daemon that is down, unauthenticated against, or answers with anything other than 200 is
 * reported as a distinguishable 503 with `code: "AGENT_DAEMON_UNAVAILABLE"` — never as
 * `{ connections: [] }`. An empty list reads as "every connection was refused", which is the exact
 * opposite of "nobody can currently say what was admitted." Silently returning it here would be the
 * same silent-failure class the whole write-tools slice exists to close, one route later.
 *
 * Not built on `server/modules/assistant-daemon-client.ts`'s `fetchAgentDaemon`: that helper is
 * tuned for proxying a LIVE run request/response pair (it stamps `RUN_PRINCIPAL_HEADER`, forwards an
 * `EventSource` reconnect cursor, and answers a genuinely-unreachable daemon with 502 rather than
 * 503 after its own boot-window retry). None of that machinery applies to a simple, on-demand,
 * idempotent JSON read, and reusing it would mean either accepting its 502 (wrong contract for this
 * route) or fighting its own response-writing to override it. A short, dedicated fetch keeps this
 * route in full control of the one status code C-008 actually specifies.
 *
 * `configFailures` (2026-09-13) rides through this proxy the same way `connections` always has —
 * read off the upstream body as `unknown` and relayed untouched. This route does not know or care
 * what either field contains; see `federation-admissions-route.ts`'s own doc for what
 * `configFailures` reports and why a SAVED row can appear there with no matching entry in
 * `connections` at all.
 */

/**
 * `GET .../mcp-servers/admissions`.
 *
 * @complexity O(1) plus one proxied round trip.
 */
export const registerAdminExternalMcpAdmissionsRoute: ExternalMcpRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/mcp-servers/admissions", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;

      const result = await fetchDaemonAdmissions({ observability: deps.observability });
      if (!result.ok) {
        res.status(503).json(result.body);
        return;
      }
      res
        .status(200)
        .json(result.configFailures !== undefined ? { connections: result.connections, configFailures: result.configFailures } : { connections: result.connections });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
