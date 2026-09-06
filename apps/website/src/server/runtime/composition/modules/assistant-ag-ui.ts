/**
 * @file ADR-059 — the admin assistant's AG-UI canary transport (Agent-User Interaction Protocol,
 * https://ag-ui.com). Additive only: the existing Local CLI (`assistant.ts`) and BYOK
 * (`assistant-byok.ts`) paths are untouched, and this module changes none of their behavior.
 *
 * This is a translation layer in front of the SAME daemon-backed run lifecycle `assistant.ts`
 * already proxies — NOT a second execution path (`protocol-surfaces.spec.md`'s standing rule for
 * protocol adapters). One request here: (1) starts a real daemon run via
 * `assistant-daemon-client.ts`'s `fetchAgentDaemon`, the identical `POST /api/runs` shape
 * `assistant.ts`'s `proxyRunStart` uses (same `contextRef.principalId` stamping); (2) subscribes to
 * that run's native SSE stream server-side; (3) translates each daemon wire frame into real AG-UI
 * wire events and streams those back on THIS request's own held-open response. Permission checks
 * (`requireAdminSession`) happen before any of that, at route-registration time, not inside the
 * translator as an afterthought.
 *
 * ADR-059 Decision 3 (AMENDED 2026-08-18): built on the real `@ag-ui/core` (types/schema) and
 * `@ag-ui/encoder` (`EventEncoder.encodeSSE`, the same `data: <json>\n\n` framing this route used
 * by hand before) — no `@ag-ui/client` here (that package's `HttpAgent` is a client-side run
 * driver; this file IS the server the client talks to) and no `@copilotkit/*`. Event shapes come
 * straight from `@ag-ui/core`'s own exported `AGUIEvent` union, not a hand-rolled approximation kept
 * in sync by hand.
 *
 * Translation is two composed pure steps, matching ADR-059 Decision 2's "translate `AgentEvent`,
 * not either backend's raw wire format" — one shared pivot, not two adapters that could drift:
 * {@link reduceAgentWirePayload} ports `apps/admin/src/lib/assistant-transport.ts`'s
 * `translateRunAgentPayload` reduction server-side (same vocabulary, same output — a PORT, not an
 * import, because `src/server/` cannot depend on `apps/admin/`, a separate deployable app), and
 * {@link translateAgentEventToAgUi} maps that shared `AgentEvent` shape onward into AG-UI events.
 *
 * Client-supplied run/thread ids (`ADR-059` Consequences): unlike the daemon-backed Local CLI path
 * (server-minted, reattachable), AG-UI's own `RunAgentInput` shape expects the CALLER to supply
 * `runId`/`threadId`. This route accepts them from the request body and echoes them verbatim in
 * every emitted event (spec-conformant); if the caller omits either, one is minted here as a
 * fallback so a well-formed-but-partial request still gets a coherent stream. Internally, the
 * client-supplied `runId` is unrelated to the real daemon run id — no mapping between them is kept
 * beyond this one request's lifetime, since there is no reattach story for this path yet (mirrors
 * BYOK's own disclosed "no reattach" limitation).
 *
 * Tovu's agent-selector value arrives as `body.forwardedProps.agentId`, not a top-level
 * `body.agentId` — a real `RunAgentInput` (what the client's `HttpAgent` actually sends) has no
 * top-level `agentId` field; `forwardedProps` is that schema's own documented passthrough
 * extension point. See {@link resolveForwardedAgentId}.
 */
import { randomUUID } from "node:crypto";

import type { Express, NextFunction, Request, Response } from "express";

import { EventType, type AGUIEvent } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";

import type { AgentEvent } from "@jini-ai/chat/core";

