import assert from "node:assert/strict";
import test from "node:test";

import type { AgentEvent } from "@jini-ai/chat/core";
import { translateRunAgentPayload, type RunAgentPayload } from "@jini-ai/chat/core/run-events";

import { closeAgUiRun as close, createAgUiTranslationState as create, translateAgentEventToAgUi as translate, type AgUiTranslationState } from "@jini-ai/chat/core/ag-ui";

import { AG_UI_TRANSLATION, terminalReasonNotice } from "../runtime/composition/modules/assistant-ag-ui.js";

/** The route's projection calls, with its own ids and wire names. */
const createAgUiTranslationState = () => create(AG_UI_TRANSLATION);
const translateAgentEventToAgUi = (event: AgentEvent, state: AgUiTranslationState) => translate({ event, state });
const closeAgUiRun = (state: AgUiTranslationState) => close({ state });

/**
 * @file Pure-function coverage for `assistant-ag-ui.ts`'s two translation steps — no daemon, no
 * Express, no network. Jini's `translateRunAgentPayload` (daemon wire -> `AgentEvent`, the one
 * reducer this route calls) and `translateAgentEventToAgUi` (`AgentEvent` -> real AG-UI events)
 * are each independently testable this way, matching the existing precedent
 * `apps/admin/.../assistant-transport.translate.unit.test.ts` sets for the client-side half.
 *
 * ADR-059 Decision 6 names one case as a required regression, not optional: an interruption
 * sequence (text -> tool_use -> text again) must close and reopen `TEXT_MESSAGE_START`/`END`
 * correctly, or a real AG-UI client can reject a double-START with no intervening END. See the
 * "interruption sequences" describe block below.
 */

/** The route's reduction step, as it calls it. */
function reduce(payload: RunAgentPayload): AgentEvent | null {
  return translateRunAgentPayload({ payload });
}

test("translateRunAgentPayload — status/text_delta/thinking_delta/tool_use/tool_result map field-for-field", () => {
  assert.deepEqual(reduce({ type: "status", label: "Thinking", detail: "step 2" }), {
    kind: "status",
    label: "Thinking",
    detail: "step 2",
  });
  assert.deepEqual(reduce({ type: "text_delta", delta: "hi" }), { kind: "text", text: "hi" });
  assert.deepEqual(reduce({ type: "thinking_delta", delta: "hmm" }), { kind: "thinking", text: "hmm" });
  assert.deepEqual(reduce({ type: "tool_use", id: "t1", name: "search", input: { q: "x" } }), {
    kind: "tool_use",
    id: "t1",
    name: "search",
    input: { q: "x" },
  });
  assert.deepEqual(reduce({ type: "tool_result", toolUseId: "t1", content: "ok", isError: false }), {
    kind: "tool_result",
    toolUseId: "t1",
    content: "ok",
    isError: false,
  });
  assert.deepEqual(reduce({ type: "raw", line: "stdout chunk" }), { kind: "raw", line: "stdout chunk" });
});

test("translateRunAgentPayload — usage pulls only well-typed numeric fields", () => {
  assert.deepEqual(reduce({ type: "usage", usage: { input_tokens: 10, output_tokens: "bad" }, costUsd: 0.01 }), {
    kind: "usage",
    inputTokens: 10,
    costUsd: 0.01,
  });
  // The opposite combination: input/output well-typed this time, cost/duration the wrong type —
  // each of the four fields is independently typeof-checked, so this exercises the other half of
  // each field's true/false pair.
  assert.deepEqual(reduce({ type: "usage", usage: { input_tokens: "bad", output_tokens: 20 }, costUsd: "bad", durationMs: 500 }), {
    kind: "usage",
    outputTokens: 20,
    durationMs: 500,
  });
});

