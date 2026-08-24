/**
 * SAMPLE / PROTOTYPE — not wired into the running app, not built or type-checked against a
 * real `node_modules` (no `npm install` was run for this exercise). Written to accompany
 * `spec.md` in this same folder; read that file first for the "why" behind every choice
 * below.
 *
 * Shows what a backend AG-UI adapter for Tovu's admin assistant could look like: a function
 * that turns Tovu's own `AgentEvent` stream (the vocabulary `assistant-transport.ts`'s
 * `translateRunAgentPayload` already reduces both backend paths down to — see spec.md §3 for
 * why THAT is the integration point, not either path's raw wire format) into `@ag-ui/core`
 * event objects, plus a sketch of the Express route that would use it.
 *
 * Real-world home for the route sketch at the bottom: a sibling to
 * `src/server/modules/assistant-byok.ts`'s `handleTurn()`, reusing its credential
 * resolution, tool surface, and `runByokProviderTurn()` call — only the `onEvent` wire
 * format changes. Not duplicated as a full working route here; `handleTurn` already shows
 * every one of those pieces in the real codebase, and repeating it would just drift out of
 * sync with the real implementation over time. This file focuses on the one genuinely new
 * piece: the translator.
 *
 * Types imported from "@ag-ui/core" below are written against the field shapes documented at
 * https://docs.ag-ui.com/sdk/js/core/events (fetched 2026-08-18) — verify against the
 * installed package's real `.d.ts` before this becomes real code; a protocol this young can
 * still shift field names between versions.
 */

// ---------------------------------------------------------------------------------------
// 1. Tovu's own event shape — mirrored here, not imported, so this sample file stands alone
//    without needing `@jini-ai/chat/core` to resolve in whatever throwaway environment
//    reviews it. The REAL type lives in `apps/admin/src/lib/assistant-transport.ts` (search
//    that file for `AgentEvent` — it's re-exported from `@jini-ai/chat/core`). Any real
//    implementation of this adapter imports the real type instead of this copy.
// ---------------------------------------------------------------------------------------

type TovuAgentEvent =
  | { kind: "status"; label: string; detail?: string }
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { kind: "usage"; inputTokens?: number; outputTokens?: number; costUsd?: number; durationMs?: number }
  | { kind: "raw"; line: string }
  | { kind: "ext"; name: string; data: unknown };

// ---------------------------------------------------------------------------------------
// 2. AG-UI's event vocabulary — the subset this adapter emits. Field shapes per
//    https://docs.ag-ui.com/sdk/js/core/events. In a real build these come from
//    `import type { ... } from "@ag-ui/core"` instead of being hand-declared; kept explicit
//    here so this file is self-contained and every field is traceable to its source.
// ---------------------------------------------------------------------------------------

type AgUiEvent =
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

/**
 * Mutable per-run state the translator needs to synthesize AG-UI's START/CONTENT/END
 * message lifecycle out of Tovu's boundary-less delta stream (spec.md §3, §6 item 3).
 *
 * Tovu's `text`/`thinking` events are bare deltas — there is no "a new message started"
 * signal in `AgentEvent` itself, only a change in `.kind` between consecutive events. This
 * state object is what lets the translator notice that change and close out whichever
 * lifecycle (text or reasoning) was open before starting the other, or before the run ends.
 *
 * One instance per run, threaded through every call — NOT a module-level singleton, which
 * would corrupt concurrent runs from different admins/tabs into one shared lifecycle.
 */
