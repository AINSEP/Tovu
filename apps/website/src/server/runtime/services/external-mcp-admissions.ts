import { FEDERATION_ADMISSIONS_PATH } from "#src/server/inbound/assistant/federation-admissions-route";
import { AGENT_DAEMON_TOKEN_ENV_VAR } from "#src/assistant/index";
import { getAgentDaemonUrl } from "#src/server/runtime/lifecycle/agent-daemon-port";
import { createNoopObservabilityPort, trackFetch, type ObservabilityPort } from "#src/platform/observability/index";

/** Bounds one admin click, not a boot race — unlike `assistant-daemon-client.ts`'s connect-retry
 *  window, this route never retries: an operator who lands on 503 can just click again, and a route
 *  that retried silently would make "is the daemon actually down" take longer to find out. */
const ADMISSIONS_FETCH_TIMEOUT_MS = 5_000;

const UNTRACED = createNoopObservabilityPort({});

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
 *  @complexity O(b) time and space for the report body, plus one bounded round trip. */
export async function fetchDaemonAdmissions(options: {
  readonly token?: string;
  readonly daemonUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  /** Traces the request as one outbound span (host/port, status — never the token). Omitted: untraced. */
  readonly observability?: ObservabilityPort;
} = {}): Promise<
  { readonly ok: true; readonly connections: unknown; readonly configFailures?: unknown } | AdmissionsUnavailable
> {
  const token = options.token ?? process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  if (!token) {
    return { ok: false, body: { error: "the agent daemon token is not configured", code: "AGENT_DAEMON_UNAVAILABLE" } };
  }

  try {
    const send = trackFetch({ fetch: options.fetch ?? globalThis.fetch, observability: options.observability ?? UNTRACED });
    const upstream = await send(`${options.daemonUrl ?? getAgentDaemonUrl()}${FEDERATION_ADMISSIONS_PATH}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(ADMISSIONS_FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      // eslint-disable-next-line no-console
      console.error(`external-mcp admissions read refused with status ${upstream.status}`);
      return { ok: false, body: { error: "the agent daemon could not report what it admitted", code: "AGENT_DAEMON_UNAVAILABLE" } };
    }
    const parsed = (await upstream.json()) as { connections: unknown; configFailures?: unknown };
    if (!Array.isArray(parsed.connections) || (parsed.configFailures !== undefined && !Array.isArray(parsed.configFailures))) {
      throw new Error("invalid admissions report");
    }
    // `configFailures` is carried through only when the upstream actually sent it — true verbatim
    // relay, matching this route's own "treats the body as unknown and relays it VERBATIM" doc, and
    // what keeps an older daemon build (or a stand-in test double) that predates this field producing
    // the exact same wire shape it always has, rather than gaining a `configFailures: []` it never sent.
    return parsed.configFailures !== undefined
      ? { ok: true, connections: parsed.connections, configFailures: parsed.configFailures }
      : { ok: true, connections: parsed.connections };
  } catch {
    // Only fixed metadata is logged; daemon credentials and raw upstream messages stay private.
    // eslint-disable-next-line no-console
    console.error("external-mcp admissions read failed");
    // Connection refused, timed out, or an unparsable body — every one of these means the same
    // thing to an operator: the assistant is not currently reporting, full stop. Distinguishing
    // "refused" from "timed out" from "sent garbage" would not change what they should do next.
    return { ok: false, body: { error: "the agent daemon is not reachable — the assistant may not be running", code: "AGENT_DAEMON_UNAVAILABLE" } };
  }
}