test("translateRunAgentPayload — cumulative usage and session identity survive AG-UI translation", () => {
  const usage = reduce({ type: "usage", costUsd: null, cumulativeCostUsd: 25.6, costSessionId: "claude-session-a" });
  assert.deepEqual(usage, { kind: "usage", cumulativeCostUsd: 25.6, costSessionId: "claude-session-a" });
  assert.deepEqual(translateAgentEventToAgUi(usage!, createAgUiTranslationState()),
    [{ type: "CUSTOM", name: "tovu.usage", value: usage }]);
  assert.deepEqual(reduce({ type: "usage", cumulativeCostUsd: "bad", costSessionId: 17 }), { kind: "usage" });
  assert.deepEqual(reduce({ type: "usage", cumulativeCostUsd: 0, costSessionId: "zero-session" }),
    { kind: "usage", cumulativeCostUsd: 0, costSessionId: "zero-session" });
});

test("translateRunAgentPayload — status with no detail field omits it, rather than stringifying undefined", () => {
  assert.deepEqual(reduce({ type: "status", label: "Thinking" }), { kind: "status", label: "Thinking" });
});

test("translateRunAgentPayload — non-string label/delta fields are JSON-stringified by asString, not coerced to a bare string", () => {
  assert.deepEqual(reduce({ type: "status", label: { code: 1 } }), {
    kind: "status",
    label: '{"code":1}',
  });
});

test("translateRunAgentPayload — thinking_start drops (no wire-side thinking_end exists to pair it with)", () => {
  assert.equal(reduce({ type: "thinking_start" }), null);
});

test("translateRunAgentPayload — mcp-ui/a2ui unwrap to their inner payload under 'ext'", () => {
  assert.deepEqual(reduce({ type: "mcp-ui", toolUseId: "t1", resource: { uri: "ui://x" } }), {
    kind: "ext",
    name: "mcp-ui",
    data: { uri: "ui://x" },
  });
  assert.deepEqual(reduce({ type: "a2ui", message: { channel: "a2ui" } }), {
    kind: "ext",
    name: "a2ui",
    data: { channel: "a2ui" },
  });
});

test("translateRunAgentPayload — an unrecognized type (e.g. stage_start) falls through to 'ext' with the whole payload", () => {
  const payload = { type: "stage_start", stage: "plan" };
  assert.deepEqual(reduce(payload), { kind: "ext", name: "stage_start", data: payload });
});

test("translateRunAgentPayload — partial tool input is dropped: the finished tool_use carries the same input whole", () => {
  assert.equal(reduce({ type: "tool_input_delta", id: "t1", name: "search", delta: "{\"q" }), null);
});

test("terminalReasonNotice — only max_tool_turns produces a notice", () => {
  assert.equal(terminalReasonNotice({ reason: "stop" }), null);
  assert.equal(terminalReasonNotice({ reason: "end_turn" }), null);
  const notice = terminalReasonNotice({ reason: "max_tool_turns" });
  assert.equal(notice?.kind, "status");
  assert.match((notice as { detail?: string }).detail ?? "", /continue/i);
});

test("translateAgentEventToAgUi — a bare text run opens once and emits one CONTENT per delta", () => {
  const state = createAgUiTranslationState();
  const first = translateAgentEventToAgUi({ kind: "text", text: "Hel" }, state);
  const second = translateAgentEventToAgUi({ kind: "text", text: "lo" }, state);

  assert.equal(first[0]?.type, "TEXT_MESSAGE_START");
  assert.equal(first[1]?.type, "TEXT_MESSAGE_CONTENT");
  assert.equal((first[1] as { delta: string }).delta, "Hel");
  // No new START on the second delta — same open message.
  assert.deepEqual(
    second.map((e) => e.type),
    ["TEXT_MESSAGE_CONTENT"],
  );
  assert.equal((second[0] as { messageId: string }).messageId, (first[0] as { messageId: string }).messageId);
});

