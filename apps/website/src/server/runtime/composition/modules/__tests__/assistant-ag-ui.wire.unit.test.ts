import assert from "node:assert/strict";
import test from "node:test";

import { reduceAgentWirePayload, resolveAgUiMessages, terminalReasonNotice } from "../assistant-ag-ui.js";

/** AG-UI request/stream shaping: history is validated fail-soft, wire payload fields are coerced to
 * strings (missing -> "", structured -> JSON), and unknown payload types pass through as extensions. */

test("AG-UI history keeps only non-empty user/assistant string turns; a non-array is empty", () => {
  assert.deepEqual(resolveAgUiMessages([null, 3, { role: "tool", content: "x" }, { role: "assistant", content: "" }, { role: "user", content: ["x"] }, { role: "user", content: "hi" }]),
    [{ role: "user", content: "hi" }]);
  assert.deepEqual(resolveAgUiMessages("hi"), []);
});

test("wire payload fields coerce: absent is empty, structured is JSON, and a status detail is optional", () => {
  assert.deepEqual(reduceAgentWirePayload({ type: "status", label: { step: 1 } }), { kind: "status", label: '{"step":1}', detail: undefined });
  assert.deepEqual(reduceAgentWirePayload({ type: "status", label: "Working", detail: 42 }), { kind: "status", label: "Working", detail: "42" });
  assert.deepEqual(reduceAgentWirePayload({ type: "text_delta" }), { kind: "text", text: "" });
  assert.deepEqual(reduceAgentWirePayload({ type: "tool_result", toolUseId: "t1", content: null, isError: 1 }), { kind: "tool_result", toolUseId: "t1", content: "", isError: true });
  assert.deepEqual(reduceAgentWirePayload({ type: "raw", line: "plain" }), { kind: "raw", line: "plain" });
  assert.equal(reduceAgentWirePayload({ type: "thinking_start" }), null);
  const unknown = { type: "custom-ext", value: 1 };
  assert.deepEqual(reduceAgentWirePayload(unknown), { kind: "ext", name: "custom-ext", data: unknown });
});

test("only a tool-turn-limit stop gets a visible notice", () => {
  assert.equal(terminalReasonNotice("end_turn"), null);
  assert.equal(terminalReasonNotice("max_tool_turns")?.kind, "status");
});
