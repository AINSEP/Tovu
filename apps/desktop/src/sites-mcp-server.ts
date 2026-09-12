/**
 * @file The MCP server's protocol layer: one inbound JSON-RPC message in, one response object (or
 * `null` for a notification) out. Pure — no stdio, no process, no clock — so the whole handshake is
 * assertable from `node --test` without spawning anything.
 *
 * `mcp-bridge.mjs` is then only framing: read a line, parse it, call {@link handleSitesMcpRequest},
 * write the result. That split exists because the protocol is where the mistakes are (a reply to a
 * notification wedges a client, a missing `capabilities.tools` makes a server look toolless, an
 * `id: 0` treated as absent drops a real request) and none of those are visible in a test that has
 * to own a child process to find them.
 *
 * ## What this must satisfy, and where that is written down
 *
 * The only client this server ever talks to is Tovu's own federated MCP client, so the contract is
 * readable rather than guessed — `apps/website/src/assistant/mcp-federation/`:
 *
 * - `mcp-protocol.ts:28` pins the client's protocol version at `2025-06-18`, sent as
 *   `initialize`'s `protocolVersion`. See {@link SUPPORTED_PROTOCOL_VERSIONS}.
 * - `adapter.stdio.ts:108-114` sends `initialize`, then the `notifications/initialized`
 *   notification, which carries no `id` and **must not be answered**.
 * - `adapter.stdio.ts:289-295` frames messages by NEWLINE, one JSON object per line.
 * - `mcp-protocol.ts:142-152` reads `tools/list`'s `tools` array and follows `nextCursor` while one
 *   is present, bounded. This server returns every tool in one page and no cursor.
 * - `mcp-protocol.ts:99-108` reads `tools/call`'s `content`, `structuredContent` and `isError`.
 * - `adapter.stdio.ts:172-190` refuses any request the SERVER initiates with a `-32601`, since the
 *   client advertises no capabilities. So this server never initiates one.
 */
import { describeSitesMcpTools, runSitesMcpTool } from "./sites-mcp-tools.ts";

/**
 * Protocol revisions this server will agree to speak.
 *
 * An agreed version is ECHOED and an unknown one is answered with {@link PREFERRED_PROTOCOL_VERSION}
 * instead — which is the spec's own negotiation rule, and is also why the client's string is never
 * simply reflected: reflecting it would report agreement with a revision this code has not been
 * written against, and the client stores that value and later sends it back as a header
 * (`adapter.http.ts:178`).
 */
const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(["2025-06-18", "2025-03-26"]);
const PREFERRED_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/** Identifies this server in the client's logs and in `trust.ts`'s provenance prefix. */
const SERVER_INFO = Object.freeze({ name: "tovu-desktop", version: "1" });

/** JSON-RPC's own code for "no such method", the one this server can legitimately return. */
const METHOD_NOT_FOUND = -32601;

/** @returns the version to agree on. @complexity O(1). */
function negotiateProtocolVersion(requested) {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : PREFERRED_PROTOCOL_VERSION;
}

/**
 * The request handlers, keyed by JSON-RPC method.
 *
 * A table rather than a switch so an unknown method has exactly one outcome ({@link
 * handleSitesMcpRequest}'s `-32601`) and adding a method cannot accidentally fall through into a
 * neighbour's branch.
 *
 * `capabilities.tools` is an empty object on purpose: it declares that tools exist without claiming
 * `listChanged`, which this server does not support — and must not claim, since the client freezes
 * the admitted tool set at connect (`trust.ts` R5) and ignores the notification anyway. Advertising
 * a capability nobody honours is how a client ends up waiting for an event that never comes.
 */
const METHODS = Object.freeze({
  initialize: (params) => ({
    protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
  }),
  /** Every tool in one page, and deliberately NO `nextCursor` — the client would follow one.
   *  `cursor` in the request is accepted and ignored: a client that sends one on a first page is
   *  not an error worth failing a connection over. */
  "tools/list": () => ({ tools: describeSitesMcpTools() }),
  "tools/call": (params, context) => runSitesMcpTool(params?.name, params?.arguments, context),
});

/**
 * Methods that are NOTIFICATIONS: no reply, ever, even though they arrive on the same channel.
 *
 * Listed explicitly rather than inferred from a missing `id`, because the two conditions answer
 * different questions. "Has no id" is a property of one message and would silently swallow a
 * malformed REQUEST that forgot its id; this set is the statement that the method itself is
 * one-way. Both checks run — see {@link handleSitesMcpRequest}.
 */
const NOTIFICATIONS = Object.freeze(new Set(["notifications/initialized", "notifications/cancelled"]));

/** Whether `id` is a usable JSON-RPC correlation id. `0` and `""` are VALID ids and a truthiness
 *  test would drop both — the client uses an incrementing counter, so a first request of id `0` is
 *  not hypothetical. `null` means notification per JSON-RPC. @complexity O(1). */
function hasRequestId(id) {
  return typeof id === "string" || typeof id === "number";
}

/**
 * Handle one parsed inbound message.
 *
 * @param message a parsed JSON-RPC object. Anything unrecognizable is treated as a notification
 *   (answered with `null`) rather than as an error to send back: a reply to something that was not
 *   a request either goes to a correlation id that does not exist, or — worse, with a fabricated id
 *   — resolves a pending request of the client's with the wrong answer.
 * @param context the dependency bag `sites-mcp-tools.js` handlers take (`projectsPath`,
 *   `revealPath`, optionally `classifySiteDir`).
 * @returns the response object to send, or `null` when nothing must be sent.
 * @complexity O(1) beyond the dispatched handler's own cost.
 */
async function handleSitesMcpRequest(message, context) {
  const method = message?.method;
  if (typeof method !== "string") return null;
  if (NOTIFICATIONS.has(method) || !hasRequestId(message.id)) return null;

  const handler = METHODS[method];
  if (handler === undefined) {
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: { code: METHOD_NOT_FOUND, message: `method '${method}' is not supported by the Tovu desktop MCP server` },
    };
  }

  return { jsonrpc: "2.0", id: message.id, result: await handler(message.params, context) };
}

export {
  METHOD_NOT_FOUND,
  PREFERRED_PROTOCOL_VERSION,
  SERVER_INFO,
  SUPPORTED_PROTOCOL_VERSIONS,
  handleSitesMcpRequest,
};
