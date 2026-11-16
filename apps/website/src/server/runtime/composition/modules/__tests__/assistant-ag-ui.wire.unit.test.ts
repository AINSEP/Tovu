import assert from "node:assert/strict";
import test from "node:test";

import { terminalReasonNotice as jiniTerminalReasonNotice, translateRunAgentPayload, type RunAgentPayload } from "@jini-ai/chat/core/run-events";

import { RUN_NOTICES } from "#src/contracts/core/assistant-run-events";

/** Jini's notice rule with the words this host passes it, as the route's frame translation does. */
const terminalReasonNotice = ({ reason }: { reason: string }) => jiniTerminalReasonNotice({ reason, notice: RUN_NOTICES.toolStepLimit });

const reduce = (payload: RunAgentPayload) => translateRunAgentPayload({ payload });

/** AG-UI stream shaping: wire payload fields are coerced to strings (missing -> "", structured ->
 * JSON), and unknown payload types pass through as extensions. Request parsing is Jini's
 * `@jini-ai/chat/server/ag-ui/run-input`, tested there. */

test("wire payload fields coerce: absent is empty, structured is JSON, and a status detail is optional", () => {
  assert.deepEqual(reduce({ type: "status", label: { step: 1 } }), { kind: "status", label: '{"step":1}' });
  assert.deepEqual(reduce({ type: "status", label: "Working", detail: 42 }), { kind: "status", label: "Working", detail: "42" });
  assert.deepEqual(reduce({ type: "text_delta" }), { kind: "text", text: "" });
  assert.deepEqual(reduce({ type: "tool_result", toolUseId: "t1", content: null, isError: 1 }), { kind: "tool_result", toolUseId: "t1", content: "", isError: true });
  assert.deepEqual(reduce({ type: "raw", line: "plain" }), { kind: "raw", line: "plain" });
  assert.equal(reduce({ type: "thinking_start" }), null);
  const unknown = { type: "custom-ext", value: 1 };
  assert.deepEqual(reduce(unknown), { kind: "ext", name: "custom-ext", data: unknown });
});

test("only a tool-turn-limit stop gets a visible notice", () => {
  assert.equal(terminalReasonNotice({ reason: "end_turn" }), null);
  assert.equal(terminalReasonNotice({ reason: "max_tool_turns" })?.kind, "status");
});
