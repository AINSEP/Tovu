import {
  ScriptedMcpStdioChannel as SharedStdioChannel,
  ScriptedMcpHttpExchange as SharedHttpExchange,
  type CapturedRpcMessage, type CapturedHttpRequest, type ScriptedHttpReply,
} from "@jini-ai/mcp/federation/testing";
import { tovuFederationMessages } from "./presets.js";
export { InMemoryMcpSession } from "@jini-ai/mcp/federation/testing";
export type { CapturedRpcMessage, CapturedHttpRequest, ScriptedHttpReply } from "@jini-ai/mcp/federation/testing";
// Jini owns the canonical session/channel/exchange ABI; only host script callbacks and copy bind here.

/**
 * @file The in-memory doubles for both federation seams — ADR-006 rule-of-two's partner to
 * `adapter.stdio.ts`, and this codebase's usual `repo.memory.ts`/`repo.sqlite.ts` split applied to
 * an outbound protocol boundary instead of a database.
 *
 * One double per seam (see `ports.ts`), and they test different things:
 *
 * - {@link InMemoryMcpSession} fakes `McpSessionPort`, i.e. "an MCP server exists and behaves". It
 *   is what `registrations.ts`'s tests use, so the trust tier and the registration wiring are
 *   exercised with no protocol in the picture at all.
 *
 * - {@link ScriptedMcpStdioChannel} fakes `McpStdioChannel`, i.e. raw newline-delimited JSON-RPC.
 *   It is what `adapter.stdio.ts`'s OWN tests use, so the real client's handshake ordering,
 *   pagination, id correlation, timeout and close behaviour are exercised against something that
 *   can also misbehave on purpose — reply out of order, reply late, reply twice, never reply,
 *   send an unsolicited request, or die mid-flight.
 *
 * - {@link ScriptedMcpHttpExchange} does the same for `McpHttpExchange`, the hosted transport's
 *   seam, so `adapter.http.ts` is under test on the same terms.
 *
 * Those inner-seam doubles are the ones that make the "no live third-party server in this sandbox"
 * constraint survivable: the protocol code under test is the real production code, and only the
 * pipe beneath it is fake. A double at the outer seam alone would have proved only that the double
 * works.
 *
 * Architectural role:
 * Host script bindings for Jini test doubles. Ships in `src/` beside the adapters, exactly as every feature's
 * `repo.memory.ts` does, so they are importable from `__tests__/` without a second tsconfig.
 */

/** Bind host script callbacks and close wording; Jini owns scheduling, capture and fan-out. */
export class ScriptedMcpStdioChannel extends SharedStdioChannel {
  constructor(options: { respond: (message: CapturedRpcMessage) => unknown }, _optional: Record<string, never> = {}) {
    const respond = options.respond;
    super({ respond: ({ message }) => respond(message), messages: tovuFederationMessages });
  }
}

/** Bind host script callbacks; Jini owns response scripting and cancellation. */
export class ScriptedMcpHttpExchange extends SharedHttpExchange {
  constructor(options: { respond: (request: CapturedHttpRequest) => ScriptedHttpReply | undefined }, _optional: Record<string, never> = {}) {
    const respond = options.respond;
    super({ respond: ({ request }) => respond(request) });
  }
}
