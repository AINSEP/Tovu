import assert from "node:assert/strict";
import test from "node:test";

import {
  asString, isDaemonRunId, parseFrame, parseUsageEvent, readSseFrames, readTerminalOutcome,
  readTerminalReason, runContentFromEvents, runEventsForSave, terminalFailureError,
  terminalOutcomeNotice, terminalReasonNotice, translateRunAgentPayload, translateRunFrame,
  type RunFrameCarry,
} from "../../assistant-run-events.js";

/**
 * @file The run stream → chat event translation, for what the live activity line needs and what the
 * saved answer must not contain.
 *
 * - Claude Code's stdout heartbeats (`api_retry`, `tool_progress`, `thinking_tokens`) used to reach
 *   the browser only as unrendered `raw` lines. They now also become typed `status` events.
 * - With `--include-partial-messages`, every streamed token is also echoed on stdout as a
 *   `stream_event` line; those duplicate the parsed text and are not kept as `raw`.
 * - A working note written before a tool call was glued onto the final answer in `content`.
 */

function stdoutFrame(lines: readonly unknown[]): string {
  return JSON.stringify({ runId: "r1", kind: "stdout", payload: { chunk: lines.map((l) => `${JSON.stringify(l)}\n`).join("") } });
}

test("asString preserves text, serializes structured values and renders null as empty text", () => {
  assert.equal(asString("hello"), "hello");
  assert.equal(asString({ answer: 42 }), '{"answer":42}');
  assert.equal(asString(null), "");
});

test("parseUsageEvent preserves numeric usage without coercing missing or malformed fields", () => {
  assert.deepEqual(parseUsageEvent({ type: "usage", usage: { input_tokens: 7, output_tokens: 11 }, costUsd: 0.25 }),
    { kind: "usage", inputTokens: 7, outputTokens: 11, costUsd: 0.25 });
  assert.deepEqual(parseUsageEvent({ type: "usage", usage: { input_tokens: "7" } }), { kind: "usage" });
});

test("terminal notices use Tovu's actionable copy and keep failures distinct from cancellation", () => {
  const raw = JSON.stringify({ payload: { status: "failed", code: 2, signal: null, resumable: true } });
  assert.deepEqual(readTerminalOutcome(raw), { status: "failed", code: "2", signal: "none", resumable: "yes" });
  assert.deepEqual(terminalOutcomeNotice(raw), {
    kind: "status", label: "Run failed — the agent process exited without answering",
    detail: "exit code 2, signal none, resumable yes. The agent CLI's own stderr is shown above when it printed anything; otherwise check the server log for `[agent-daemon] run <id> ended`.",
  });
  assert.equal(terminalFailureError(raw)?.message,
    "The agent process exited without answering (exit code 2, signal none, resumable yes).");
  assert.equal(terminalFailureError(JSON.stringify({ payload: { status: "canceled" } })), null);
  assert.deepEqual(terminalReasonNotice("max_tool_turns"), {
    kind: "status", label: "Stopped early — tool-step limit reached",
    detail: "This turn used all the tool steps allowed for one message, so it may be unfinished. Ask it to continue to pick up where it left off.",
  });
  assert.equal(terminalReasonNotice("stop"), null);
  assert.equal(readTerminalReason('{"payload":{"reason":"stop"}}', true), "stop");
  assert.equal(readTerminalReason('{"reason":"end_turn"}', false), "end_turn");
});

test("SSE helpers preserve named frames across chunk boundaries", async () => {
  assert.deepEqual(parseFrame("event: agent\ndata: hello"), { event: "agent", data: "hello" });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("event: agent\nda"));
      controller.enqueue(encoder.encode("ta: hello\n\ndata: done\n\n"));
      controller.close();
    },
  });
  const frames = [];
  for await (const frame of readSseFrames(body)) frames.push(frame);
  assert.deepEqual(frames, [{ event: "agent", data: "hello" }, { event: "message", data: "done" }]);
  assert.equal(body.locked, false);
});

test("only daemon run ids qualify for daemon lookup", () => {
  assert.equal(isDaemonRunId("run-123"), true);
  assert.equal(isDaemonRunId("byok:123"), false);
  assert.equal(isDaemonRunId("agui:123"), false);
});

test("a connection carry suppresses the remainder of a split stdout echo and keeps later output", () => {
  const carry: RunFrameCarry = {};
  const chunk = (text: string) => JSON.stringify({ payload: { chunk: text } });
  assert.deepEqual(translateRunFrame("stdout", chunk('{"type":"assistant","message":"par'), carry).events, []);
  assert.deepEqual(translateRunFrame("stdout", chunk('tial"}\nvisible output\n'), carry).events,
    [{ kind: "raw", line: "visible output\n" }]);
});