test("translateAgentEventToAgUi — a thinking run opens REASONING_START once, alongside REASONING_MESSAGE_START", () => {
  const state = createAgUiTranslationState();
  const events = translateAgentEventToAgUi({ kind: "thinking", text: "considering..." }, state);

  assert.deepEqual(
    events.map((e) => e.type),
    ["REASONING_START", "REASONING_MESSAGE_START", "REASONING_MESSAGE_CONTENT"],
  );
  const messageId = state.openReasoningMessageId;
  assert.deepEqual(events, [
    { type: "REASONING_START", messageId },
    { type: "REASONING_MESSAGE_START", messageId, role: "reasoning" },
    { type: "REASONING_MESSAGE_CONTENT", messageId, delta: "considering..." },
  ]);
  assert.deepEqual(translateAgentEventToAgUi({ kind: "thinking", text: "one more thought" }, state), [
    { type: "REASONING_MESSAGE_CONTENT", messageId, delta: "one more thought" },
  ]);
});

test("translateAgentEventToAgUi — tool_use fires START+ARGS+END back to back, args JSON-stringified", () => {
  const state = createAgUiTranslationState();
  const events = translateAgentEventToAgUi({ kind: "tool_use", id: "call-1", name: "search", input: { q: "posts" } }, state);

  assert.deepEqual(events.map((e) => e.type), ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END"]);
  assert.equal((events[1] as { delta: string }).delta, JSON.stringify({ q: "posts" }));
  assert.deepEqual(events, [
    { type: "TOOL_CALL_START", toolCallId: "call-1", toolCallName: "search" },
    { type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: '{"q":"posts"}' },
    { type: "TOOL_CALL_END", toolCallId: "call-1" },
  ]);
});

test("translateAgentEventToAgUi — tool_result maps toolUseId to toolCallId and mints a messageId", () => {
  const state = createAgUiTranslationState();
  const [event] = translateAgentEventToAgUi({ kind: "tool_result", toolUseId: "call-1", content: "3 posts found", isError: false }, state);

  assert.equal(event?.type, "TOOL_CALL_RESULT");
  assert.equal((event as { toolCallId: string }).toolCallId, "call-1");
  assert.equal((event as { content: string }).content, "3 posts found");
  assert.ok((event as { messageId: string }).messageId.length > 0);
});

test("translateAgentEventToAgUi — usage/status/raw/ext map to their documented AG-UI shapes", () => {
  const state = createAgUiTranslationState();
  const usageEvent: AgentEvent = { kind: "usage", inputTokens: 10, outputTokens: 20 };
  assert.deepEqual(translateAgentEventToAgUi(usageEvent, state), [{ type: "CUSTOM", name: "tovu.usage", value: usageEvent }]);

  const statusEvent: AgentEvent = { kind: "status", label: "Thinking" };
  assert.deepEqual(translateAgentEventToAgUi(statusEvent, state), [{ type: "CUSTOM", name: "tovu.status", value: statusEvent }]);

  assert.deepEqual(translateAgentEventToAgUi({ kind: "raw", line: "stdout chunk" }, state), [{ type: "RAW", event: "stdout chunk" }]);

  assert.deepEqual(translateAgentEventToAgUi({ kind: "ext", name: "mcp-ui", data: { uri: "x" } }, state), [
    { type: "CUSTOM", name: "tovu.ext.mcp-ui", value: { uri: "x" } },
  ]);
});

// --- ADR-059 Decision 6: the named, load-bearing interruption-sequence regression --------------

test("interruption sequence: text -> tool_use -> text again closes and reopens TEXT_MESSAGE with a NEW messageId", () => {
  const state = createAgUiTranslationState();

  const first = translateAgentEventToAgUi({ kind: "text", text: "Let me check that." }, state);
  const firstMessageId = (first[0] as { messageId: string }).messageId;

  const toolEvents = translateAgentEventToAgUi({ kind: "tool_use", id: "call-1", name: "search", input: {} }, state);
  // The interrupted text message must be closed (END) before the tool-call lifecycle starts —
  // this is exactly the ordering a real AG-UI client enforces (a second START with no intervening
  // END is a documented rejection case in AG-UI's own ecosystem).
  assert.equal(toolEvents[0]?.type, "TEXT_MESSAGE_END");
  assert.equal((toolEvents[0] as { messageId: string }).messageId, firstMessageId);
  assert.deepEqual(toolEvents.slice(1).map((e) => e.type), ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END"]);

  const resultEvents = translateAgentEventToAgUi({ kind: "tool_result", toolUseId: "call-1", content: "found 3", isError: false }, state);
  assert.deepEqual(resultEvents.map((e) => e.type), ["TOOL_CALL_RESULT"]);

  const second = translateAgentEventToAgUi({ kind: "text", text: "Found 3 posts." }, state);
  // A genuinely NEW message — a fresh START with a DIFFERENT id, not a reopened one. Reusing the
  // first id here would be indistinguishable from "the same message resumed", which AG-UI's
  // lifecycle does not model (a closed message stays closed).
  assert.equal(second[0]?.type, "TEXT_MESSAGE_START");
  const secondMessageId = (second[0] as { messageId: string }).messageId;
  assert.notEqual(secondMessageId, firstMessageId);
  assert.equal(second[1]?.type, "TEXT_MESSAGE_CONTENT");

  // And the run's own close-out must not re-emit an END for an already-closed first message —
  // only the currently-open second one.
  const closing = closeAgUiRun(state);
  assert.deepEqual(closing, [{ type: "TEXT_MESSAGE_END", messageId: secondMessageId }]);
});

test("interruption sequence: thinking -> text also closes REASONING before opening TEXT", () => {
  const state = createAgUiTranslationState();
  translateAgentEventToAgUi({ kind: "thinking", text: "weighing options" }, state);

  const events = translateAgentEventToAgUi({ kind: "text", text: "Here's the answer." }, state);

  assert.deepEqual(events.map((e) => e.type), ["REASONING_MESSAGE_END", "REASONING_END", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT"]);
});

test("interruption sequence: thinking -> tool_use also closes REASONING before the tool call fires", () => {
  const state = createAgUiTranslationState();
  translateAgentEventToAgUi({ kind: "thinking", text: "weighing options" }, state);

  const events = translateAgentEventToAgUi({ kind: "tool_use", id: "call-1", name: "search", input: {} }, state);

  assert.deepEqual(events.map((e) => e.type), [
    "REASONING_MESSAGE_END",
    "REASONING_END",
    "TOOL_CALL_START",
    "TOOL_CALL_ARGS",
    "TOOL_CALL_END",
  ]);
});

test("closeAgUiRun on a state with nothing open is a no-op (no dangling END for a message that never started)", () => {
  assert.deepEqual(closeAgUiRun(createAgUiTranslationState()), []);
});

test("closeAgUiRun after a bare text run (no interruption) closes it via the run's own terminal boundary", () => {
  const state = createAgUiTranslationState();
  translateAgentEventToAgUi({ kind: "text", text: "done" }, state);
  const messageId = state.openTextMessageId;

  assert.deepEqual(closeAgUiRun(state), [{ type: "TEXT_MESSAGE_END", messageId }]);
  assert.equal(state.openTextMessageId, null);
});

test("closeAgUiRun closes open reasoning once and resets the message state", () => {
  const state = createAgUiTranslationState();
  translateAgentEventToAgUi({ kind: "thinking", text: "done thinking" }, state);
  const messageId = state.openReasoningMessageId;
  assert.ok(messageId);
  assert.deepEqual(closeAgUiRun(state), [
    { type: "REASONING_MESSAGE_END", messageId },
    { type: "REASONING_END", messageId },
  ]);
  assert.equal(state.openReasoningMessageId, null);
  assert.equal(state.openTextMessageId, null);
  assert.deepEqual(closeAgUiRun(state), []);
});
