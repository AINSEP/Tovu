// Local federation forks moved to @jini-ai/mcp/federation (+ /stdio, /approvals); see development/DELETED-CODE.md.
import {
  connectMcpHttpSession as connectJiniHttpSession,
  type McpBearerTokenSupplier,
  type McpAuthenticationChallengeHook,
} from "@jini-ai/mcp/federation";
import { TOVU_MCP_CLIENT_INFO } from "./presets.js";
import { tovuFederationMessages } from "./presets.js";
import type { McpHttpExchange, McpHttpLaunchSpec, McpSessionPort } from "@jini-ai/mcp/federation";
export { createFetchMcpHttpExchange } from "@jini-ai/mcp/federation";
// Transport code and rationale: Jini/packages/mcp/src/federation/{adapter.http,mcp-protocol}.ts.

/**
 * @file The second real `McpSessionPort` adapter: an MCP client speaking JSON-RPC 2.0 over MCP's
 * Streamable HTTP transport, which is how every HOSTED MCP server is reached.
 *
 * Why this exists, given `adapter.stdio.ts` already federates:
 * stdio requires a program on the operator's own disk. A hosted server — Higgsfield, Supabase's
 * `https://mcp.supabase.com/mcp`, anything SaaS — has no such program, and the only way to reach it
 * is an authenticated HTTPS endpoint. `external-mcp-server-federation.md` deferred this transport
 * with a specific, now-expired reason: "OAuth needs an interactive browser consent flow and a token
 * store, neither of which Tovu has". `src/platform/oauth/` and `assistant/external-mcp-oauth.ts` are both of
 * those, so the blocker is gone and, exactly as that doc predicted, this lands as an added adapter
 * rather than a redesign.
 *
 * How much of Streamable HTTP is implemented, and what is deliberately left out:
 * the client-initiated half — POST a request, read the response, carry `Mcp-Session-Id` forward. A
 * server may answer either with `application/json` (one response) or `text/event-stream` (the same
 * response, SSE-framed); both are handled, because which one a server picks is its choice and not
 * something an operator configures.
 *
 * NOT implemented, on purpose: the standalone `GET` stream that lets a server push requests to the
 * client unprompted. That channel exists to carry server-to-client calls — `sampling/createMessage`
 * above all, a remote asking Tovu to run model inference on its behalf. `adapter.stdio.ts` answers
 * those with "method not found"; here the stronger move is available, so this client simply never
 * opens the channel they would arrive on. Tovu advertises no capabilities in `initialize`, so there
 * is nothing a server may legitimately push. Resumability (`Last-Event-ID`) goes with it: this
 * client makes bounded request/response calls, and `trust.ts` R5 freezes the admitted tool set at
 * connect, so there is no long-lived stream whose position would need restoring.
 *
 * Hostile-server posture (this file's share; `trust.ts` owns the rest):
 * every request is timeout-bounded by an `AbortSignal` the caller cannot lose, a response body is
 * length-bounded before it is parsed, a non-2xx is a typed error rather than a parse attempt, and
 * the session id a server hands back is validated before it is echoed into any later request
 * header — an unvalidated one is a header-injection primitive handed to the remote.
 *
 * Architectural role:
 * Infrastructure adapter, co-located with its port. Protocol logic it shares with the stdio adapter
 * lives in `mcp-protocol.ts`; what is here is HTTP, and only HTTP.
  *
 * Delegated transport rationale (Jini helper names):
 * Bound on one response body, matching `adapter.stdio.ts`'s per-message cap. A server that streams
 * an unbounded body would otherwise grow this process's heap without limit. `trust.ts` caps what
 * reaches a MODEL, but that runs after parsing, so parsing needs its own bound.
 * What a server's `Mcp-Session-Id` may contain before this client will echo it back.
 *
 * The spec says visible ASCII (0x21..0x7E). Enforced rather than trusted because this value goes
 * straight into an outbound request header: a server answering with a session id containing CR or
 * LF would, against a naive HTTP client, be able to inject additional headers into every subsequent
 * request Tovu makes to it. Bounded in length for the same reason a body is.
 * MCP requires a client to accept both response modes on every request, and the server picks.
 * Wires `controller` to also abort when `callerSignal` does — including firing immediately if
 *  `callerSignal` is already aborted by the time this runs. Returns the listener so the caller can
 *  remove it again once the request settles. Split out of
 *  {@link McpHttpSession.postWithTimeout} purely to keep that method under the shop complexity
 *  ceiling; behavior is unchanged.
 * Builds the right {@link McpProtocolError} for a failed POST — distinguishing "the caller
 *  cancelled" from "the request timed out" from "the network/transport itself failed". Split out
 *  of {@link McpHttpSession.postWithTimeout} purely to keep that method under the shop complexity
 *  ceiling; behavior (including the exact message text) is unchanged.
 * A connected MCP client session against one hosted server.
 *
 * Constructed by {@link connectMcpHttpSession} rather than directly, so a session that exists is
 * always one whose handshake completed — mirroring `adapter.stdio.ts`, and for the same reason:
 * there is no half-initialized state a caller could accidentally use.
 * The protocol version the SERVER said it would speak, for diagnostics.
 * The server's self-reported identity, for diagnostics and audit. Untrusted, like everything
 * else it sends — recorded, never acted on.
 * @complexity O(p) in `tools/list` pages, bounded by `mcp-protocol.ts`'s page cap.
 * @overallScore 100
 * @complexity O(1) beyond the remote's own round-trip.
 * @overallScore 100
 * Marks the session closed and tells the server to drop it, best-effort.
 *
 * The DELETE is best-effort by design: a server is entitled to refuse it (the spec allows 405),
 * and a hosted server being unreachable at shutdown must not throw out of a caller that is only
 * tidying up. Local state is cleared either way, so a closed session refuses further requests
 * whatever the server did.
 * Sends the handshake. Separate from the constructor because it is the one part that can fail,
 *  and a session object that exists must be one that completed it.
 * MCP requires this notification after a successful initialize, and requires that a
 * notification carry no `id`. Its response carries no body to correlate — a 202 is the
 * expected outcome — so unlike every other call it is sent without awaiting a JSON-RPC result.
 * Headers common to every request. Built fresh per call so a session id acquired mid-flight is
 *  picked up by the next request without mutating the operator's configured header bag.
 * Required from the negotiated version onward, and harmless before it. Sent on every request
 * so a stateless server load-balanced across instances sees it on the one that handles a
 * given call, not only on the one that handled `initialize`.
 * POSTs one JSON-RPC frame and returns the raw response, applying the timeout and recording any
 *  session id the server issues.
 * Applies the per-request ceiling.
 *
 * The timeout is enforced with an `AbortSignal` this method owns rather than by racing a promise:
 * a race leaves the underlying request running after the loser settles, and an abandoned request
 * against a hosted server still holds a socket and still delivers its body. Aborting cancels the
 * work as well as the wait.
 * Records a server-issued session id, refusing one that could not safely be echoed back.
 * Issues one JSON-RPC request and returns its `result`.
 *  @throws {McpProtocolError} On a transport failure, a non-2xx, an unparseable body, or a
 *  JSON-RPC error frame.
 * Turns a non-2xx into a message an operator can act on.
 *
 * Only 401 is called out by name, and by TYPE (`McpAuthFailedError`): it is the one status with a
 * specific cause and a specific fix — the connection's OAuth token has expired or been revoked, and
 * the row needs reconnecting. `external-mcp-store.ts` already reports that state at boot; this is
 * the same finding arrived at from the other direction, when a token that was valid at boot stops
 * being valid mid-session — this module has no OAuth knowledge of its own, so it only distinguishes
 * the failure; `mcp-federation/registrations.ts`'s `onAuthFailed` hook is what a caller that DOES
 * know what "reconnect" means reacts to it with.
 *
 * 403 is deliberately NOT treated the same: it means the token was accepted but the server refused
 * this particular request anyway (an out-of-scope tool, an unauthorized action) — a fact about this
 * call, not about the token's validity. Reporting it as `McpAuthFailedError` would make
 * `onAuthFailed` clear an otherwise-good token and force a needless reauth. It falls through to the
 * generic branch below, same as any other non-2xx whose cause is not "the token expired".
 * Pulls the JSON-RPC frame out of whichever response mode the server chose.
 *
 * @throws {McpProtocolError} On an oversized body, a body carrying no frame, or one that does not
 * parse.
 * @complexity O(n) in the body length.
 * The first SSE `data:` payload in a stream, or `null`.
 *
 * Only the first is taken, and deliberately: a server may interleave progress notifications before
 * the response, but this client issues one request at a time and wants the frame answering it.
 * Multi-line `data:` fields are joined with newlines per the SSE spec, since a server is entitled
 * to split a long JSON body across them.
 *
 * @complexity O(n) in the body length.
 * A blank line ends an event. Anything collected so far is that event's complete payload.
 * Performs the MCP handshake against a hosted server and returns the connected session.
 *
 * @param deps.exchange - The transport seam. {@link createFetchMcpHttpExchange} in production, a
 * scripted double in tests.
 * @param deps.spec - Endpoint and authenticating headers.
 * @param deps.requestTimeoutMs - Per-request ceiling, applied to the handshake too.
 * @throws {McpProtocolError} If `initialize` fails, times out, or the server refuses it.
 * @complexity O(1) beyond the remote's round-trip.
 * @overallScore 100
 * A failed handshake may still have been issued a session id the server is now holding open.
 * The production {@link McpHttpExchange}: one `fetch` per exchange.
 *
 * Deliberately logic-free — the same discipline as `spawnMcpStdioChannel`. Everything above it is
 * already under test through the exchange seam, and code that only runs when a real network exists
 * is code that only fails in production.
 *
 * `redirect: "error"` is the security-relevant choice, and matches `src/platform/oauth/token-endpoint.ts`:
 * these requests carry a bearer token in a header, and a followed cross-origin redirect would
 * re-send that header to whatever host the server nominated. Refusing to follow means a redirect is
 * a visible failure rather than a silent credential disclosure.
 *
 * @complexity O(n) in the response body length.
 * @overallScore 100
 */

/** Binds Tovu's protocol identity, refusal copy and existing exchange to the Jini transport.
 * Static headers stay the default credential source; a host token supplier can refresh per request.
 * A 401 hook observes challenges without retrying a remote tool or hiding the terminal auth error.
 * @complexity O(1) beyond the bounded handshake.
 */
export async function connectMcpHttpSession(deps: {
  exchange: McpHttpExchange; spec: McpHttpLaunchSpec; requestTimeoutMs: number;
}, optional: {
  bearerToken?: McpBearerTokenSupplier;
  onAuthenticationChallenge?: McpAuthenticationChallengeHook;
} = {}): Promise<McpSessionPort> {
  return connectJiniHttpSession({
    exchange: deps.exchange,
    spec: deps.spec, requestTimeoutMs: deps.requestTimeoutMs,
    messages: tovuFederationMessages, clientInfo: TOVU_MCP_CLIENT_INFO,
    // Undefined explicitly preserves the supplied authenticating headers; it is not an OAuth fallback.
    bearerToken: optional.bearerToken ?? (() => undefined),
  }, { onAuthenticationChallenge: optional.onAuthenticationChallenge });
}
