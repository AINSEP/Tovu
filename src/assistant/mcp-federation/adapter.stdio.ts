import { spawn } from "node:child_process";

import type { McpSessionPort, McpStdioChannel, McpStdioLaunchSpec, RemoteToolDescriptor, RemoteToolResult } from "./ports";

/**
 * @file The real `McpSessionPort` adapter: a minimal MCP client speaking newline-delimited JSON-RPC
 * 2.0 over a child process's stdio, which is the transport every locally-launched MCP server
 * (Supabase's `mcp-server-supabase` bin included) exposes.
 *
 * Purpose:
 * Turns "there is a program on disk that speaks MCP" into the three-method
 * `listTools`/`callTool`/`close` port the federation layer depends on. It performs the handshake
 * (`initialize` -> `notifications/initialized`), drains `tools/list` across its cursor pagination,
 * correlates `tools/call` responses by JSON-RPC id, and enforces a timeout on every request.
 *
 * Why hand-rolled rather than `@modelcontextprotocol/sdk`:
 * see `ports.ts`'s header. Short version — the SDK is not a dependency here, the wire format needed
 * is four methods of JSON-RPC, and this codebase's convention is a declared port with a real
 * adapter and a double rather than a vendored client.
 *
 * Why the {@link McpStdioChannel} seam:
 * this adapter takes a channel, not a `ChildProcess`. All the logic worth testing — that
 * `initialize` precedes everything, that `notifications/initialized` is sent and carries no id,
 * that a paginated `tools/list` is drained to completion and bounded, that a late reply to a
 * timed-out id is discarded rather than resolving the wrong call, that a channel closing mid-flight
 * rejects every in-flight request instead of hanging forever — is exercisable against a scripted
 * channel with no process at all. `spawnMcpStdioChannel` is the thin, deliberately logic-free
 * production implementation of that seam.
 *
 * Hostile-server posture (this file's share of it; `trust.ts` owns the rest):
 * a remote is assumed to be able to stall, flood, or lie. So: every request is timeout-bounded,
 * pagination is loop-bounded, a single inbound line is length-bounded, unparseable lines are
 * dropped rather than thrown on, and unsolicited server-to-client requests (including
 * `sampling/createMessage` — a remote asking Tovu to run inference on its behalf) are answered with
 * a JSON-RPC "method not found" rather than being honoured. Notifications, `tools/list_changed`
 * among them, are ignored by design: `trust.ts` R5 freezes the admitted set at connect.
 *
 * Architectural role:
 * Infrastructure adapter, co-located with its port under `assistant/mcp-federation` — mirroring
 * `features/database/adapter.sqlite.ts`'s co-location with the `DatabaseIntrospectionPort` it
 * implements, rather than `db/`'s older per-port-file convention, because this port is this
 * adapter's own invention rather than a cross-domain-shared one.
 */

/** The MCP revision this client negotiates. A server replying with a different one is accepted —
 * MCP's own rule is that the server names the version it will actually speak — but the value is
 * carried on the session so a mismatch is visible in logs rather than silent. */
const CLIENT_PROTOCOL_VERSION = "2025-06-18";

const CLIENT_INFO = { name: "tovu-assistant", version: "0.1.0" } as const;

/** Bound on `tools/list` cursor-following. A server that returns a fresh `nextCursor` forever would
 * otherwise pin the daemon's boot at 100% CPU; `trust.ts`'s `maxTools` caps what is admitted, but
 * that check runs after this loop, so the loop needs its own bound. */
const MAX_LIST_TOOLS_PAGES = 20;

/** Bound on a single inbound line. A remote that streams one unterminated multi-gigabyte "message"
 * would otherwise grow the reassembly buffer without limit. 4 MiB is far above any legitimate MCP
 * message and far below anything that threatens the daemon. */
const MAX_INBOUND_MESSAGE_BYTES = 4 * 1024 * 1024;

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
  method?: string;
  params?: unknown;
}

class McpProtocolError extends Error {}

