/**
 * @module assistant-transport-ag-ui
 *
 * ADR-059 — the AG-UI canary transport path `assistant-transport.ts` delegates to when its
 * Tovu-local `getAgUiEnabled` toggle is on. A third path alongside that file's existing Local CLI
 * and BYOK branches, talking to a genuinely different server surface:
 * `src/server/modules/assistant-ag-ui.ts`'s `AG_UI_RUN_PATH`, which streams real AG-UI wire events
 * — a translation layer in front of the SAME daemon-backed run lifecycle the Local CLI path uses.
 *
 * ADR-059 Decision 3 (AMENDED 2026-08-18): built on the real `@ag-ui/client`'s `HttpAgent`, which
 * owns the whole HTTP request + SSE parsing + per-event zod validation lifecycle — replacing this
 * file's own hand-rolled `fetch`/SSE-frame-parsing loop entirely. `AgUiEvent` mirrors (does not
 * import) `assistant-ag-ui.ts`'s own type of the same name, both now typed against the real
 * `@ag-ui/core` `AGUIEvent` union — `apps/admin/` and `src/server/` are separate deployable apps, so
 * there is no shared module either side can import the other's local types from.
 *
 * Two real-package behaviors that are NOT visible from its type signatures alone (found by reading
 * its compiled source, not guessed):
 *
 * 1. `HttpAgent.run(input)` returns a COLD `Observable<BaseEvent>` — nothing happens until
 *    subscribed, and it never resolves to a Promise. The existing `startRun` contract is "resolve
 *    once the run has STARTED" (matching `startByokRun`'s contract), so {@link startAgUiRun} races
 *    the Observable's first `next`/`error` notification against the returned Promise rather than
 *    trying to `await` the Observable directly.
 * 2. Aborting mid-stream (after headers arrive) does NOT error the Observable — it surfaces as a
 *    synthetic `RUN_ERROR` event carrying `code: "abort"` (the package's own convention), delivered
 *    through the NORMAL event path. {@link handleAgUiEvent} checks for that code and calls
 *    `finish()` instead of `onError`, so an intentional stop never reads as a user-facing error.
 *    Aborting BEFORE headers arrive still rejects the underlying `fetch()` itself, which DOES
 *    surface as a genuine Observable `error()` — the top-level subscription in {@link startAgUiRun}
 *    checks `agent.abortController.signal.aborted` for that earlier-timing case.
 */
import { HttpAgent } from "@ag-ui/client";
import { EventType, type AGUIEvent, type Message, type RunAgentInput } from "@ag-ui/core";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers, StartRunInput } from "@jini-ai/chat/react";

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

/** In-flight AG-UI turns' driving `HttpAgent`, keyed by the client-minted runId — the ONLY way
 *  {@link stopAgUiRun} can cancel a turn: like BYOK, there is no server-side run record on THIS
 *  path to `POST .../cancel` against. Storing the agent (not a bare `AbortController`) lets
 *  `stopAgUiRun` call its own `abortRun()`, which both aborts the fetch AND (per the package's own
 *  convention) surfaces a clean `RUN_ERROR{code:"abort"}` through the normal event path rather than
 *  a raw network error. */
const agUiAgents = new Map<string, HttpAgent>();

// ---------------------------------------------------------------------------------------------
// AG-UI event vocabulary (mirrors `assistant-ag-ui.ts`'s server-side type — see module doc)
// ---------------------------------------------------------------------------------------------

