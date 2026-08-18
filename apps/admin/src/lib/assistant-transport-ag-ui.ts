/**
 * @module assistant-transport-ag-ui
 *
 * ADR-059 — the AG-UI canary transport path `assistant-transport.ts` delegates to when its
 * Tovu-local `getAgUiEnabled` toggle is on. A third path alongside that file's existing Local CLI
 * and BYOK branches, shaped like the BYOK path (one held-open POST, no separate `EventSource`/
 * reattach/cancel-by-runId — see `assistant-transport.ts`'s own module doc for why BYOK already
 * established that a `ChatTransport` implementation doesn't have to support reattach), but talking
 * to a genuinely different server surface: `src/server/modules/assistant-ag-ui.ts`'s
 * `AG_UI_RUN_PATH`, which streams real AG-UI wire events (not Tovu's own `payload.type` vocabulary)
 * — a translation layer in front of the SAME daemon-backed run lifecycle the Local CLI path uses.
 *
 * `AgUiEvent` below mirrors (does not import) `assistant-ag-ui.ts`'s own type of the same name —
 * `apps/admin/` and `src/server/` are separate deployable apps, so there is no shared module either
 * side can import the other's local types from. Keep the two in sync if the wire vocabulary changes
 * (each side also has its own regression suite over what is meant to be the same shape).
 *
 * Hand-rolled per ADR-059 Decision 3: no `@ag-ui/core`/`@ag-ui/client`. `readSseFrames`/`parseFrame`
 * (`./sse-frames`) are reused rather than duplicated a third time.
 */
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers, StartRunInput } from "@jini-ai/chat/react";

import { readSseFrames } from "./sse-frames";

/** Must match `src/server/modules/assistant-ag-ui.ts`'s `AG_UI_RUN_PATH` exactly. */
export const AG_UI_RUN_PATH = "/api/admin/v1/assistant/ag-ui-run";

/** Distinguishes an AG-UI-run id (client-minted, no server-side run record reachable through THIS
 *  path — see module doc) from a daemon-run id or a `byok:`-prefixed id wherever a bare `runId`
 *  string is all a `ChatTransport` method receives. Mirrors `BYOK_RUN_ID_PREFIX`'s exact role. */
const AG_UI_RUN_ID_PREFIX = "agui:";

export function isAgUiRunId(runId: string): boolean {
  return runId.startsWith(AG_UI_RUN_ID_PREFIX);
}

/** `localStorage` key for the AG-UI canary toggle — a dev-facing flip, not an admin-settings row:
 *  this is experimental scaffolding (ADR-059), not a product setting, so it lives per-browser-tab
 *  rather than in `core.execution.*`'s settings ledger the "Execution mode" tab reads/writes. */
const AG_UI_TOGGLE_STORAGE_KEY = "tovu:assistant-ag-ui";

/**
 * Reads the AG-UI canary toggle fresh, for `AssistantDock.tsx`'s `getAgUiEnabled` callback (see
 * `CreateTovuAssistantTransportOptions.getAgUiEnabled`'s own doc for why this must be read live,
 * not captured once). `localStorage` over a build-time env var so it can be flipped per-tab from
 * devtools without a rebuild — flip it on with
 * `localStorage.setItem('tovu:assistant-ag-ui', '1')`.
 */
export function isAgUiTransportEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(AG_UI_TOGGLE_STORAGE_KEY) === "1";
}

/** Same fallback as `mintByokRunId` (`assistant-transport.ts`) for a browser without
 *  `crypto.randomUUID`. Kept as its own copy rather than imported, to avoid the same import-cycle
 *  concern `sse-frames.ts`'s extraction was made to avoid (`assistant-transport.ts` imports FROM
 *  this module). */
