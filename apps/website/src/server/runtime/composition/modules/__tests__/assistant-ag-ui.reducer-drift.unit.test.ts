import assert from "node:assert/strict";
import test from "node:test";

import type { AgentEvent } from "@jini-ai/chat/core";
import { translateRunAgentPayload } from "@jini-ai/chat/core/run-events";

import { closeAgUiRun, createAgUiTranslationState, reduceAgentWirePayload, translateAgentEventToAgUi } from "../assistant-ag-ui.js";

/**
 * @file T0-2 of the AG-UI design (S0), host half: this module's own daemon-payload reducer against
 * Jini's canonical `translateRunAgentPayload`, over one fixture with every optional field populated.
 * Each row states whether the reduced OBJECTS are equal and, separately, whether the SERIALIZED AG-UI
 * events are equal (a `detail: undefined` key differs as an object and not on the wire). The copy may
 * be deleted only by a commit that edits the rows still marked as different on the wire.
 */

const MCP_UI = { type: "resource", resource: { uri: "ui://confirm/1", mimeType: "text/html", text: "<p>Delete?</p>" } };

const PAYLOADS = {
  statusWithDetail: { type: "status", label: "Working", detail: "step 2 of 3" },
  statusWithoutDetail: { type: "status", label: "Working" },
  textDelta: { type: "text_delta", delta: "Hello" },
  thinkingStart: { type: "thinking_start" },
  thinkingDelta: { type: "thinking_delta", delta: "plan" },
  toolInputDelta: { type: "tool_input_delta", id: "call-1", delta: '{"q":' },
  toolUse: { type: "tool_use", id: "call-1", name: "search", input: { q: "posts" }, toolOrigin: "bridge", bridgeCall: { name: "posts.search", input: { q: "posts" }, buffered: true } },
  toolResult: { type: "tool_result", toolUseId: "call-1", content: "found 3", isError: true, media: [{ type: "image", mimeType: "image/png", data: "AAAA" }], outcome: "unknown" },
  usage: { type: "usage", usage: { input_tokens: 11, output_tokens: 7 }, costUsd: 0.01, cumulativeCostUsd: 0.05, costSessionId: "cost-1", durationMs: 1200, stopReason: "end_turn" },
  raw: { type: "raw", line: "raw line" },
  mcpUi: { type: "mcp-ui", resource: MCP_UI, surfaceExchange: { exchangeId: "ex-1", toolId: "posts.delete", runId: "run-1" } },
  a2ui: { type: "a2ui", message: { createSurface: { surfaceId: "s1", catalogId: "basic" } } },
  stageStart: { type: "stage_start", stage: "plan" },
} as const;

type Row = keyof typeof PAYLOADS;

/** `objects` / `wire`: whether the host copy equals the canonical reducer for that row. */
const EXPECTED: Readonly<Record<Row, { objects: boolean; wire: boolean }>> = {
  statusWithDetail: { objects: true, wire: true },
  statusWithoutDetail: { objects: false, wire: true },
  textDelta: { objects: true, wire: true },
  thinkingStart: { objects: true, wire: true },
  thinkingDelta: { objects: true, wire: true },
  toolInputDelta: { objects: false, wire: false },
  toolUse: { objects: false, wire: true },
  toolResult: { objects: false, wire: true },
  usage: { objects: true, wire: true },
  raw: { objects: true, wire: true },
  mcpUi: { objects: false, wire: false },
  a2ui: { objects: true, wire: true },
  stageStart: { objects: true, wire: true },
};

function wire(event: AgentEvent | null): string {
  if (event === null) return "";
  const state = createAgUiTranslationState();
  return JSON.stringify([...translateAgentEventToAgUi(event, state), ...closeAgUiRun(state)]);
}

function sameObject(a: unknown, b: unknown): boolean {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

for (const row of Object.keys(PAYLOADS) as Row[]) {
  test(`reducer drift: ${row}`, () => {
    const copy = reduceAgentWirePayload(PAYLOADS[row]);
    const canonical = translateRunAgentPayload({ payload: PAYLOADS[row] });
    assert.equal(sameObject(copy, canonical), EXPECTED[row].objects, `object equality for ${row}`);
    assert.equal(wire(copy) === wire(canonical), EXPECTED[row].wire, `wire equality for ${row}`);
  });
}

test("reducer drift: the two wire-visible differences, spelled out", () => {
  assert.equal(translateRunAgentPayload({ payload: PAYLOADS.toolInputDelta }), null);
  assert.equal(wire(reduceAgentWirePayload(PAYLOADS.toolInputDelta)),
    '[{"type":"CUSTOM","name":"tovu.ext.tool_input_delta","value":{"type":"tool_input_delta","id":"call-1","delta":"{\\"q\\":"}}]');
  assert.deepEqual(reduceAgentWirePayload(PAYLOADS.mcpUi), { kind: "ext", name: "mcp-ui", data: MCP_UI });
  assert.deepEqual(translateRunAgentPayload({ payload: PAYLOADS.mcpUi }), { kind: "ext", name: "mcp-ui",
    data: { type: "resource", resource: { ...MCP_UI.resource, _meta: { "jini/surface-exchange": { exchangeId: "ex-1", toolId: "posts.delete", runId: "run-1" } } } } });
});