/** The subset of `@ag-ui/core`'s real `AGUIEvent` union this transport receives — the exact same
 *  set `assistant-ag-ui.ts`'s server-side adapter emits (see that file's own `AgUiEvent` doc for
 *  why each event needs the fields it needs). */
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
function translateAgUiCustomEvent(event: Extract<AgUiEvent, { type: EventType.CUSTOM }>): AgentEvent[] {
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
    case EventType.TEXT_MESSAGE_CONTENT:
      return [{ kind: "text", text: event.delta }];

    case EventType.REASONING_MESSAGE_CONTENT:
      return [{ kind: "thinking", text: event.delta }];

    case EventType.TOOL_CALL_START:
      state.toolCalls.set(event.toolCallId, { name: event.toolCallName, argsJson: "" });
      return [];

    case EventType.TOOL_CALL_ARGS:
      accumulateToolCallArgs(event.toolCallId, event.delta, state);
      return [];

    case EventType.TOOL_CALL_END: {
      const call = state.toolCalls.get(event.toolCallId);
      state.toolCalls.delete(event.toolCallId);
      return finalizeToolCallAgentEvent(event.toolCallId, call);
    }

    case EventType.TOOL_CALL_RESULT:
      // AG-UI's `ToolCallResultEvent` carries no `isError` field (verified against the real schema)
      // — a genuine protocol-level fidelity gap, not a translator bug: Tovu's `isError` flag cannot
      // survive the round trip through AG-UI's wire shape, so it always reconstructs as `false`.
      return [{ kind: "tool_result", toolUseId: event.toolCallId, content: event.content, isError: false }];

    case EventType.RAW:
      return [{ kind: "raw", line: asString(event.event) }];

    case EventType.CUSTOM:
      return translateAgUiCustomEvent(event);

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------------------------

/**
 * Dispatches one already-parsed AG-UI event. Unlike the old hand-rolled `handleAgUiFrame`, this
 * never sees a raw `{event, data}` string frame — `HttpAgent` owns SSE framing and per-event zod
 * validation entirely, and hands us finished event objects. `RUN_ERROR` with `code: "abort"` is the
 * real package's own convention for a mid-stream abort (see module doc) — routed to `finish()`, not
 * `onError`. Every other event is reduced through {@link translateAgUiEventToAgentEvent} and
 * forwarded to both `collected` (the final transcript `onDone` receives) and `handlers.onEvent`
 * (live rendering).
 */
export function handleAgUiEvent(
  event: AgUiEvent,
  ctx: { collected: AgentEvent[]; handlers: RunHandlers; state: AgUiToAgentTranslationState; finish: () => void },
): void {
  if (event.type === EventType.RUN_ERROR) {
    if (event.code === "abort") {
      ctx.finish();
      return;
    }
    ctx.handlers.onError(new Error(event.message || "AG-UI run failed"));
    return;
  }
  if (event.type === EventType.RUN_FINISHED) {
    ctx.finish();
    return;
  }
  for (const translated of translateAgUiEventToAgentEvent(event, ctx.state)) {
    ctx.collected.push(translated);
    ctx.handlers.onEvent(translated);
  }
}

/** Converts one Tovu `ChatMessage` into a real AG-UI `Message` — every AG-UI message role requires
 *  an `id`, which `ChatMessage.id` already covers (a field the old hand-rolled wire body never
 *  sent). */
function toAgUiMessage(message: ChatMessage): Message {
  if (message.role === "user") return { id: message.id, role: "user", content: message.content };
  return { id: message.id, role: "assistant", content: message.content };
}

/**
 * The AG-UI canary run path (ADR-059) — drives a real `@ag-ui/client` `HttpAgent` against
 * `assistant-ag-ui.ts`'s route, same one-turn-per-call shape as `startByokRun`. `credentials:
 * "same-origin"` is explicit even though modern `fetch()` already defaults to it for same-origin
 * requests, matching this transport's other paths' explicitness about the session cookie.
 */
export async function startAgUiRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
  const runId = `${AG_UI_RUN_ID_PREFIX}${mintAgUiId()}`;
  // The conversation-level id, stable across turns — a genuine AG-UI `threadId`, distinct from the
  // per-turn `runId` minted fresh above. Falls back to minting one only for a conversation that has
  // none yet (e.g. the very first turn).
  const threadId = input.conversationId ?? mintAgUiId();

  const agent = new HttpAgent({
    url: AG_UI_RUN_PATH,
    threadId,
    fetch: (url, requestInit) => fetch(url, { ...requestInit, credentials: "same-origin" }),
  });
  agUiAgents.set(runId, agent);
  input.signal?.addEventListener("abort", () => agent.abortRun());

  const messages: Message[] = input.history.filter((message) => message.content.trim().length > 0).map(toAgUiMessage);

  const runAgentInput: RunAgentInput = {
    threadId,
    runId,
    state: null,
    messages,
    tools: [],
    context: [],
    forwardedProps: input.agentId ? { agentId: input.agentId } : {},
  };

  const collected: AgentEvent[] = [];
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    agUiAgents.delete(runId);
    handlers.onDone(collected);
  };
  const state = createAgUiToAgentTranslationState();

  // Deliberately racing the Observable's first `next`/`error` against this Promise rather than
  // awaiting it directly — `HttpAgent.run()` returns a cold Observable, never a Promise (module
  // doc). The subscription itself keeps running after this Promise settles, driving `handlers`
  // through to `finish()` in the background — matching `startByokRun`'s "resolves once STARTED, not
  // once finished" contract.
  return new Promise<{ runId: string }>((resolve, reject) => {
    let startSettled = false;
    agent.run(runAgentInput).subscribe({
      next: (event) => {
        if (!startSettled) {
          startSettled = true;
          resolve({ runId });
        }
        handleAgUiEvent(event as AgUiEvent, { collected, handlers, state, finish });
      },
      error: (error: unknown) => {
        agUiAgents.delete(runId);
        const err = error instanceof Error ? error : new Error(String(error));
        if (!startSettled) {
          startSettled = true;
          reject(err);
          return;
        }
        // Aborting BEFORE headers arrive rejects the underlying fetch() itself, surfacing here
        // rather than through `handleAgUiEvent`'s `code: "abort"` check (module doc).
        if (agent.abortController.signal.aborted) {
          finish();
          return;
        }
        // Error THEN finish: an errored Observable never calls `complete`, so without this the turn
        // is never settled and the events collected before the failure never reach `onDone`. Same
        // order as `subscribeToRun`'s `end` listener, so the run is still recorded as failed.
        handlers.onError(err);
        finish();
      },
      complete: () => {
        finish();
      },
    });
  });
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

/** An AG-UI run's only cancellation handle is the `HttpAgent` {@link startAgUiRun} registered for
 *  this exact id — same shape as BYOK's `stopRun` branch. */
export async function stopAgUiRun(runId: string): Promise<void> {
  agUiAgents.get(runId)?.abortRun();
}
