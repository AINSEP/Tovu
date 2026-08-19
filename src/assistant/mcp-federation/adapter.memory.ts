import type { McpSessionPort, McpStdioChannel, RemoteToolDescriptor, RemoteToolResult } from "./ports.js";

/**
 * @file The in-memory doubles for both federation seams — ADR-006 rule-of-two's partner to
 * `adapter.stdio.ts`, and this codebase's usual `repo.memory.ts`/`repo.sqlite.ts` split applied to
 * an outbound protocol boundary instead of a database.
 *
 * Two doubles because there are two seams (see `ports.ts`), and they test different things:
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
 * That second double is the one that makes the "no live Supabase project in this sandbox"
 * constraint survivable: the protocol code under test is the real production code, and only the
 * pipe beneath it is fake. A double at the outer seam alone would have proved only that the double
 * works.
 *
 * Architectural role:
 * Test doubles. Ships in `src/` beside the port they implement, exactly as every feature's
 * `repo.memory.ts` does, so they are importable from `__tests__/` without a second tsconfig.
 */

/**
 * A scripted `McpSessionPort`: a fixed tool list plus a per-tool call handler.
 *
 * `callTool` records every call, so a test can assert not just the returned value but that the
 * REMOTE NAME was sent — the property that proves namespacing is applied on the way in and stripped
 * on the way out, which is the single most load-bearing behaviour in the registration layer.
 */
export class InMemoryMcpSession implements McpSessionPort {
  readonly calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  closed = false;

  private readonly tools: RemoteToolDescriptor[];
  private readonly handler: (name: string, args: Record<string, unknown>) => RemoteToolResult | Promise<RemoteToolResult>;
  private readonly listToolsBehaviour: (() => Promise<RemoteToolDescriptor[]>) | undefined;

  constructor(options: {
    tools: readonly RemoteToolDescriptor[];
    /** Defaults to echoing the call back, which is enough for most wiring assertions. */
    onCall?: (name: string, args: Record<string, unknown>) => RemoteToolResult | Promise<RemoteToolResult>;
    /** Overrides `listTools` wholesale, for the "the remote is down at connect time" cases. */
    onListTools?: () => Promise<RemoteToolDescriptor[]>;
  }) {
    this.tools = [...options.tools];
    this.handler = options.onCall ?? ((name, args) => ({ content: [{ type: "text", text: `called ${name} with ${JSON.stringify(args)}` }] }));
    this.listToolsBehaviour = options.onListTools;
  }

  async listTools(): Promise<RemoteToolDescriptor[]> {
    if (this.listToolsBehaviour) return this.listToolsBehaviour();
    return [...this.tools];
  }

  async callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<RemoteToolResult> {
    this.calls.push({ name: request.name, arguments: request.arguments });
    return this.handler(request.name, request.arguments);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/** One JSON-RPC message the fake channel received from the client under test. */
export interface CapturedRpcMessage {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

/**
 * A fake {@link McpStdioChannel} that plays the SERVER side of MCP, under the test's control.
 *
 * `respond` is a plain function of the received message, so a test scripts a server by writing one:
 * return a response object to reply, or `undefined` to stay silent (the case that exercises the
 * client's timeout path). Everything the client sends is captured in {@link sent}, which is how
 * handshake ordering is asserted — that `initialize` comes first and that
 * `notifications/initialized` follows it with no `id`.
 */
export class ScriptedMcpStdioChannel implements McpStdioChannel {
  /** Every message the client wrote, parsed, in order. */
  readonly sent: CapturedRpcMessage[] = [];
  closedReason: string | null = null;

  private readonly messageListeners: Array<(message: string) => void> = [];
  private readonly closeListeners: Array<(reason: string) => void> = [];
  private readonly respond: (message: CapturedRpcMessage) => unknown;

  constructor(options: {
    /** Return a JSON-RPC response object to reply with, or `undefined` for silence. */
    respond: (message: CapturedRpcMessage) => unknown;
  }) {
    this.respond = options.respond;
  }

  send(message: string): void {
    if (this.closedReason !== null) throw new Error("scripted channel is closed");
    const parsed = JSON.parse(message) as CapturedRpcMessage;
    this.sent.push(parsed);
    const reply = this.respond(parsed);
    // Delivered on a later microtask, as a real pipe would: a client that only works when its reply
    // arrives synchronously inside its own `send` is a client that does not work.
    if (reply !== undefined) queueMicrotask(() => this.deliver(reply));
  }

  onMessage(listener: (message: string) => void): void {
    this.messageListeners.push(listener);
  }

  onClose(listener: (reason: string) => void): void {
    this.closeListeners.push(listener);
  }

  close(): void {
    this.fail("closed by Tovu");
  }

  /** Pushes a message to the client out of band — for late replies, unsolicited server requests,
   * and notifications. */
  deliver(message: unknown): void {
    const line = typeof message === "string" ? message : JSON.stringify(message);
    for (const listener of this.messageListeners) listener(line);
  }

  /** Simulates the far end dying. */
  fail(reason: string): void {
    if (this.closedReason !== null) return;
    this.closedReason = reason;
    for (const listener of this.closeListeners) listener(reason);
  }

  /** The last id the client used for `method`, for building a matching reply. */
  idFor(method: string): number | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i]?.method === method) return this.sent[i]?.id;
    }
    return undefined;
  }
}