function mintAgUiId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** In-flight AG-UI turns' abort controllers, keyed by the client-minted runId — the ONLY way
 *  `stopAgUiRun` can cancel a turn: like BYOK, there is no server-side run record on THIS path to
 *  `POST .../cancel` against (the real daemon run underneath is a Tovu-server-side implementation
 *  detail this transport never exposes an id for). */
const agUiAbortControllers = new Map<string, AbortController>();

// ---------------------------------------------------------------------------------------------
// AG-UI event vocabulary (mirrors `assistant-ag-ui.ts`'s server-side type — see module doc)
// ---------------------------------------------------------------------------------------------

export type AgUiEvent =
  | { type: "RUN_STARTED"; threadId: string; runId: string }
  | { type: "RUN_FINISHED"; threadId: string; runId: string; result?: unknown }
  | { type: "RUN_ERROR"; message: string; code?: string }
  | { type: "TEXT_MESSAGE_START"; messageId: string; role: "assistant" }
  | { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
  | { type: "TEXT_MESSAGE_END"; messageId: string }
  | { type: "REASONING_START" }
  | { type: "REASONING_MESSAGE_START"; messageId: string }
  | { type: "REASONING_MESSAGE_CONTENT"; messageId: string; delta: string }
  | { type: "REASONING_MESSAGE_END"; messageId: string }
  | { type: "REASONING_END" }
  | { type: "TOOL_CALL_START"; toolCallId: string; toolCallName: string; parentMessageId?: string }
  | { type: "TOOL_CALL_ARGS"; toolCallId: string; delta: string }
  | { type: "TOOL_CALL_END"; toolCallId: string }
  | { type: "TOOL_CALL_RESULT"; messageId: string; toolCallId: string; content: string; role?: "tool" }
  | { type: "RAW"; event: unknown }
  | { type: "CUSTOM"; name: string; value: unknown };

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
}

/**
 * Accumulates `TOOL_CALL_ARGS` deltas by `toolCallId` between a call's `TOOL_CALL_START` and
 * `TOOL_CALL_END` — the inverse of `assistant-ag-ui.ts`'s server-side translator, which emits all
 * three tool-call events back-to-back for one Tovu `tool_use` event today, but this side is written
 * to accumulate real streamed deltas too (a future daemon driver that streams `tool_input_delta`
 * incrementally needs no transport-layer change to render correctly). One instance per run, NOT a
 * module-level singleton — the same reasoning `assistant-ag-ui.ts`'s `AgUiTranslationState` gives.
 */
export interface AgUiToAgentTranslationState {
  toolCalls: Map<string, { name: string; argsJson: string }>;
}

export function createAgUiToAgentTranslationState(): AgUiToAgentTranslationState {
  return { toolCalls: new Map() };
}

/** The `TOOL_CALL_ARGS` case of {@link translateAgUiEventToAgentEvent} — accumulates one delta onto
 *  the in-flight call's buffer, a silent no-op for an id with no matching `TOOL_CALL_START`. Split
 *  out so this `if` is scored in its own complexity budget rather than the switch's. */
function accumulateToolCallArgs(toolCallId: string, delta: string, state: AgUiToAgentTranslationState): void {
  const call = state.toolCalls.get(toolCallId);
  if (call) call.argsJson += delta;
}

/** The `TOOL_CALL_END` case of {@link translateAgUiEventToAgentEvent} — parses the accumulated
 *  args buffer (already removed from `state` by the caller) into one `tool_use` event, or `[]` for
 *  an id with no matching `TOOL_CALL_START`. */
function finalizeToolCallAgentEvent(toolCallId: string, call: { name: string; argsJson: string } | undefined): AgentEvent[] {
  if (!call) return [];
  let input: unknown = {};
  try {
    input = call.argsJson.length > 0 ? JSON.parse(call.argsJson) : {};
  } catch {
    // A malformed/partial args buffer must not throw and drop the whole tool call — the raw
    // string is still more useful to a human than nothing.
    input = call.argsJson;
  }
  return [{ kind: "tool_use", id: toolCallId, name: call.name, input }];
}

