import { FEDERATION_ADMISSIONS_PATH } from "#src/server/inbound/assistant/federation-admissions-route";
import { AGENT_DAEMON_TOKEN_ENV_VAR } from "#src/assistant/index";
import { getAgentDaemonUrl } from "#src/server/runtime/lifecycle/agent-daemon-port";
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
 */

/** Bounds one admin click, not a boot race — unlike `assistant-daemon-client.ts`'s connect-retry
 *  window, this route never retries: an operator who lands on 503 can just click again, and a route
 *  that retried silently would make "is the daemon actually down" take longer to find out. */
const ADMISSIONS_FETCH_TIMEOUT_MS = 5_000;

/** What this route reports when it cannot relay the daemon's real answer — the ONE shape every
 *  failure branch below collapses to, so the route handler has exactly one place to turn it into a
 *  response. */
interface AdmissionsUnavailable {
  readonly ok: false;
  readonly body: { readonly error: string; readonly code: "AGENT_DAEMON_UNAVAILABLE" };
}

/** Fetches the daemon's admissions report over the same authenticated channel
 *  `assistant-daemon-client.ts` uses (`getAgentDaemonUrl()` + a bearer token read from
 *  `AGENT_DAEMON_TOKEN_ENV_VAR`), collapsing every way that can fail — no token configured, refused
 *  connection, timeout, or a non-200 upstream status — into one honest "unavailable" shape. The
 *  daemon's own gate (`requireAgentDaemonToken`) is what actually enforces the token; a missing
 *  token here is reported the same way a wrong one would be answered, rather than this route trying
 *  to pre-empt that check.
 *  @complexity O(1) plus one bounded round trip. */
async function fetchDaemonAdmissions(): Promise<{ readonly ok: true; readonly connections: unknown } | AdmissionsUnavailable> {
  const token = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  if (!token) {
    return { ok: false, body: { error: "the agent daemon token is not configured", code: "AGENT_DAEMON_UNAVAILABLE" } };
  }

  try {
    const upstream = await fetch(`${getAgentDaemonUrl()}${FEDERATION_ADMISSIONS_PATH}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(ADMISSIONS_FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      return { ok: false, body: { error: "the agent daemon could not report what it admitted", code: "AGENT_DAEMON_UNAVAILABLE" } };
    }
    const parsed = (await upstream.json()) as { connections: unknown };
    return { ok: true, connections: parsed.connections };
  } catch {
    // Connection refused, timed out, or an unparsable body — every one of these means the same
    // thing to an operator: the assistant is not currently reporting, full stop. Distinguishing
    // "refused" from "timed out" from "sent garbage" would not change what they should do next.
    return { ok: false, body: { error: "the agent daemon is not reachable — the assistant may not be running", code: "AGENT_DAEMON_UNAVAILABLE" } };
  }
}

/**
 * `GET .../mcp-servers/admissions`.
 *
 * @complexity O(1) plus one proxied round trip.
 */
export const registerAdminExternalMcpAdmissionsRoute: ExternalMcpRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/mcp-servers/admissions", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;

      const result = await fetchDaemonAdmissions();
      if (!result.ok) {
        res.status(503).json(result.body);
        return;
      }
      res.status(200).json({ connections: result.connections });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
