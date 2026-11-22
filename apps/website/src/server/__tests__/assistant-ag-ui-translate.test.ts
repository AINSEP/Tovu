import assert from "node:assert/strict";
import test from "node:test";

import type { AgentEvent } from "@jini-ai/chat/core";
import { terminalReasonNotice as jiniTerminalReasonNotice, translateRunAgentPayload, type RunAgentPayload } from "@jini-ai/chat/core/run-events";

import { createAgUiTranslationState as create, translateAgentEventToAgUi as translate, type AgUiTranslationState } from "@jini-ai/chat/core/ag-ui";

import { RUN_NOTICES } from "../../contracts/core/assistant-run-events.js";
import { AG_UI_TRANSLATION } from "../runtime/composition/modules/assistant-ag-ui.js";

/** Jini's notice rule with the words this host passes it, as the route's frame translation does. */
const terminalReasonNotice = ({ reason }: { reason: string }) => jiniTerminalReasonNotice({ reason, notice: RUN_NOTICES.toolStepLimit });

/** The route's projection calls, with its own ids and wire names. */
const createAgUiTranslationState = () => create(AG_UI_TRANSLATION);
const translateAgentEventToAgUi = (event: AgentEvent, state: AgUiTranslationState) => translate({ event, state });

/**
 * @file Pure-function coverage for `assistant-ag-ui.ts`'s two translation steps — no daemon, no
 * Express, no network. Jini's `translateRunAgentPayload` (daemon wire -> `AgentEvent`, the one
 * reducer this route calls) and `translateAgentEventToAgUi` (`AgentEvent` -> real AG-UI events)
 * are each independently testable this way, matching the existing precedent
 * `apps/admin/.../assistant-transport.translate.unit.test.ts` sets for the client-side half.
 */

/** The route's reduction step, as it calls it. */
function reduce(payload: RunAgentPayload): AgentEvent | null {
  return translateRunAgentPayload({ payload });
}

test("translateRunAgentPayload — cumulative usage and session identity survive AG-UI translation", () => {
  const usage = reduce({ type: "usage", costUsd: null, cumulativeCostUsd: 25.6, costSessionId: "claude-session-a" });
  assert.deepEqual(usage, { kind: "usage", cumulativeCostUsd: 25.6, costSessionId: "claude-session-a" });
  assert.deepEqual(translateAgentEventToAgUi(usage!, createAgUiTranslationState()),
    [{ type: "CUSTOM", name: "tovu.usage", value: usage }]);
  assert.deepEqual(reduce({ type: "usage", cumulativeCostUsd: "bad", costSessionId: 17 }), { kind: "usage" });
  assert.deepEqual(reduce({ type: "usage", cumulativeCostUsd: 0, costSessionId: "zero-session" }),
    { kind: "usage", cumulativeCostUsd: 0, costSessionId: "zero-session" });
});

test("terminalReasonNotice — only max_tool_turns produces a notice", () => {
  assert.equal(terminalReasonNotice({ reason: "stop" }), null);
  assert.equal(terminalReasonNotice({ reason: "end_turn" }), null);
  const notice = terminalReasonNotice({ reason: "max_tool_turns" });
  assert.equal(notice?.kind, "status");
  assert.match((notice as { detail?: string }).detail ?? "", /continue/i);
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