/** The `CUSTOM` case of {@link translateAgUiEventToAgentEvent}. */
function translateAgUiCustomEvent(event: Extract<AgUiEvent, { type: "CUSTOM" }>): AgentEvent[] {
  // `tovu.usage`/`tovu.status`: the server's own translator put the ORIGINAL `AgentEvent`
  // straight into `.value` (see `assistant-ag-ui.ts`'s `translateAgentEventToAgUi`), so this is
  // an exact round trip, not a re-derivation.
  if (event.name === "tovu.usage" || event.name === "tovu.status") return [event.value as AgentEvent];
  if (event.name.startsWith("tovu.ext.")) return [{ kind: "ext", name: event.name.slice("tovu.ext.".length), data: event.value }];
  return [{ kind: "ext", name: event.name, data: event.value }];
}

/**
 * Translates one AG-UI event into zero or more chat-core `AgentEvent`s, threading `state` across
 * calls within a single run for tool-call argument accumulation.
 *
 * `TEXT_MESSAGE_START`/`END` and the `REASONING_*` boundary markers translate to nothing: chat-core
 * groups renderable output by a change in `AgentEvent.kind` alone (no message-boundary concept),
 * the same asymmetry `translateRunAgentPayload` already has reducing the OTHER leg of this round
 * trip (Tovu wire -> `AgentEvent`) — this function is that reduction's mirror image. The two cases
 * with real internal branching (`TOOL_CALL_END`, `CUSTOM`) and the one with a guard (`TOOL_CALL_ARGS`)
 * are pulled into their own named functions above so this switch's own cost is just its case count.
 */
