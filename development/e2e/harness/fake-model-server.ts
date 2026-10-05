// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import * as http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * @file Layer-2 fake model server (SCOPE.md §5 "Fake model server", E2E-H1): a loopback HTTP server
 * that stands in for a model vendor, so an assistant journey drives the REAL server path (BYOK
 * route -> provider adapter -> tool loop -> real tool handlers -> real DB) with no key and no quota.
 *
 * Generalized from the inline Gemini "confused deputy" in `byok-google-tool-schema.spec.ts` (that
 * spec is not edited). What changed:
 *  - a scripted TURN QUEUE instead of a hard-coded "first call a tool, then reply" branch. Each
 *    generation request takes the next turn; a turn may be a function of the captured request, so a
 *    script can read the tool result the server just sent back and answer from it.
 *  - two wire protocols: `anthropic` (`POST /v1/messages`, named SSE events, the shape
 *    `@jini-ai/agent-runtime`'s `anthropic-messages.ts` reduces) and `google`
 *    (`POST /v1beta/models/<model>:streamGenerateContent?alt=sse`, bare `data:` records).
 *  - an EMPTY queue answers 500 with a vendor-shaped error naming the problem, so an unexpected
 *    extra model call fails the journey loudly instead of hanging or looping.
 *  - every request is captured (method, path, headers, parsed body) for assertions.
 *
 * Keep it minimal and assert on the APP, not on the stub (SCOPE.md §6): a provider-adapter change
 * can break the stub's SSE without breaking the product.
 *
 * Point the server's BYOK credential at {@link FakeModelServer.baseUrl}. The provider adapters'
 * SSRF guard carves out loopback literals, which is why `127.0.0.1` (not `localhost`) is used.
 */

export type FakeModelProtocol = "anthropic" | "google";

/** One tool call the fake model asks for. `input` is what the provider sends as the arguments. */
export interface FakeToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/** One scripted model response: optional text, then optional tool calls (stop reason follows). */
export interface FakeTurn {
  readonly text?: string;
  readonly toolCalls?: readonly FakeToolCall[];
}

export interface CapturedModelRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: http.IncomingHttpHeaders;
  /** Parsed JSON body, or `{ __parseError }` with the first 500 chars when it was not JSON. */
  readonly body: unknown;
}

/** A static turn, or one computed from the generation request it answers. */
export type ScriptedTurn = FakeTurn | ((request: CapturedModelRequest) => FakeTurn);

export interface FakeModelServer {
  readonly protocol: FakeModelProtocol;
  /** Base URL to store as the BYOK `baseUrl` (no trailing slash, no path). */
  readonly baseUrl: string;
  /** Appends turns to the queue. */
  enqueue(...turns: ScriptedTurn[]): void;
  /** Turns not consumed yet. */
  remainingTurns(): number;
  /** Generation requests only (the ones that consumed, or tried to consume, a turn). */
  generationRequests(): readonly CapturedModelRequest[];
  /** Every request, including model discovery and unknown paths. */
  allRequests(): readonly CapturedModelRequest[];
  close(): Promise<void>;
}

export interface StartFakeModelServerOptions {
  /** Turns queued before the server starts. */
  readonly turns?: readonly ScriptedTurn[];
}

const QUEUE_EMPTY_MESSAGE = "fake model server: no scripted turn left for this request";

function parseBody(raw: string): unknown {
  if (raw.length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: raw.slice(0, 500) };
  }
}

function isGenerationRequest(protocol: FakeModelProtocol, method: string, url: string): boolean {
  if (method !== "POST") return false;
  return protocol === "anthropic" ? new URL(url, "http://x").pathname.endsWith("/v1/messages") : url.includes(":streamGenerateContent");
}

function isDiscoveryRequest(protocol: FakeModelProtocol, method: string, url: string): boolean {
  if (method !== "GET") return false;
  const pathname = new URL(url, "http://x").pathname;
  return protocol === "anthropic" ? pathname.endsWith("/v1/models") : pathname.startsWith("/v1beta/models");
}