/**
 * A connected MCP client session over one {@link McpStdioChannel}.
 *
 * Constructed by {@link connectMcpStdioSession} rather than directly, so a session that exists is
 * always a session whose handshake has completed — there is no half-initialized state a caller
 * could accidentally use.
 */
class McpStdioSession implements McpSessionPort {
  private readonly channel: McpStdioChannel;
  private readonly requestTimeoutMs: number;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private nextId = 1;
  private closedReason: string | null = null;

  /** The protocol version the SERVER said it would speak, for diagnostics. */
  public serverProtocolVersion = "";
  /** The server's self-reported identity, for diagnostics and audit. Untrusted, like everything
   * else it sends — recorded, never acted on. */
  public serverInfo: { name?: string; version?: string } = {};

  constructor(deps: { channel: McpStdioChannel; requestTimeoutMs: number }) {
    this.channel = deps.channel;
    this.requestTimeoutMs = deps.requestTimeoutMs;
    this.channel.onMessage((line) => this.handleMessage(line));
    this.channel.onClose((reason) => this.handleClose(reason));
  }

  /**
   * @complexity O(p) in the number of `tools/list` pages, bounded by {@link MAX_LIST_TOOLS_PAGES}.
   * @overallScore 100
   */
  async listTools(): Promise<RemoteToolDescriptor[]> {
    const collected: RemoteToolDescriptor[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_LIST_TOOLS_PAGES; page += 1) {
      const result = await this.request("tools/list", cursor === undefined ? {} : { cursor });
      const record = asRecord(result);
      const tools = record && Array.isArray(record.tools) ? record.tools : [];
      for (const tool of tools) {
        const descriptor = asRemoteToolDescriptor(tool);
        // A malformed entry is dropped here rather than thrown on: one bad descriptor must not cost
        // the operator every other tool on the same server. `trust.ts` refuses anything that
        // survives this and still fails its own checks.
        if (descriptor) collected.push(descriptor);
      }
      const next = record?.nextCursor;
      if (typeof next !== "string" || next.length === 0) return collected;
      cursor = next;
    }

    throw new McpProtocolError(
      `mcp-federation: the remote server kept returning a tools/list nextCursor past ${MAX_LIST_TOOLS_PAGES} pages — refusing to follow it further`,
    );
  }

  /**
   * @complexity O(1) beyond the remote's own round-trip.
   * @overallScore 100
   */
  async callTool(request: { name: string; arguments: Record<string, unknown>; signal?: AbortSignal }): Promise<RemoteToolResult> {
    const result = await this.request("tools/call", { name: request.name, arguments: request.arguments }, request.signal);
    const record = asRecord(result);
    if (!record) return { content: result };
    return {
      content: record.content,
      structuredContent: record.structuredContent,
      // The remote's own claim about its own outcome. Surfaced to the model inside the untrusted
      // envelope (`trust.ts` R7); never used to decide anything on this side.
      isError: record.isError === true,
    };
  }

  async close(): Promise<void> {
    this.handleClose("closed by Tovu");
    this.channel.close();
  }

