import {
  InMemoryMcpSession as SharedSession,
  ScriptedMcpStdioChannel as SharedStdioChannel,
  ScriptedMcpHttpExchange as SharedHttpExchange,
  type CapturedRpcMessage, type CapturedHttpRequest, type ScriptedHttpReply,
} from "@jini-ai/mcp/federation/testing";
import type { RemoteToolDescriptor, RemoteToolResult } from "@jini-ai/mcp/federation";
import type { McpSessionPort, McpStdioChannel, McpHttpExchange, McpHttpResponse } from "./ports.js";
import { tovuFederationMessages } from "./presets.js";
export type { CapturedRpcMessage, CapturedHttpRequest, ScriptedHttpReply } from "@jini-ai/mcp/federation/testing";
// Generic fake state/protocol behavior moved to Jini; host session/channel/exchange ABIs remain here.

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
 * Host ABI adapters for Jini test doubles. Ships in `src/` beside the port they implement, exactly as every feature's
 * `repo.memory.ts` does, so they are importable from `__tests__/` without a second tsconfig.
 */

/** Adapt the old host callback ABI; Jini records remote names and owns fake session state. */
export class InMemoryMcpSession implements McpSessionPort {
  private readonly session: SharedSession;
  constructor(options: { tools: readonly RemoteToolDescriptor[];
    onCall?: (name: string, args: Record<string, unknown>) => RemoteToolResult | Promise<RemoteToolResult>;
    onListTools?: () => Promise<RemoteToolDescriptor[]>;
  }) {
    const onCall = options.onCall;
    this.session = new SharedSession({ tools: options.tools }, {
      ...(onCall ? { onCall: ({ name, args }) => onCall(name, args) } : {}),
      ...(options.onListTools ? { onListTools: options.onListTools } : {}),
    });
  }
  get calls() { return this.session.calls; }
  get closed() { return this.session.closed; }
  set closed(value: boolean) { this.session.closed = value; }
  listTools(): Promise<RemoteToolDescriptor[]> { return this.session.listTools(); }
  callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<RemoteToolResult> { return this.session.callTool(request); }
  close(): Promise<void> { return this.session.close({}); }
}

/** Preserve host line callbacks and close wording; Jini owns scheduling, capture and fan-out. */
export class ScriptedMcpStdioChannel implements McpStdioChannel {
  private readonly channel: SharedStdioChannel;
  constructor(options: { respond: (message: CapturedRpcMessage) => unknown }) {
    const respond = options.respond;
    this.channel = new SharedStdioChannel({ respond: ({ message }) => respond(message), messages: tovuFederationMessages });
  }
  get sent() { return this.channel.sent; }
  get closedReason() { return this.channel.closedReason; }
  set closedReason(value: string | null) { this.channel.closedReason = value; }
  send(message: string): void { this.channel.send({ message }); }
  onMessage(listener: (message: string) => void): void { this.channel.onMessage({ listener: ({ message }) => listener(message) }); }
  onClose(listener: (reason: string) => void): void { this.channel.onClose({ listener: ({ reason }) => listener(reason) }); }
  close(): void { this.channel.close({}); }
  deliver(message: unknown): void { this.channel.deliver({ message }); }
  fail(reason: string): void { this.channel.fail({ reason }); }
  idFor(method: string): number | undefined { return this.channel.idFor({ method }); }
}

/** Preserve the single host request bag; Jini owns response scripting and cancellation. */
export class ScriptedMcpHttpExchange implements McpHttpExchange {
  private readonly exchange: SharedHttpExchange;
  constructor(options: { respond: (request: CapturedHttpRequest) => ScriptedHttpReply | undefined }) {
    const respond = options.respond;
    this.exchange = new SharedHttpExchange({ respond: ({ request }) => respond(request) });
  }
  get sent() { return this.exchange.sent; }
  send({ body, signal, ...request }: { url: string; method: "POST" | "DELETE";
    headers: Readonly<Record<string, string>>; body?: string; signal?: AbortSignal;
  }): Promise<McpHttpResponse> { return this.exchange.send(request, { body, signal }); }
  lastRequestFor(method: string): CapturedHttpRequest | undefined { return this.exchange.lastRequestFor({ method }); }
}