function sseEvent(event: string | null, data: unknown): string {
  return `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Anthropic Messages streaming frames for one turn: `message_start`, one `content_block_*` triple
 * per text/tool_use block (tool input as ONE `input_json_delta`), `message_delta` carrying
 * `stop_reason` (`tool_use` when the turn calls tools, else `end_turn`), `message_stop`.
 */
export function anthropicTurnSse(turn: FakeTurn, messageId: string): string {
  const frames: string[] = [
    sseEvent("message_start", {
      type: "message_start",
      message: { id: messageId, type: "message", role: "assistant", content: [], model: "fake-model", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } },
    }),
  ];
  let index = 0;
  if (turn.text) {
    frames.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }));
    frames.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: turn.text } }));
    frames.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    index += 1;
  }
  for (const call of turn.toolCalls ?? []) {
    frames.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: call.id, name: call.name, input: {} } }));
    frames.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(call.input) } }));
    frames.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    index += 1;
  }
  const stopReason = (turn.toolCalls?.length ?? 0) > 0 ? "tool_use" : "end_turn";
  frames.push(sseEvent("message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } }));
  frames.push(sseEvent("message_stop", { type: "message_stop" }));
  return frames.join("");
}

/** One Gemini `alt=sse` record for a turn: text and `functionCall` parts, `finishReason: STOP`. */
export function googleTurnSse(turn: FakeTurn): string {
  const parts: unknown[] = [];
  if (turn.text) parts.push({ text: turn.text });
  for (const call of turn.toolCalls ?? []) parts.push({ functionCall: { name: call.name, args: call.input, id: call.id } });
  return sseEvent(null, {
    candidates: [{ content: { parts, role: "model" }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  });
}

function vendorError(protocol: FakeModelProtocol, message: string): string {
  return JSON.stringify(protocol === "anthropic" ? { type: "error", error: { type: "api_error", message } } : { error: { code: 500, message, status: "INTERNAL" } });
}

/** Starts the server on an ephemeral loopback port. Always `close()` it in a `finally`. */
export async function startFakeModelServer(protocol: FakeModelProtocol, options: StartFakeModelServerOptions = {}): Promise<FakeModelServer> {
  const queue: ScriptedTurn[] = [...(options.turns ?? [])];
  const all: CapturedModelRequest[] = [];
  const generation: CapturedModelRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const method = req.method ?? "GET";
      const url = req.url ?? "";
      const captured: CapturedModelRequest = { method, url, headers: req.headers, body: parseBody(Buffer.concat(chunks).toString("utf8")) };
      all.push(captured);

      if (isDiscoveryRequest(protocol, method, url)) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(protocol === "anthropic" ? { data: [], has_more: false } : { models: [] }));
        return;
      }
      if (!isGenerationRequest(protocol, method, url)) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(vendorError(protocol, `fake model server: unhandled ${method} ${url}`));
        return;
      }

      generation.push(captured);
      const next = queue.shift();
      if (!next) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(vendorError(protocol, QUEUE_EMPTY_MESSAGE));
        return;
      }
      const turn = typeof next === "function" ? next(captured) : next;
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.end(protocol === "anthropic" ? anthropicTurnSse(turn, `msg_fake_${generation.length}`) : googleTurnSse(turn));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    protocol,
    baseUrl: `http://127.0.0.1:${port}`,
    enqueue: (...turns) => {
      queue.push(...turns);
    },
    remainingTurns: () => queue.length,
    generationRequests: () => generation,
    allRequests: () => all,
    // `closeAllConnections()` BEFORE `close()` is load-bearing (see the Gemini deputy's note): the
    // server-side `fetch` (undici) keeps keep-alive sockets open, so `close()` alone never resolves.
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A tool result as the server sent it back to the fake model, protocol-neutral. */
export interface CapturedToolResult {
  readonly toolUseId: string;
  readonly content: string;
  readonly isError: boolean;
}

/**
 * The tool results carried by a generation request: Anthropic `tool_result` blocks in user
 * messages, or Gemini `functionResponse` parts (Gemini has no error flag; `isError` reads the
 * `response.isError` field Tovu's adapter writes).
 */
export function toolResultsIn(protocol: FakeModelProtocol, request: CapturedModelRequest): CapturedToolResult[] {
  const body = (request.body ?? {}) as Record<string, unknown>;
  if (protocol === "anthropic") {
    const messages = Array.isArray(body.messages) ? (body.messages as Array<{ role?: string; content?: unknown }>) : [];
    return messages.flatMap((message) =>
      Array.isArray(message.content)
        ? (message.content as Array<Record<string, unknown>>)
            .filter((block) => block.type === "tool_result")
            .map((block) => ({ toolUseId: String(block.tool_use_id ?? ""), content: flattenContent(block.content), isError: block.is_error === true }))
        : [],
    );
  }
  const contents = Array.isArray(body.contents) ? (body.contents as Array<{ parts?: Array<Record<string, unknown>> }>) : [];
  return contents
    .flatMap((content) => content.parts ?? [])
    .flatMap((part) => (part.functionResponse ? [part.functionResponse as { id?: string; response?: { content?: unknown; isError?: unknown } }] : []))
    .map((response) => ({ toolUseId: String(response.id ?? ""), content: flattenContent(response.response?.content), isError: response.response?.isError === true }));
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : JSON.stringify(part))).join("");
  }
  return content === undefined ? "" : JSON.stringify(content);
}