  /** Sends the handshake. Separate from the constructor because it is the one part that can fail,
   * and a session object that exists must be one that completed it. */
  async initialize(): Promise<void> {
    const result = await this.request("initialize", {
      protocolVersion: CLIENT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    const record = asRecord(result);
    this.serverProtocolVersion = typeof record?.protocolVersion === "string" ? record.protocolVersion : "";
    const info = asRecord(record?.serverInfo);
    this.serverInfo = {
      name: typeof info?.name === "string" ? info.name : undefined,
      version: typeof info?.version === "string" ? info.version : undefined,
    };
    // MCP requires this notification after a successful initialize, and requires that a
    // notification carry no `id` — a server is entitled to reject the session otherwise.
    this.channel.send(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  }

  private request(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (this.closedReason !== null) {
      return Promise.reject(new McpProtocolError(`mcp-federation: session is closed (${this.closedReason})`));
    }
    const id = this.nextId++;

    return new Promise<unknown>((resolve, reject) => {
      // Deliberately NOT `unref()`ed. An unref'd timer lets the event loop drain while a request is
      // still in flight, which means the request's promise is abandoned unsettled rather than
      // rejected — a caller awaiting it simply never continues. It bought nothing anyway: shutdown
      // is `close()`, and `handleClose` already rejects every pending request and clears every
      // timer, so a session being torn down never waits on this timer regardless.
      const timer = setTimeout(() => {
        // Settle AND forget. Deleting the entry is what makes a late reply to this id a no-op
        // rather than a resolution of whatever call happens to be waiting later.
        this.pending.delete(id);
        reject(new McpProtocolError(`mcp-federation: '${method}' timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      if (signal) {
        if (signal.aborted) {
          this.settleRejection(id, new McpProtocolError(`mcp-federation: '${method}' was aborted before it was sent`));
          return;
        }
        signal.addEventListener("abort", () => this.settleRejection(id, new McpProtocolError(`mcp-federation: '${method}' was aborted`)), {
          once: true,
        });
      }

      try {
        this.channel.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      } catch (error) {
        this.settleRejection(id, error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private settleRejection(id: number, error: Error): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    entry.reject(error);
  }

  private handleMessage(line: string): void {
    if (line.length > MAX_INBOUND_MESSAGE_BYTES) return;

    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch {
      // Servers routinely emit non-JSON banner noise on the same stream. Dropping it is correct;
      // throwing would let a stray log line kill an otherwise healthy session.
      return;
    }

    // An inbound message carrying a `method` is the server calling US. Tovu advertises no
    // capabilities in `initialize`, so there is nothing it may legitimately ask for — notably
    // `sampling/createMessage`, which would have Tovu run model inference on the remote's behalf.
    // Requests get a well-formed refusal; notifications (`tools/list_changed` included, see
    // `trust.ts` R5) are ignored.
    if (typeof message.method === "string") {
      if (message.id !== undefined && message.id !== null) {
        this.channel.send(
          JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `method '${message.method}' is not supported by this client` } }),
        );
      }
      return;
    }

    if (typeof message.id !== "number") return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    clearTimeout(entry.timer);

    if (message.error) {
      entry.reject(new McpProtocolError(`mcp-federation: remote returned JSON-RPC error ${message.error.code ?? "?"}: ${message.error.message ?? "(no message)"}`));
      return;
    }
    entry.resolve(message.result);
  }

  private handleClose(reason: string): void {
    if (this.closedReason !== null) return;
    this.closedReason = reason;
    // Every in-flight request must be settled, or a caller awaits forever on a dead pipe.
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      clearTimeout(entry.timer);
      entry.reject(new McpProtocolError(`mcp-federation: session closed before the request completed (${reason})`));
    }
  }
}

/**
 * Performs the MCP handshake over `channel` and returns the connected session.
 *
 * @param deps.channel - The transport seam. `spawnMcpStdioChannel` in production, a scripted
 * double in tests.
 * @param deps.requestTimeoutMs - Per-request ceiling, applied to the handshake too.
 * @throws {Error} If `initialize` fails, times out, or the channel dies during it.
 * @complexity O(1) beyond the remote's round-trip.
 * @overallScore 100
 */
export async function connectMcpStdioSession(deps: { channel: McpStdioChannel; requestTimeoutMs: number }): Promise<McpSessionPort> {
  const session = new McpStdioSession(deps);
  try {
    await session.initialize();
  } catch (error) {
    // A failed handshake must not leave a child process parented to the daemon forever.
    await session.close().catch(() => undefined);
    throw error;
  }
  return session;
}

/**
 * The production {@link McpStdioChannel}: a child process, its stdin, and newline-framed stdout.
 *
 * Deliberately logic-free — reassembly and nothing else — because everything above it is already
 * under test through the channel seam, and code that only runs when a real process exists is code
 * that only fails in production.
 *
 * `env` REPLACES rather than extends the parent environment, which is the security-relevant choice:
 * the daemon's own `process.env` holds `TOVU_AGENT_DAEMON_TOKEN` (`daemon-auth.ts`), and handing
 * that to a third-party vendor's child process would give it Tovu's own daemon credential — the
 * exact inversion of the `mcp-injection.ts` grant, and a far worse one. A federated server receives
 * what `config.ts` explicitly puts in `env`, plus {@link INHERITED_ENV_VARS} and nothing else.
 *
 * @complexity O(n) in bytes received.
 * @overallScore 100
 */
export function spawnMcpStdioChannel(spec: McpStdioLaunchSpec): McpStdioChannel {
  const child = spawn(spec.command, [...spec.args], {
    cwd: spec.cwd,
    env: { ...inheritedEnv(), ...spec.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const messageListeners: Array<(message: string) => void> = [];
  const closeListeners: Array<(reason: string) => void> = [];
  let buffer = "";
  let closed = false;

  const emitClose = (reason: string): void => {
    if (closed) return;
    closed = true;
    for (const listener of closeListeners) listener(reason);
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_INBOUND_MESSAGE_BYTES) {
      // A remote streaming an unterminated line past the cap is not recoverable — the framing is
      // already lost. Drop the connection rather than growing the buffer.
      buffer = "";
      emitClose("inbound message exceeded the size cap");
      child.kill();
      return;
    }
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) for (const listener of messageListeners) listener(line);
      newline = buffer.indexOf("\n");
    }
  });

  // stderr is a diagnostic channel for MCP servers, never a protocol one. Consumed so the pipe
  // cannot fill and deadlock the child, and never parsed.
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", () => undefined);

  child.on("error", (error: Error) => emitClose(`child process error: ${error.message}`));
  child.on("exit", (code, signal) => emitClose(`child process exited (code=${String(code)}, signal=${String(signal)})`));

  return {
    send(message: string): void {
      if (closed) throw new Error("mcp-federation: cannot write to a closed stdio channel");
      child.stdin.write(`${message}\n`);
    },
    onMessage(listener) {
      messageListeners.push(listener);
    },
    onClose(listener) {
      closeListeners.push(listener);
    },
    close(): void {
      emitClose("closed by Tovu");
      child.stdin.end();
      child.kill();
    },
  };
}

/**
 * The ONLY parent environment variables a federated server inherits — an explicit allowlist, so
 * adding to it is a visible decision rather than a default.
 *
 * Not merely `PATH`: the Supabase preset launches via `npx`, which resolves its package cache under
 * `HOME` (and writes to `TMPDIR`). A child spawned with `PATH` alone would fail to start at all, or
 * silently re-download on every boot — the kind of bug that only appears in production, since no
 * test spawns a real process.
 *
 * Deliberately absent: everything else. `TOVU_AGENT_DAEMON_TOKEN` most of all (see this function's
 * caller), but also proxy and CA variables — those can carry embedded credentials, and an operator
 * who genuinely needs them should put them in a connection's own `env` where the grant is written
 * down.
 */
const INHERITED_ENV_VARS = ["PATH", "HOME", "TMPDIR"] as const;

function inheritedEnv(): Record<string, string> {
  const inherited: Record<string, string> = {};
  for (const name of INHERITED_ENV_VARS) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) inherited[name] = value;
  }
  return inherited;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Narrows one `tools/list` entry, discarding anything without a usable `name`. Shape only — the
 * trust decisions all live in `trust.ts`. */
function asRemoteToolDescriptor(value: unknown): RemoteToolDescriptor | null {
  const record = asRecord(value);
  if (!record || typeof record.name !== "string" || record.name.length === 0) return null;
  const annotations = asRecord(record.annotations);
  return {
    name: record.name,
    description: typeof record.description === "string" ? record.description : undefined,
    inputSchema: record.inputSchema,
    annotations: annotations
      ? {
          title: typeof annotations.title === "string" ? annotations.title : undefined,
          readOnlyHint: typeof annotations.readOnlyHint === "boolean" ? annotations.readOnlyHint : undefined,
          destructiveHint: typeof annotations.destructiveHint === "boolean" ? annotations.destructiveHint : undefined,
          idempotentHint: typeof annotations.idempotentHint === "boolean" ? annotations.idempotentHint : undefined,
          openWorldHint: typeof annotations.openWorldHint === "boolean" ? annotations.openWorldHint : undefined,
        }
      : undefined,
  };
}
