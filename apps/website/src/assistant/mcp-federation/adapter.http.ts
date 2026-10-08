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