export function translateAgUiEventToAgentEvent(event: AgUiEvent, state: AgUiToAgentTranslationState): AgentEvent[] {
  switch (event.type) {
    case "TEXT_MESSAGE_CONTENT":
      return [{ kind: "text", text: event.delta }];

    case "REASONING_MESSAGE_CONTENT":
      return [{ kind: "thinking", text: event.delta }];

    case "TOOL_CALL_START":
      state.toolCalls.set(event.toolCallId, { name: event.toolCallName, argsJson: "" });
      return [];

    case "TOOL_CALL_ARGS":
      accumulateToolCallArgs(event.toolCallId, event.delta, state);
      return [];

    case "TOOL_CALL_END": {
      const call = state.toolCalls.get(event.toolCallId);
      state.toolCalls.delete(event.toolCallId);
      return finalizeToolCallAgentEvent(event.toolCallId, call);
    }

    case "TOOL_CALL_RESULT":
      // AG-UI's `ToolCallResultEvent` carries no `isError` field (verified against the real schema)
      // — a genuine protocol-level fidelity gap, not a translator bug: Tovu's `isError` flag cannot
      // survive the round trip through AG-UI's wire shape, so it always reconstructs as `false`.
      return [{ kind: "tool_result", toolUseId: event.toolCallId, content: event.content, isError: false }];

    case "RAW":
      return [{ kind: "raw", line: asString(event.event) }];

    case "CUSTOM":
      return translateAgUiCustomEvent(event);

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------------------------

/**
 * Dispatches one parsed AG-UI SSE frame — `RUN_ERROR`/`RUN_FINISHED` end the turn via `onError`/
 * `finish`; every other event type is reduced through {@link translateAgUiEventToAgentEvent} and
 * forwarded to both `collected` (the final transcript `onDone` receives) and `handlers.onEvent`
 * (live rendering), mirroring `handleByokFrame`'s exact shape.
 */
export function handleAgUiFrame(
  frame: { event: string; data: string },
  ctx: { collected: AgentEvent[]; handlers: RunHandlers; state: AgUiToAgentTranslationState; finish: () => void },
): void {
  const event = JSON.parse(frame.data) as AgUiEvent;
  if (event.type === "RUN_ERROR") {
    ctx.handlers.onError(new Error(event.message || "AG-UI run failed"));
    return;
  }
  if (event.type === "RUN_FINISHED") {
    ctx.finish();
    return;
  }
  for (const translated of translateAgUiEventToAgentEvent(event, ctx.state)) {
    ctx.collected.push(translated);
    ctx.handlers.onEvent(translated);
  }
}

/**
 * Drains an AG-UI turn's SSE body to completion, dispatching each frame via {@link handleAgUiFrame}
 * — mirrors `consumeByokStream`'s exact structure and abort-vs-real-error distinction (see that
 * function's own doc for why an aborted controller's stream error must not surface as `onError`).
 */
export async function consumeAgUiStream(
  body: ReadableStream<Uint8Array>,
  ctx: {
    runId: string;
    collected: AgentEvent[];
    handlers: RunHandlers;
    finish: () => void;
    controller: AbortController;
    state: AgUiToAgentTranslationState;
  },
): Promise<void> {
  try {
    for await (const frame of readSseFrames(body)) {
      handleAgUiFrame(frame, { collected: ctx.collected, handlers: ctx.handlers, finish: ctx.finish, state: ctx.state });
    }
    ctx.finish();
  } catch (error) {
    agUiAbortControllers.delete(ctx.runId);
    if (ctx.controller.signal.aborted) {
      ctx.finish();
      return;
    }
    ctx.handlers.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * The AG-UI canary run path (ADR-059) — one held-open `POST` to `assistant-ag-ui.ts`, no separate
 * `EventSource`/reattach, same shape as `startByokRun`.
 */
export async function startAgUiRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
  const runId = `${AG_UI_RUN_ID_PREFIX}${mintAgUiId()}`;
  // The conversation-level id, stable across turns — a genuine AG-UI `threadId`, distinct from the
  // per-turn `runId` minted fresh above. Falls back to minting one only for a conversation that has
  // none yet (e.g. the very first turn).
  const threadId = (input.conversationId as string | null | undefined) ?? mintAgUiId();

  const controller = new AbortController();
  agUiAbortControllers.set(runId, controller);
  input.signal?.addEventListener("abort", () => controller.abort());

  const messages = (input.history as ChatMessage[])
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));

  let response: Response;
  try {
    response = await fetch(AG_UI_RUN_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ threadId, runId, messages, agentId: input.agentId }),
      signal: controller.signal,
    });
  } catch (error) {
    agUiAbortControllers.delete(runId);
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (!response.ok || !response.body) {
    agUiAbortControllers.delete(runId);
    const detail = await response.text().catch(() => "");
    throw new Error(`AG-UI run failed to start (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }

  const collected: AgentEvent[] = [];
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    agUiAbortControllers.delete(runId);
    handlers.onDone(collected);
  };

  // Deliberately not awaited — matches `startByokRun`'s contract: `startRun` resolves `{runId}`
  // once the turn has STARTED, not once it has finished.
  void consumeAgUiStream(response.body, { runId, collected, handlers, finish, controller, state: createAgUiToAgentTranslationState() });

  return { runId };
}

/** No server-side run record exists on this path (module doc) — a reload has already discarded the
 *  original `fetch()`'s response body, so there is nothing to resume. Same honest "already over"
 *  answer `assistant-transport.ts`'s BYOK branch gives for the identical situation. */
export async function reattachAgUiRun(handlers: RunHandlers): Promise<void> {
  handlers.onDone([]);
}

/** Same reasoning as {@link reattachAgUiRun} — no server-side run record to fetch status for. */
export async function fetchAgUiRunStatus(): Promise<null> {
  return null;
}

/** An AG-UI run's only cancellation handle is the abort controller {@link startAgUiRun} registered
 *  for this exact id — same shape as BYOK's `stopRun` branch. */
export async function stopAgUiRun(runId: string): Promise<void> {
  agUiAbortControllers.get(runId)?.abort();
}