import { getAuthedPrincipal, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { cancelDaemonRunBestEffort, fetchAgentDaemon, fetchAgentDaemonEventStream } from "./assistant-daemon-client.js";
import type { ServerModuleHandle } from "./types.js";

export const AG_UI_RUN_PATH = "/api/admin/v1/assistant/ag-ui-run";

/** Bounds one AG-UI turn's history, mirroring `assistant-byok.ts`'s `MAX_HISTORY_MESSAGES` — same
 *  reasoning: each turn re-sends its whole history, so an unbounded one makes every later message
 *  in a long chat more expensive than the last. */
const MAX_HISTORY_MESSAGES = 40;

interface AgUiChatMessage {
  role: "user" | "assistant";
  content: string;
}

function isPlainMessage(value: unknown): value is { role: unknown; content: unknown } {
  return typeof value === "object" && value !== null;
}

/** Validates one raw history entry, same fail-soft posture as `resolveAgUiMessages`'s own doc:
 *  `null` for anything malformed rather than throwing, since history is passive background context,
 *  not something the caller just authored this instant. Split out of `resolveAgUiMessages` so the
 *  per-entry branching is scored in this function's own complexity budget, not the loop's. */
function parseAgUiMessage(entry: unknown): AgUiChatMessage | null {
  if (!isPlainMessage(entry)) return null;
  const role = entry.role === "user" || entry.role === "assistant" ? entry.role : null;
  const content = typeof entry.content === "string" ? entry.content : null;
  if (role === null || content === null || content.length === 0) return null;
  return { role, content };
}

/** Validates and bounds the client-supplied `messages` array — same fail-soft-on-malformed-entries
 *  posture as `assistant-byok.ts`'s `resolveMessages` (history is passive background context, not
 *  something the caller just authored this instant). */
function resolveAgUiMessages(raw: unknown): AgUiChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: AgUiChatMessage[] = [];
  for (const entry of raw) {
    const message = parseAgUiMessage(entry);
    if (message) messages.push(message);
  }
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

/**
 * Flattens an AG-UI message history into the single prompt string the daemon's `contextRef.prompt`
 * expects (`assistant-transport.ts`'s `buildLocalCliContextRef` does the equivalent client-side for
 * the Local CLI path). Deliberately simpler than that path's own `buildTranscript`: no boundary
 * escaping, truncation-per-message, or artifact summarization — this history arrives fresh on every
 * AG-UI POST from a client this project also controls, not replayed from persisted storage. A known
 * simplification for this first canary slice, not an oversight.
 */
function flattenMessagesToPrompt(messages: AgUiChatMessage[]): string {
  return messages.map((m) => `## ${m.role}\n${m.content}`).join("\n\n");
}

// ---------------------------------------------------------------------------------------------
// Wire -> AgentEvent reduction (server-side port of `translateRunAgentPayload`)
// ---------------------------------------------------------------------------------------------

interface RunAgentWirePayload {
  readonly type: string;
  readonly [key: string]: unknown;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
}

function reduceUsagePayload(payload: RunAgentWirePayload): AgentEvent {
  const usage = (payload.usage ?? {}) as Record<string, unknown>;
  return {
    kind: "usage",
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
    costUsd: typeof payload.costUsd === "number" ? payload.costUsd : undefined,
    durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
  };
}

/**
 * One entry per recognized wire `payload.type`. A dispatch table rather than the flat `switch`
 * `translateRunAgentPayload` uses client-side (see this file's own header for why this is a port,
 * not an import — keep the two in sync): `payload.type` is an untyped wire string, not a checked TS
 * union, so — unlike {@link translateAgentEventToAgUi}'s switch over `AgentEvent.kind` below — a
 * table costs no exhaustiveness guarantee a `switch`+`default` wasn't already forgoing. Chosen
 * because a flat switch's cyclomatic cost is one per `case` regardless of body size: 10 wire types
 * puts the floor at 11 before any real branching, over this repo's ≤9 gate by construction.
 */
const WIRE_PAYLOAD_REDUCERS: Record<string, (payload: RunAgentWirePayload) => AgentEvent | null> = {
  status: (payload) => ({ kind: "status", label: asString(payload.label), detail: payload.detail ? asString(payload.detail) : undefined }),
  text_delta: (payload) => ({ kind: "text", text: asString(payload.delta) }),
  thinking_delta: (payload) => ({ kind: "thinking", text: asString(payload.delta) }),
  tool_use: (payload) => ({ kind: "tool_use", id: asString(payload.id), name: asString(payload.name), input: payload.input }),
  tool_result: (payload) => ({
    kind: "tool_result",
    toolUseId: asString(payload.toolUseId),
    content: asString(payload.content),
    isError: Boolean(payload.isError),
  }),
  usage: reduceUsagePayload,
  raw: (payload) => ({ kind: "raw", line: asString(payload.line) }),
  // Inert on the AG-UI path for this slice — no renderer exists for it here (ADR-059 Decision 5).
  // Routed through `ext` -> `CUSTOM` below so the stream doesn't silently drop the event.
  "mcp-ui": (payload) => ({ kind: "ext", name: "mcp-ui", data: payload.resource }),
  // Jini's own unrelated generative-UI channel, despite the similar name to AG-UI. Same
  // inert-passthrough treatment as `mcp-ui` above, for the same reason.
  a2ui: (payload) => ({ kind: "ext", name: "a2ui", data: payload.message }),
  // No wire-side `thinking_end` counterpart exists (verified against `@jini-ai/protocol`'s source),
  // so `translateRunAgentPayload` drops this event today — mirrored here rather than "fixed", since
  // changing that reduction is out of this slice's scope.
  thinking_start: () => null,
};

/**
 * Reduces one daemon wire payload (a `RunProtocolEventWire.payload`, kind `"agent"`) into zero or
 * one `AgentEvent`s. Field-for-field parity with `translateRunAgentPayload` is load-bearing — see
 * {@link WIRE_PAYLOAD_REDUCERS}'s own doc for why this is a table, not a switch.
 */
export function reduceAgentWirePayload(payload: RunAgentWirePayload): AgentEvent | null {
  const reducer = WIRE_PAYLOAD_REDUCERS[payload.type];
  // `tool_input_delta`/`stage_start`/`stage_end`/`surface_request`/`surface_response`: no dedicated
  // `AgentEvent` variant, same as the client-side switch's `default` — routed through `ext` so a
  // future renderer can opt in without a translator change.
  return reducer ? reducer(payload) : { kind: "ext", name: payload.type, data: payload };
}

/**
 * Turns a terminal stream `reason` into the one renderable event a human needs to see, or `null`
 * when the reason speaks for itself. Mirrors `assistant-transport.ts`'s `terminalReasonNotice`
 * exactly — see that function's doc for why `max_tool_turns` specifically needs a notice.
 */
export function terminalReasonNotice(reason: string): AgentEvent | null {
  if (reason !== "max_tool_turns") return null;
  return {
    kind: "status",
    label: "Stopped early — tool-step limit reached",
    detail: "This turn used all the tool steps allowed for one message, so it may be unfinished. Ask it to continue to pick up where it left off.",
  };
}

// ---------------------------------------------------------------------------------------------
// AgentEvent -> AG-UI event translation
// ---------------------------------------------------------------------------------------------

/**
 * The subset of `@ag-ui/core`'s real `AGUIEvent` union this adapter emits, narrowed with `Extract`
 * so field shapes come straight from the package's own schema — including two shapes an earlier
 * hand-rolled draft got wrong by inference: `REASONING_START`/`REASONING_END` both require a
 * `messageId` (not bare), and `REASONING_MESSAGE_START` requires a literal `role: "reasoning"`.
 */
export type AgUiEvent = Extract<
  AGUIEvent,
  {
    type:
      | EventType.RUN_STARTED
      | EventType.RUN_FINISHED
      | EventType.RUN_ERROR
      | EventType.TEXT_MESSAGE_START
      | EventType.TEXT_MESSAGE_CONTENT
      | EventType.TEXT_MESSAGE_END
      | EventType.REASONING_START
      | EventType.REASONING_MESSAGE_START
      | EventType.REASONING_MESSAGE_CONTENT
      | EventType.REASONING_MESSAGE_END
      | EventType.REASONING_END
      | EventType.TOOL_CALL_START
      | EventType.TOOL_CALL_ARGS
      | EventType.TOOL_CALL_END
      | EventType.TOOL_CALL_RESULT
      | EventType.RAW
      | EventType.CUSTOM;
  }
>;

/**
 * Mutable per-run state the translator needs to synthesize AG-UI's START/CONTENT/END message
 * lifecycle out of Tovu's boundary-less delta stream (ADR-059 Decision 6 — a named, load-bearing
 * risk, not a detail: no wire-level signal marks a new `text`/`thinking` run beginning, only a
 * change in `AgentEvent.kind`). One instance per run, threaded through every call — NOT a
 * module-level singleton, which would corrupt concurrent runs from different admins/tabs into one
 * shared lifecycle.
 */
export interface AgUiTranslationState {
  openTextMessageId: string | null;
  openReasoningMessageId: string | null;
  /** Monotonic counter for minting message/tool-call ids deterministically within one run, since
   *  Tovu's `text`/`thinking`/`tool_result` events carry no id of their own to reuse for this. */
  nextId: number;
}

export function createAgUiTranslationState(): AgUiTranslationState {
  return { openTextMessageId: null, openReasoningMessageId: null, nextId: 0 };
}

function mintId(state: AgUiTranslationState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}_${state.nextId}`;
}

/**
 * Closes whichever message lifecycle is open in `state`, if any — called before opening the OTHER
 * kind of message, and once more at the run's end ({@link closeAgUiRun}), so a stream left open at
 * the moment the run ends still gets its END event rather than leaving a real AG-UI client's
 * lifecycle state permanently open (a documented rejection case in AG-UI's own ecosystem for a
 * double-START with no intervening END).
 */
function closeOpenMessages(state: AgUiTranslationState): AgUiEvent[] {
  const events: AgUiEvent[] = [];
  if (state.openTextMessageId) {
    events.push({ type: EventType.TEXT_MESSAGE_END, messageId: state.openTextMessageId });
    state.openTextMessageId = null;
  }
  if (state.openReasoningMessageId) {
    const messageId = state.openReasoningMessageId;
    events.push({ type: EventType.REASONING_MESSAGE_END, messageId });
    events.push({ type: EventType.REASONING_END, messageId });
    state.openReasoningMessageId = null;
  }
  return events;
}

/** The `"text"` case of {@link translateAgentEventToAgUi}, pulled out so its two lifecycle `if`s are
 *  scored in its own complexity budget rather than the switch's. */
function handleTextAgentEvent(event: Extract<AgentEvent, { kind: "text" }>, state: AgUiTranslationState): AgUiEvent[] {
  const events: AgUiEvent[] = [];
  // Text arriving while a REASONING message is open means the model moved from thinking to
  // answering — close reasoning first. AG-UI's lifecycle is strict, so this order matters.
  if (state.openReasoningMessageId) events.push(...closeOpenMessages(state));
  if (!state.openTextMessageId) {
    state.openTextMessageId = mintId(state, "msg");
    events.push({ type: EventType.TEXT_MESSAGE_START, messageId: state.openTextMessageId, role: "assistant" });
  }
  events.push({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: state.openTextMessageId, delta: event.text });
  return events;
}

/** The `"thinking"` case of {@link translateAgentEventToAgUi} — same extraction reasoning as
 *  {@link handleTextAgentEvent}. */
function handleThinkingAgentEvent(event: Extract<AgentEvent, { kind: "thinking" }>, state: AgUiTranslationState): AgUiEvent[] {
  const events: AgUiEvent[] = [];
  if (state.openTextMessageId) events.push(...closeOpenMessages(state));
  if (!state.openReasoningMessageId) {
    state.openReasoningMessageId = mintId(state, "reasoning");
    events.push({ type: EventType.REASONING_START, messageId: state.openReasoningMessageId });
    events.push({ type: EventType.REASONING_MESSAGE_START, messageId: state.openReasoningMessageId, role: "reasoning" });
  }
  events.push({ type: EventType.REASONING_MESSAGE_CONTENT, messageId: state.openReasoningMessageId, delta: event.text });
  return events;
}

/** The `"tool_use"` case of {@link translateAgentEventToAgUi} — same extraction reasoning as
 *  {@link handleTextAgentEvent}. */
function handleToolUseAgentEvent(event: Extract<AgentEvent, { kind: "tool_use" }>, state: AgUiTranslationState): AgUiEvent[] {
  const events: AgUiEvent[] = [];
  // Tovu hands over one complete `tool_use` event (input already assembled), not incremental
  // argument deltas — so all three AG-UI tool-call events fire back-to-back for one Tovu event.
  // Also closes any open text/reasoning segment first: a tool call interrupts either lifecycle.
  if (state.openTextMessageId || state.openReasoningMessageId) events.push(...closeOpenMessages(state));
  events.push({ type: EventType.TOOL_CALL_START, toolCallId: event.id, toolCallName: event.name });
  events.push({ type: EventType.TOOL_CALL_ARGS, toolCallId: event.id, delta: JSON.stringify(event.input ?? {}) });
  events.push({ type: EventType.TOOL_CALL_END, toolCallId: event.id });
  return events;
}

/**
 * Translates ONE already-reduced `AgentEvent` into zero or more AG-UI events, threading `state`
 * across calls within a single run so message/reasoning boundaries come out correct.
 *
 * A flat switch over a closed union, one case per kind, mirroring `translateRunAgentPayload`'s own
 * shape and reasoning: exhaustiveness checking a lookup table would silently lose (unlike
 * {@link reduceAgentWirePayload}'s sibling table above, `event.kind` IS a real TS union here, so
 * that tradeoff is live for this switch, not moot). The three cases with real internal branching
 * are pulled into their own named functions above so this switch's own cost is just its case count.
 *
 * @complexity O(1) per call; the `default: never` arm is a compile-time exhaustiveness guard, not a
 *   runtime branch a real caller can reach.
 */
export function translateAgentEventToAgUi(event: AgentEvent, state: AgUiTranslationState): AgUiEvent[] {
  switch (event.kind) {
    case "text":
      return handleTextAgentEvent(event, state);

    case "thinking":
      return handleThinkingAgentEvent(event, state);

    case "tool_use":
      return handleToolUseAgentEvent(event, state);

    case "tool_result":
      // `messageId` is required by AG-UI's `ToolCallResultEvent` shape but Tovu's `tool_result` has
      // no message id of its own (only `toolUseId`) — minted fresh, same disclosed gap the sample
      // prototype flagged.
      return [
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: mintId(state, "tool_result_msg"),
          toolCallId: event.toolUseId,
          content: event.content,
          role: "tool",
        },
      ];

    case "usage":
      // Usage can arrive mid-stream, before the run's real end — folding it into `RUN_FINISHED`
      // would mean buffering it and losing that mid-stream signal.
      return [{ type: EventType.CUSTOM, name: "tovu.usage", value: event }];

    case "status":
      // NOT `STEP_STARTED`/`STEP_FINISHED` — those imply a matched pair Tovu's fire-and-forget
      // status labels have no way to reliably close.
      return [{ type: EventType.CUSTOM, name: "tovu.status", value: event }];

    case "raw":
      return [{ type: EventType.RAW, event: event.line }];

    case "ext":
      // `mcp-ui`/`a2ui`/unmodeled wire types — inert side-channel only, ADR-059 Decision 5.
      return [{ type: EventType.CUSTOM, name: `tovu.ext.${event.name}`, value: event.data }];

    default: {
      const neverEvent: never = event;
      throw new Error(`translateAgentEventToAgUi: unhandled AgentEvent.kind ${JSON.stringify(neverEvent)}`);
    }
  }
}

/** Convenience wrapper for the run's terminal boundary — call once after the last
 *  `translateAgentEventToAgUi` call, before `RUN_FINISHED`/`RUN_ERROR`. */
export function closeAgUiRun(state: AgUiTranslationState): AgUiEvent[] {
  return closeOpenMessages(state);
}

// ---------------------------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------------------------

/** No `accept` param — this route always answers plain SSE JSON, never protobuf, so
 *  `acceptsProtobuf` stays `false` for the module's lifetime; sharing one instance across requests
 *  is safe because `EventEncoder` holds no per-request state beyond that fixed flag. */
const agUiEncoder = new EventEncoder();

/** AG-UI's documented wire format: `data: <json>\n\n` — no `event:` field, unlike Tovu's own
 *  internal `sse()` helper in `assistant-byok.ts`. Delegates the actual framing to
 *  `@ag-ui/encoder`'s `EventEncoder.encodeSSE` rather than hand-formatting it, so this route's wire
 *  output tracks the package's own encoding, not a manually-kept-in-sync copy of it. */
function writeAgUiEvent(res: Response, event: AgUiEvent): void {
  res.write(agUiEncoder.encodeSSE(event));
}

function beginAgUiStream(req: Request, res: Response, requestId: string): void {
  res.status(200).set({
    "content-type": agUiEncoder.getContentType(),
    "cache-control": "no-cache, no-transform",
    // Same reasoning as `site-assistant.ts`'s identical guard: HTTP/2 throws
    // `ERR_HTTP2_INVALID_CONNECTION_HEADER` on a `connection` header, and dropping it changes
    // nothing observable for an HTTP/1.1 client (keep-alive is already its default there).
    ...(req.httpVersionMajor < 2 ? { connection: "keep-alive" } : {}),
    "x-accel-buffering": "no",
    // Correlation for audit tooling (`protocol-surfaces.spec.md`'s `requestId`), carried as a
    // response header rather than folded into the wire body — AG-UI's own `runId`/`threadId`
    // already serve that spec's `jobId` role, and adding a non-spec field to every event would cost
    // wire conformance for no benefit a header doesn't already give.
    "x-tovu-request-id": requestId,
  });
  res.flushHeaders?.();
}

interface DaemonFrame {
  event: string;
  data: string;
}

/** Per-frame `event:`/`data:` parsing for the daemon's own SSE format (`id: <cursor>\nevent:
 *  <kind>\ndata: <json>\n\n`, `@jini-ai/http-kit`'s `defaultFormatEvent`) — a local port of
 *  `assistant-transport.ts`'s `parseFrame`, not an import, for the same cross-app-boundary reason
 *  {@link reduceAgentWirePayload} is a port. `id:` is intentionally ignored: this path has no
 *  reattach story to resume a cursor for. */
function parseDaemonFrame(rawFrame: string): DaemonFrame | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of rawFrame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  return dataLines.length > 0 ? { event, data: dataLines.join("\n") } : null;
}

/** Splits the daemon events stream into `{event, data}` frames — a local port of
 *  `assistant-transport.ts`'s `readSseFrames`, same reasoning as {@link parseDaemonFrame}.
 *
 * Takes an already-acquired `reader`, not the raw `body`, so the caller can hold the SAME reader
 * for both this generator and its own `res.on("close", ...)` cancel hook — a `ReadableStream` can
 * only have one active reader at a time; calling `body.getReader()` a second time here (with the
 * caller's own reader still locking the stream) throws `TypeError: ReadableStream is locked`.
 *
 * @complexity O(n) in response body bytes; O(1) additional buffering per chunk beyond the
 *   not-yet-terminated tail of the current frame. */
async function* readDaemonSseFrames(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<DaemonFrame> {
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const frame = parseDaemonFrame(rawFrame);
      if (frame) yield frame;
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/**
 * Dispatches one parsed daemon frame into zero or more AG-UI events written directly to `res`.
 *
 * @returns `true` once an `"end"` (or `"error"`) frame has closed the run — the caller stops
 *   reading further frames and ends the response.
 */
/** Every daemon SSE frame's `data:` line is the FULL `RunProtocolEventWire` envelope
 *  (`{runId, eventId, opaqueCursor, protocolVersion, ts, kind, payload, durability}`, per
 *  `@jini-ai/http-kit`), not the inner payload directly — `payload` is one field of that envelope.
 *  `assistant-transport.ts`'s own working `subscribeToRun` always unwraps `.payload` before using a
 *  frame's contents (see its `source.addEventListener("agent", ...)` and `readTerminalReason`'s
 *  `wrapped` parameter); this port must do the same or every field access below reads properties of
 *  the wrong object. */
function unwrapDaemonEnvelope(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as { payload?: unknown };
  return (parsed.payload ?? {}) as Record<string, unknown>;
}

interface AgUiFrameContext {
  res: Response;
  threadId: string;
  runId: string;
  state: AgUiTranslationState;
}

/** Writes every event in `events` to `res`, in order — the repeated `for (const e of events)
 *  writeAgUiEvent(res, e)` pattern below, named once so each frame handler is a flat sequence of
 *  statements rather than its own loop. */
function writeAllAgUiEvents(res: Response, events: AgUiEvent[]): void {
  for (const event of events) writeAgUiEvent(res, event);
}

/** The `"agent"` case of {@link handleDaemonFrame}. */
function handleAgentDaemonFrame(data: string, ctx: AgUiFrameContext): void {
  const payload = unwrapDaemonEnvelope(data) as RunAgentWirePayload;
  const reduced = reduceAgentWirePayload(payload);
  if (reduced) writeAllAgUiEvents(ctx.res, translateAgentEventToAgUi(reduced, ctx.state));
}

/** The `"stdout"` case of {@link handleDaemonFrame}. */
function handleStdoutDaemonFrame(data: string, ctx: AgUiFrameContext): void {
  const chunk = asString((unwrapDaemonEnvelope(data) as { chunk?: unknown }).chunk);
  writeAllAgUiEvents(ctx.res, translateAgentEventToAgUi({ kind: "raw", line: chunk }, ctx.state));
}

/** The `"error"` case of {@link handleDaemonFrame} — a terminal frame, so it also closes any open
 *  message/reasoning segment before emitting `RUN_ERROR` (same reasoning as
 *  {@link handleEndDaemonFrame}). */
function handleErrorDaemonFrame(data: string, ctx: AgUiFrameContext): void {
  const message = asString((unwrapDaemonEnvelope(data) as { message?: unknown }).message);
  writeAllAgUiEvents(ctx.res, closeAgUiRun(ctx.state));
  writeAgUiEvent(ctx.res, { type: EventType.RUN_ERROR, message: message || "agent run failed" });
}

/** The `"end"` case of {@link handleDaemonFrame} — a terminal frame: emits a terminal-reason notice
 *  when one applies, closes any open message/reasoning segment, then `RUN_FINISHED`. */
function handleEndDaemonFrame(data: string, ctx: AgUiFrameContext): void {
  const reason = asString((unwrapDaemonEnvelope(data || "{}") as { reason?: unknown }).reason);
  const notice = terminalReasonNotice(reason);
  if (notice) writeAllAgUiEvents(ctx.res, translateAgentEventToAgUi(notice, ctx.state));
  writeAllAgUiEvents(ctx.res, closeAgUiRun(ctx.state));
  writeAgUiEvent(ctx.res, { type: EventType.RUN_FINISHED, threadId: ctx.threadId, runId: ctx.runId, result: { reason: reason || "stop" } });
}

/**
 * Dispatches one parsed daemon frame into zero or more AG-UI events written directly to `res`. Each
 * frame kind's own logic lives in its own named function above, so this dispatcher's only cost is
 * its four `if`s — pulling the case bodies inline here was what made the original single function
 * cyclomatic 15 / cognitive 20 (every frame kind's internal loops and ifs counted against the same
 * function).
 *
 * @returns `true` once an `"end"` (or `"error"`) frame has closed the run — the caller stops
 *   reading further frames and ends the response.
 */
function handleDaemonFrame(frame: DaemonFrame, ctx: AgUiFrameContext): boolean {
  if (frame.event === "agent") {
    handleAgentDaemonFrame(frame.data, ctx);
    return false;
  }
  if (frame.event === "stdout") {
    handleStdoutDaemonFrame(frame.data, ctx);
    return false;
  }
  if (frame.event === "error") {
    handleErrorDaemonFrame(frame.data, ctx);
    return true;
  }
  if (frame.event === "end") {
    handleEndDaemonFrame(frame.data, ctx);
    return true;
  }
  return false;
}

interface AgUiRunRequest {
  threadId: string;
  runId: string;
  requestId: string;
  agentId?: string;
  messages: AgUiChatMessage[];
}

/** `value` when it's a non-empty string, else `undefined` — the shared shape behind `threadId`,
 *  `runId`, and `agentId`'s "caller-supplied or minted" resolution below. */
function resolveNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `RunAgentInput.forwardedProps` has no declared shape of its own (`z.ZodAny` in `@ag-ui/core`) —
 *  it's the schema's documented passthrough extension point, and Tovu's agent-selector value rides
 *  there as `forwardedProps.agentId` (there is no top-level `agentId` field on a real
 *  `RunAgentInput`; that's a separate, unrelated `AgentConfig`-level concept in `@ag-ui/client`). */
function resolveForwardedAgentId(forwardedProps: unknown): string | undefined {
  if (typeof forwardedProps !== "object" || forwardedProps === null) return undefined;
  return resolveNonEmptyString((forwardedProps as { agentId?: unknown }).agentId);
}

/** Validates and normalizes one AG-UI run request body, or `null` when it fails the one hard
 *  requirement: a non-empty `messages` array ending in a user turn. Split out of `handleAgUiRun` so
 *  that function's own body is just the request's control flow, not this parsing. */
function resolveAgUiRunRequest(body: {
  threadId?: unknown;
  runId?: unknown;
  messages?: unknown;
  forwardedProps?: unknown;
}): AgUiRunRequest | null {
  const messages = resolveAgUiMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") return null;
  return {
    threadId: resolveNonEmptyString(body.threadId) ?? randomUUID(),
    runId: resolveNonEmptyString(body.runId) ?? randomUUID(),
    requestId: randomUUID(),
    agentId: resolveForwardedAgentId(body.forwardedProps),
    messages,
  };
}

/** Starts the real daemon run for one AG-UI request — the identical `POST /api/runs` shape
 *  `assistant.ts`'s `proxyRunStart` uses. Split out of `handleAgUiRun` so its own two failure shapes
 *  (transport-level via `fetchAgentDaemon`, and a non-ok daemon status) don't add to that function's
 *  branch count. `res` has already had an error response written on `{ ok: false }` — the caller's
 *  contract is to return immediately without touching `res` again. */
async function startDaemonRun(
  req: Request,
  res: Response,
  run: AgUiRunRequest,
  principalId: string,
): Promise<{ ok: true; daemonRunId: string } | { ok: false }> {
  const prompt = flattenMessagesToPrompt(run.messages);
  const startUpstream = await fetchAgentDaemon(req, res, {
    path: "/api/runs",
    method: "POST",
    body: { contextRef: JSON.stringify({ prompt, principalId }), agentId: run.agentId },
  });
  if (!startUpstream) return { ok: false }; // fetchAgentDaemon already wrote a 503/502.

  if (!startUpstream.ok) {
    const detail = await startUpstream.text().catch(() => "");
    res.status(startUpstream.status).json({ error: "agent run failed to start", code: "DAEMON_START_FAILED", detail });
    return { ok: false };
  }
  const { run: daemonRun } = (await startUpstream.json()) as { run: { id: string } };
  return { ok: true, daemonRunId: daemonRun.id };
}

/** Subscribes to one daemon run's native SSE stream, returning a reader ready for
 *  {@link readDaemonSseFrames}, or `null` once an error response has already been written (same
 *  contract as {@link startDaemonRun}). Split out of `handleAgUiRun` for the same reason.
 *
 * Built on {@link fetchAgentDaemonEventStream} rather than `fetchAgentDaemon` — see that function's
 * own doc for why this specific stream needs `node:http`'s no-default-timeout transport: a parked
 * tool call can leave the daemon silent well past `fetch`'s default idle-body timeout, which is not a
 * stall on this endpoint, it's the normal shape of a human-in-the-loop wait. */
async function subscribeToDaemonEvents(req: Request, res: Response, daemonRunId: string): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
  const eventsUpstream = await fetchAgentDaemonEventStream(req, res, `/api/runs/${encodeURIComponent(daemonRunId)}/events`);
  if (!eventsUpstream) return null; // fetchAgentDaemonEventStream already wrote a 503/502.
  if (eventsUpstream.statusCode < 200 || eventsUpstream.statusCode >= 300) {
    res.status(502).json({ error: "assistant is unavailable", code: "BAD_GATEWAY" });
    return null;
  }
  return eventsUpstream.body.getReader();
}

/** Drains one AG-UI run's daemon frames to completion, writing translated events directly to
 *  `ctx.res` and ending the response either on an explicit terminal frame, on the stream simply
 *  closing (same dual-completion posture `consumeByokStream` uses for the identical case), or on a
 *  read error. Split out of `handleAgUiRun` so the try/catch and its loop don't add to that
 *  function's own branch count. */
async function drainAgUiStream(reader: ReadableStreamDefaultReader<Uint8Array>, ctx: AgUiFrameContext): Promise<void> {
  try {
    for await (const frame of readDaemonSseFrames(reader)) {
      const done = handleDaemonFrame(frame, ctx);
      if (done) {
        ctx.res.end();
        return;
      }
    }
    writeAllAgUiEvents(ctx.res, closeAgUiRun(ctx.state));
    writeAgUiEvent(ctx.res, { type: EventType.RUN_FINISHED, threadId: ctx.threadId, runId: ctx.runId, result: { reason: "stop" } });
    ctx.res.end();
  } catch (error) {
    writeAllAgUiEvents(ctx.res, closeAgUiRun(ctx.state));
    writeAgUiEvent(ctx.res, { type: EventType.RUN_ERROR, message: error instanceof Error ? error.message : String(error) });
    ctx.res.end();
  }
}

async function handleAgUiRun(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { threadId?: unknown; runId?: unknown; messages?: unknown; forwardedProps?: unknown };
  const run = resolveAgUiRunRequest(body);
  if (!run) {
    res.status(400).json({ error: "'messages' must end with a non-empty user message", code: "VALIDATION_ERROR" });
    return;
  }

  // Cancels the DAEMON run, not just this response's own SSE subscription (MEDIUM audit finding,
  // 2026-08-19 Codex sol bug/architecture audit; RE-AUDITED 2026-08-19 by both `gpt-5.6-sol` and
  // `gpt-5.6-terra`): the first fix armed `res.on("close")` only after BOTH `startDaemonRun` and
  // `subscribeToDaemonEvents` had already resolved. Two windows still leaked an orphaned daemon run:
  // (1) a client abort while either of those `await`s was still pending was missed permanently,
  // since nothing was listening for `"close"` yet; (2) a subscribe HTTP failure (the 502 branch
  // below) ends this response NORMALLY from the server's own point of view, so it looked identical
  // to a successful `drainAgUiStream` finish and never triggered a cancel either.
  //
  // The handler is registered here, before either daemon call, so no window is uncovered. It cannot
  // cancel before a daemon run actually exists, so `daemonRunId` starts `null`; if `"close"` fires
  // in that gap, `closedEarly` remembers it and the check right after `startDaemonRun` resolves
  // fires the cancel retroactively — the two can't race because JS's single-threaded execution
  // serializes "close fires first" against "the await resolves first," and either ordering leaves
  // the daemon run cancelled exactly once.
  //
  // `runFinished` (not `res.writableEnded`) is what distinguishes "the run reached its own terminal
  // state" from "this response ended early while the run is still executing" — both leave
  // `writableEnded === true`, which is exactly why the previous fix's guard missed case (2) above.
  // It is set `true` only once `drainAgUiStream` has actually driven the run to completion (terminal
  // frame, natural stream close, or a read error that already unwound the daemon side), synchronously
  // before this function returns and therefore strictly before the async `"close"` event can fire —
  // so an ordinary successful run still issues zero cancel calls, per this fix's own regression test.
  let daemonRunId: string | null = null;
  let runFinished = false;
  let closedEarly = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  res.on("close", () => {
    reader?.cancel().catch(() => undefined);
    if (runFinished) return;
    if (daemonRunId) cancelDaemonRunBestEffort(req, res, daemonRunId);
    else closedEarly = true;
  });

  // Start the real daemon run BEFORE switching this response into SSE mode — a daemon failure at
  // this point can still answer with an ordinary JSON error status, which is no longer possible
  // once headers have been flushed for the event stream below.
  const principal = getAuthedPrincipal(res);
  const started = await startDaemonRun(req, res, run, principal.id);
  if (!started.ok) return;
  daemonRunId = started.daemonRunId;
  if (closedEarly) {
    cancelDaemonRunBestEffort(req, res, daemonRunId);
    return;
  }

  const subscribedReader = await subscribeToDaemonEvents(req, res, started.daemonRunId);
  if (!subscribedReader) return;
  reader = subscribedReader;

  beginAgUiStream(req, res, run.requestId);
  writeAgUiEvent(res, { type: EventType.RUN_STARTED, threadId: run.threadId, runId: run.runId });

  const state = createAgUiTranslationState();
  await drainAgUiStream(subscribedReader, { res, threadId: run.threadId, runId: run.runId, state });
  runFinished = true;
}

export function createAssistantAgUiModule(routeDeps: RouteDeps): ServerModuleHandle {
  return {
    name: "assistant-ag-ui",
    registerRoutes: (app: Express) => {
      app.use(AG_UI_RUN_PATH, requireAdminSession(routeDeps));
      app.post(AG_UI_RUN_PATH, (req: Request, res: Response, next: NextFunction) => {
        void handleAgUiRun(req, res).catch((error: unknown) => {
          console.error("[assistant-ag-ui] unhandled error", error);
          if (res.headersSent) {
            writeAgUiEvent(res, { type: EventType.RUN_ERROR, message: "assistant failed" });
            res.end();
          } else {
            next(error);
          }
        });
      });
    },
  };
}