test("translateRunFrame: an api_retry heartbeat becomes a typed status event with the attempt numbers", () => {
  const retry = { type: "system", subtype: "api_retry", attempt: 4, max_retries: 10, retry_delay_ms: 518, error_status: 529, error: "overloaded" };
  const { events } = translateRunFrame("stdout", stdoutFrame([retry]));
  assert.deepEqual(
    events.filter((e) => e.kind === "status"),
    [{ kind: "status", code: "api_retry", label: "api_retry", detail: "529 overloaded", data: { attempt: 4, maxAttempts: 10, service: "Claude" } }],
  );
});

test("translateRunFrame: tool_progress and thinking_tokens heartbeats become status events", () => {
  const progress = { type: "tool_progress", tool_use_id: "t-heartbeat-0", tool_name: "mcp__jini__execute_delegated_tool", parent_tool_use_id: "t", elapsed_time_seconds: 30, heartbeat: true };
  const thinking = { type: "system", subtype: "thinking_tokens", estimated_tokens: 50, estimated_tokens_delta: 50 };
  const { events } = translateRunFrame("stdout", stdoutFrame([progress, thinking]));
  assert.deepEqual(
    events.filter((e) => e.kind === "status"),
    [
      { kind: "status", code: "tool_progress", label: "tool_progress", data: { elapsedSeconds: 30 } },
      { kind: "status", code: "thinking", label: "thinking" },
    ],
  );
});

test("translateRunFrame: stream_event echo lines are dropped from raw; other lines are kept verbatim", () => {
  const delta = { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } } };
  const hook = { type: "system", subtype: "hook_started" };
  assert.deepEqual(translateRunFrame("stdout", stdoutFrame([delta])).events, []);
  assert.deepEqual(translateRunFrame("stdout", stdoutFrame([delta, hook])).events, [{ kind: "raw", line: `${JSON.stringify(hook)}\n` }]);
  // A chunk that is not JSON lines (a plain-format CLI) stays one raw event, byte for byte.
  const plain = JSON.stringify({ runId: "r1", kind: "stdout", payload: { chunk: "hello\nworld" } });
  assert.deepEqual(translateRunFrame("stdout", plain).events, [{ kind: "raw", line: "hello\nworld" }]);
});

test("translateRunAgentPayload: tool_input_delta is not kept as an event (it duplicates the tool_use input)", () => {
  assert.equal(translateRunAgentPayload({ type: "tool_input_delta", id: "t", name: "x", delta: "{\"a\"" }), null);
});

test("runContentFromEvents: a working note before a tool call is not glued onto the answer", () => {
  const content = runContentFromEvents([
    { kind: "text", text: "Need project id. Find list_projects." },
    { kind: "tool_use", id: "t1", name: "mcp__supabase__list_projects", input: {} },
    { kind: "tool_result", toolUseId: "t1", content: "[]", isError: false },
    { kind: "text", text: "`test_table` now exists." },
  ]);
  assert.equal(content, "Need project id. Find list_projects.\n\n`test_table` now exists.");
});

test("translateRunFrame: assistant/user message echo lines are dropped from raw, even the head of a line split across chunks", () => {
  // The daemon already turns these into `text`/`thinking`/`tool_use`/`tool_result` events. Kept as raw
  // they stored every tool result twice (a 65 KB post body once as a tool_result, once as raw).
  const assistant = { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Hi" }] }, session_id: "s" };
  const user = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "big" }] } };
  const init = { type: "system", subtype: "init", session_id: "s" };
  assert.deepEqual(translateRunFrame("stdout", stdoutFrame([assistant, init, user])).events, [{ kind: "raw", line: `${JSON.stringify(init)}\n` }]);
  // A 65 KB line arrives over several stdout chunks; its first piece is not valid JSON on its own.
  const head = JSON.stringify({ runId: "r1", kind: "stdout", payload: { chunk: '{"type":"user","message":{"role":"user","content":[{"tool_use_id":"t","type":"tool_result","content":"<persisted' } });
  assert.deepEqual(translateRunFrame("stdout", head).events, []);
});

test("runEventsForSave: streamed text deltas are saved as one text event, content unchanged", () => {
  const events = [
    { kind: "text", text: "Checking." },
    { kind: "tool_use", id: "t1", name: "search_tools", input: {} },
    { kind: "tool_result", toolUseId: "t1", content: "ok", isError: false },
    { kind: "text", text: "Here" },
    { kind: "text", text: " are your" },
    { kind: "text", text: " 6 posts." },
    { kind: "usage", outputTokens: 9 },
  ] as const;
  const saved = runEventsForSave(events);
  assert.deepEqual(saved, [
    { kind: "text", text: "Checking." },
    { kind: "tool_use", id: "t1", name: "search_tools", input: {} },
    { kind: "tool_result", toolUseId: "t1", content: "ok", isError: false },
    { kind: "text", text: "Here are your 6 posts." },
    { kind: "usage", outputTokens: 9 },
  ]);
  assert.equal(runContentFromEvents(saved), runContentFromEvents(events));
});