export interface AgUiTranslationState {
  openTextMessageId: string | null;
  openReasoningMessageId: string | null;
  /** Monotonic counter for minting message/tool-call ids deterministically within one run,
   *  since Tovu's `text`/`thinking` events carry no id of their own to reuse. */
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
 * Closes whichever message lifecycle is open in `state`, if any — called before opening the
 * OTHER kind of message, and once more at the very end of the run (see
 * `translateAgentEventsToAgUi`'s trailing call below). Returns the closing event(s) to emit,
 * or an empty array if nothing was open.
 *
 * Split out from the main switch for the same reason `assistant-transport.ts`'s own
 * `parseUsageEvent` was pulled out of `translateRunAgentPayload` (see that function's doc):
 * isolating the one piece of this translator with real branching keeps the main switch a
 * flat, easily-scanned case list.
 */
function closeOpenMessages(state: AgUiTranslationState): AgUiEvent[] {
  const events: AgUiEvent[] = [];
  if (state.openTextMessageId) {
    events.push({ type: "TEXT_MESSAGE_END", messageId: state.openTextMessageId });
    state.openTextMessageId = null;
  }
  if (state.openReasoningMessageId) {
    events.push({ type: "REASONING_MESSAGE_END", messageId: state.openReasoningMessageId });
    events.push({ type: "REASONING_END" });
    state.openReasoningMessageId = null;
  }
  return events;
}

/**
 * Translates ONE Tovu `AgentEvent` into zero or more AG-UI events, threading `state` across
 * calls within a single run so message/reasoning boundaries come out correct.
 *
 * Deliberately mirrors `translateRunAgentPayload`'s shape (a flat switch over a closed
 * union, one case per kind) rather than a lookup table — same reasoning that function's own
 * doc gives: a switch over a real TS union gets exhaustiveness checking a
 * `Record<string, fn>` would silently lose if a new `AgentEvent.kind` were added later.
 *
 * @param event - one already-reduced Tovu event (see spec.md §3 for why this is the
 *   integration point rather than either backend's raw wire payload).
 * @param state - this run's translation state; mutated in place.
 */
export function translateAgentEventToAgUi(event: TovuAgentEvent, state: AgUiTranslationState): AgUiEvent[] {
  switch (event.kind) {
    case "text": {
      const events: AgUiEvent[] = [];
      // A text delta arriving while a REASONING message is open means the model has moved
      // from thinking to answering — close reasoning first. AG-UI's lifecycle is strict
      // (some client implementations reject a second START without an intervening END; see
      // spec.md §6 item 3's linked issue), so this order matters.
      if (state.openReasoningMessageId) events.push(...closeOpenMessages(state));
      if (!state.openTextMessageId) {
        state.openTextMessageId = mintId(state, "msg");
        events.push({ type: "TEXT_MESSAGE_START", messageId: state.openTextMessageId, role: "assistant" });
      }
      events.push({ type: "TEXT_MESSAGE_CONTENT", messageId: state.openTextMessageId, delta: event.text });
      return events;
    }

    case "thinking": {
      const events: AgUiEvent[] = [];
      if (state.openTextMessageId) events.push(...closeOpenMessages(state));
      if (!state.openReasoningMessageId) {
        state.openReasoningMessageId = mintId(state, "reasoning");
        events.push({ type: "REASONING_START" });
        events.push({ type: "REASONING_MESSAGE_START", messageId: state.openReasoningMessageId });
      }
      events.push({ type: "REASONING_MESSAGE_CONTENT", messageId: state.openReasoningMessageId, delta: event.text });
      return events;
    }

    case "tool_use": {
      // Tovu hands us one complete `tool_use` event (the daemon/provider adapter already
      // assembled the full `input` before emitting it — see `translateRunAgentPayload`'s own
      // `case "tool_use"`), not incremental argument deltas the way some providers stream
      // natively. So all three AG-UI tool-call events fire back-to-back for one Tovu event;
      // there is no intermediate ARGS delta to spread this over.
      return [
        { type: "TOOL_CALL_START", toolCallId: event.id, toolCallName: event.name },
        { type: "TOOL_CALL_ARGS", toolCallId: event.id, delta: JSON.stringify(event.input ?? {}) },
        { type: "TOOL_CALL_END", toolCallId: event.id },
      ];
    }

    case "tool_result": {
      // `messageId` here is required by AG-UI's `ToolCallResultEvent` shape but Tovu's
      // `tool_result` carries no message id of its own (only `toolUseId`) — minting one is a
      // real gap, not a considered choice. A production adapter needs to either thread the
      // originating `tool_use`'s minted id through, or confirm from `@ag-ui/core`'s real
      // types whether `messageId` can safely equal `toolCallId` here. Flagged, not resolved.
      return [
        {
          type: "TOOL_CALL_RESULT",
          messageId: mintId(state, "tool_result_msg"),
          toolCallId: event.toolUseId,
          content: event.content,
          role: "tool",
        },
      ];
    }

    case "usage":
      // See spec.md §3's mapping table: AG-UI's more "native" home for usage is
      // `RUN_FINISHED.usage`, but Tovu can emit this mid-stream, before the run's real end.
      // `CUSTOM` avoids having to buffer and re-home it — flagged as a rough edge, not fixed.
      return [{ type: "CUSTOM", name: "tovu.usage", value: event }];

    case "status":
      // NOT `STEP_STARTED`/`STEP_FINISHED` — those imply a matched pair this adapter has no
      // way to reliably close (Tovu's `status` events are fire-and-forget labels, not named
      // steps with a start AND an end). `CUSTOM` doesn't promise a lifecycle it can't keep.
      return [{ type: "CUSTOM", name: "tovu.status", value: event }];

    case "raw":
      // AG-UI's own `RAW` type is documented as exactly this escape hatch for
      // non-standardized passthrough content.
      return [{ type: "RAW", event: event.line }];

    case "ext":
      // mcp-ui / a2ui — explicitly unsolved, see spec.md §4. Routed through CUSTOM so the
      // stream doesn't silently drop the event, but NO frontend renderer for this shape is
      // designed anywhere in this sample.
      return [{ type: "CUSTOM", name: `tovu.ext.${event.name}`, value: event.data }];

    default: {
      // Exhaustiveness check: if `TovuAgentEvent` grows a new `kind`, this line fails to
      // compile instead of silently dropping the new event type on the floor.
      const neverEvent: never = event;
      throw new Error(`translateAgentEventToAgUi: unhandled AgentEvent.kind ${JSON.stringify(neverEvent)}`);
    }
  }
}

/** Convenience wrapper for the run's terminal boundary — call once after the last
 *  `translateAgentEventToAgUi` call for a run, before emitting `RUN_FINISHED`/`RUN_ERROR`,
 *  so a message/reasoning stream left open at the moment the run ends still gets its END
 *  event rather than leaving the client's lifecycle state permanently open. */
export function closeAgUiRun(state: AgUiTranslationState): AgUiEvent[] {
  return closeOpenMessages(state);
}

// ---------------------------------------------------------------------------------------
// 3. Route sketch — illustrative only, deliberately NOT a full working handler. Shows where
//    the translator above would plug into Tovu's real request lifecycle, modeled on
//    `src/server/modules/assistant-byok.ts`'s real `handleTurn()` (read that function for
//    the parts elided here with comments: credential resolution, tool surface construction,
//    history validation — none of that changes for AG-UI, only the wire format does).
// ---------------------------------------------------------------------------------------

/**
 * SSE writer using `@ag-ui/core`'s AND `@ag-ui/encoder`'s documented wire format:
 * `data: <json>\n\n`, content-type `text/event-stream`
 * (https://www.npmjs.com/package/@ag-ui/encoder). A real implementation would use
 * `@ag-ui/encoder`'s own `EventEncoder` class directly (it also negotiates a binary
 * protobuf encoding via the request's `Accept` header — not needed for a first canary slice,
 * SSE/JSON is the simpler and sufficient starting point) rather than this inlined
 * equivalent; written out here so this sample has no import that can't resolve.
 */
function writeAgUiEvent(res: { write: (chunk: string) => void }, event: AgUiEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Sketch of the canary route's turn handler — see spec.md §5, step 1. This is NOT meant to
 * compile as-is: `req`/`res` are typed loosely, and the elided pieces (credential
 * resolution, `resolvedToolSurface`, `runByokProviderTurn`) are exactly the real functions
 * already in `assistant-byok.ts` — a real implementation imports and reuses those, it does
 * not reimplement them. The only genuinely new code is the three calls into the translator
 * above, replacing that file's existing `sse(res, "agent", event)` write.
 */
async function sketchAgUiTurnHandler(
  req: { body: { messages: Array<{ role: "user" | "assistant"; content: string }> } },
  res: { write: (chunk: string) => void; end: () => void; status: (code: number) => void; set: (headers: Record<string, string>) => void },
): Promise<void> {
  const threadId = "thread_placeholder"; // real: derive from the conversation, matching `chats.activeId`
  const runId = "run_placeholder"; // real: `randomUUID()`, matching `handleTurn`'s existing `run.id`

  res.status(200);
  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" });

  writeAgUiEvent(res, { type: "RUN_STARTED", threadId, runId });

  const state = createAgUiTranslationState();

  // Real implementation: this is `runByokProviderTurn`'s existing `onEvent` callback,
  // reused unchanged except for what it does with each event — instead of
  // `sse(res, "agent", event)` (the real file's current line), it becomes:
  //
  //   onEvent: (tovuEvent) => {
  //     for (const aguiEvent of translateAgentEventToAgUi(tovuEvent, state)) {
  //       writeAgUiEvent(res, aguiEvent);
  //     }
  //   }
  //
  // Elided here because reproducing `runByokProviderTurn`'s full call (credential,
  // `resolvedToolSurface.executeMetaTool`, abort signal, max tool turns) would just be a
  // stale copy of `assistant-byok.ts`'s real `handleTurn` — read that function directly.

  for (const closingEvent of closeAgUiRun(state)) writeAgUiEvent(res, closingEvent);
  writeAgUiEvent(res, { type: "RUN_FINISHED", threadId, runId });
  res.end();
}

// Exported only so this sketch isn't flagged as dead code by a linter skimming the file —
// not meant to be imported anywhere real.
export { sketchAgUiTurnHandler };
