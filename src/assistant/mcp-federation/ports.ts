/**
 * @file The typed boundary for OUTBOUND MCP federation — Tovu's agent daemon acting as an MCP
 * *client* of a third-party MCP server, so the in-app assistant can call that server's tools in
 * addition to Tovu's own registered catalog.
 *
 * Direction, and why it needs saying:
 * `src/assistant/mcp-injection.ts` already wires MCP, but the opposite way round — it hands a
 * spawned coding-agent CLI an `.mcp.json` entry pointing at Tovu's OWN daemon, so that CLI can
 * reach `tool-registrations.ts`'s catalog. There, Tovu is the server and the tools are Tovu's. Here
 * Tovu is the client and the tools belong to somebody else. Nothing about the injection precedent
 * transfers: its `credential` question was "what token do we hand out", this one's is "what do we
 * accept back", and the second question is the harder of the two.
 *
 * Why a Tovu-declared port rather than `@modelcontextprotocol/sdk`:
 * the SDK is not a dependency of this repo and adding one for a surface this small would pull a
 * transitive tree into the daemon's boot path for what is, on the wire, newline-delimited JSON-RPC
 * 2.0. More to the point, the codebase's discipline (ADR-006 rule-of-two; every domain's
 * `repo.sqlite.ts`/`repo.memory.ts` pair; `features/database/adapter.sqlite.ts`'s
 * `DatabaseIntrospectionPort`) is that an external boundary is a small interface this codebase
 * declares, with a real adapter and a test double on either side of it. {@link McpSessionPort} is
 * that interface; `adapter.stdio.ts` is the real side, `adapter.memory.ts` the doubles.
 *
 * Two seams, not one, and deliberately so:
 * - {@link McpSessionPort} is the seam the federation layer (`registrations.ts`) depends on, so the
 *   trust tier and the registration wiring can be tested with no protocol at all.
 * - {@link McpStdioChannel} is the seam INSIDE the real stdio adapter, so that adapter's own
 *   JSON-RPC framing, handshake ordering, pagination and timeout behaviour are exercised against a
 *   scripted channel rather than only being stubbed past. A fake at the outer seam alone would test
 *   the fake; this way the real client code is under test too, which is what the "no live Supabase
 *   project in the sandbox" constraint requires if the protocol code is to mean anything.
 *
 * Everything a remote server sends across this boundary — tool names, descriptions, input schemas,
 * annotations, results — is UNTRUSTED INPUT. This file types it; it does not vet it. Vetting is
 * `trust.ts`'s whole job and is applied before any of it reaches a `ToolRegistry` or a model.
 *
 * Architectural role:
 * Port declarations only. No I/O, no policy, no dependencies beyond types.
 */

/**
 * MCP's per-tool behaviour hints, exactly as a remote server declares them.
 *
 * These are SELF-DECLARED BY THE THING BEING CLASSIFIED, which is precisely the property
 * `tool-registration-kit.ts`'s {@link DerivedRiskByToolId} exists to refuse: "a tool's risk must not
 * be self-declared... a catalog entry that quietly downgraded itself to `sideEffects:'none'` would
 * otherwise become 'safe' by editing one word". A remote server editing one word of its own
 * `annotations` is the same move, made by a party Tovu does not even control.
 *
 * They are therefore modelled, carried, and logged — but `trust.ts` only ever lets them make a tool
 * LESS available, never more. See {@link admitRemoteTool}'s one-way rule.
 */
export interface RemoteToolAnnotations {
  readonly title?: string;
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

/** One entry of a remote server's `tools/list` response. Every field is attacker-controlled. */
export interface RemoteToolDescriptor {
  readonly name: string;
  readonly description?: string;
  /** JSON Schema, as published by the remote. `trust.ts` refuses any tool whose schema is not a
   * JSON-Schema object — a schema-less tool is refused for federated tools for the same reason
   * `buildDomainRegistrations` refuses one for native tools. */
  readonly inputSchema?: unknown;
  readonly annotations?: RemoteToolAnnotations;
}

/** One `tools/call` response. `isError` is the remote's own claim about its own outcome. */
export interface RemoteToolResult {
  readonly content?: unknown;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

/**
 * An established MCP client session against one remote server.
 *
 * Intentionally three methods and no more: this is the entire surface federation needs. MCP's
 * resources/prompts/sampling/roots are all deliberately out of scope — sampling in particular would
 * let a remote server drive inference on Tovu's account, which is a far larger grant than "expose
 * some tools" and is not something this pass builds a trust story for.
 */
export interface McpSessionPort {
  /** The remote's advertised tool surface, already paginated to completion by the adapter. */
  listTools(): Promise<RemoteToolDescriptor[]>;
  callTool(request: { name: string; arguments: Record<string, unknown>; signal?: AbortSignal }): Promise<RemoteToolResult>;
  close(): Promise<void>;
}

/**
 * The byte-level seam under `adapter.stdio.ts`: a bidirectional stream of newline-delimited
 * JSON-RPC 2.0 messages.
 *
 * Deliberately dumb — it knows about lines, not about MCP. All protocol knowledge (handshake
 * ordering, id correlation, pagination, timeouts) lives in the adapter above it, which is what
 * makes that knowledge testable without a child process.
 */
export interface McpStdioChannel {
  /** Writes one JSON-RPC message. Implementations append the framing newline themselves. */
  send(message: string): void;
  /** Registers the sink for inbound messages, one complete JSON value per call. */
  onMessage(listener: (message: string) => void): void;
  /** Registers the sink for "this channel is gone" — process exit, stream error, explicit close. */
  onClose(listener: (reason: string) => void): void;
  close(): void;
}

/**
 * One site owner's configured federated connection.
 *
 * `allowedToolNames` is the load-bearing field and has NO safe default at this layer: an empty
 * allowlist yields zero federated tools, which is the correct behaviour for a misconfigured
 * connection. A DEFAULT is a per-vendor judgement and therefore belongs to a vendor preset, not
 * here — see `src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts`, whose default was authored
 * from that server's real, inspected tool surface, which is what makes it an independent
 * classification rather than a restatement of the remote's own claims.
 */
export interface FederatedMcpConnectionConfig {
  /** Operator-chosen, stable, `[a-z0-9-]`. Becomes part of every federated tool id, so renaming it
   * renames every tool the model sees — pick once. */
  readonly connectionId: string;
  /** Human-readable, shown to the model as provenance on every federated tool description. */
  readonly label: string;
  /** DEFAULT-DENY allowlist of REMOTE tool names (pre-namespacing). */
  readonly allowedToolNames: readonly string[];
  /** How long the initialize+list handshake may take before federation is abandoned for this boot. */
  readonly connectTimeoutMs: number;
  /** Per-`tools/call` ceiling. */
  readonly callTimeoutMs: number;
  /** Hard cap on a single federated result's serialized size, before it is handed to the model. */
  readonly maxResultBytes: number;
  /** Hard cap on how many tools this connection may contribute, whatever the remote advertises. */
  readonly maxTools: number;
}

/** How a federated connection is launched. Only stdio is implemented this pass — see
 * `docs/architecture/reference/external-mcp-server-federation.md` for why the hosted HTTP
 * transport is deferred rather than half-built. */
export interface McpStdioLaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
  /** Child-process-only environment. Secrets belong here and NOWHERE else — never in `args`, which
   * are world-readable in `/proc/<pid>/cmdline` on Linux and in `ps` output everywhere. */
  readonly env: Readonly<Record<string, string>>;
  readonly cwd?: string;
}
