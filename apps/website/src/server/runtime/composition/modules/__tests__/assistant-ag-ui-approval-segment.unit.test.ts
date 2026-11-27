import assert from "node:assert/strict";
import test from "node:test";

import { EventType } from "@ag-ui/core";
import { SURFACE_EXCHANGE_META } from "@jini-ai/chat/core";
import type { AgUiEvent } from "@jini-ai/chat/core/ag-ui";
import { MCP_UI_ACTION_PLAN_META_KEY, MCP_UI_EXPIRES_AT_META_KEY } from "@jini-ai/protocol/mcp-ui";

import { readAdminApprovalCard, tapSseCursor } from "../assistant-ag-ui-approval-segment.js";

const EXTENSION = "tovu:";
const EXCHANGE = { exchangeId: "exchange-9", toolId: "publish_entry" };
const ACTIONS = [{ id: "cancel" }, { id: "confirm" }];
const PLAN = { title: "Publish this entry?", actions: ACTIONS };
const EXPIRY = 1_796_000_000_000;

function card(meta: Record<string, unknown>) {
  return { resource: { _meta: { [SURFACE_EXCHANGE_META]: EXCHANGE, [MCP_UI_ACTION_PLAN_META_KEY]: PLAN, ...meta } } };
}

function read(value: unknown, name = "tovu:mcp-ui") {
  const event: AgUiEvent = { type: EventType.CUSTOM, name, value };
  return readAdminApprovalCard({ event, extensionPrefix: EXTENSION });
}

test("approval metadata preserves daemon exchange identity, card title and finite expiry", () => {
  assert.deepEqual(read(card({ [MCP_UI_EXPIRES_AT_META_KEY]: EXPIRY })), {
    exchangeId: "exchange-9", toolId: "publish_entry", message: "Publish this entry?", expiresAtMs: EXPIRY,
  });
});

test("an approval without usable display metadata keeps the exchange and a safe default title", () => {
  for (const title of [undefined, "", "x".repeat(513)]) {
    for (const expiry of [undefined, "1796000000000", Infinity]) {
      assert.deepEqual(read(card({
        [MCP_UI_ACTION_PLAN_META_KEY]: { ...PLAN, title },
        [MCP_UI_EXPIRES_AT_META_KEY]: expiry,
      })), { exchangeId: "exchange-9", toolId: "publish_entry", message: "Approve this action?" });
    }
  }
});

test("non-approval events and malformed cards do not park the run", () => {
  assert.equal(readAdminApprovalCard({ event: { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m-1", delta: "working" }, extensionPrefix: EXTENSION }), undefined);
  assert.equal(read(card({}), "other:mcp-ui"), undefined);
  for (const [why, value] of [
    ["null value", null],
    ["missing resource", {}],
    ["array metadata", { resource: { _meta: [] } }],
    ["missing exchange", card({ [SURFACE_EXCHANGE_META]: undefined })],
    ["empty exchange id", card({ [SURFACE_EXCHANGE_META]: { ...EXCHANGE, exchangeId: "" } })],
    ["overlong tool id", card({ [SURFACE_EXCHANGE_META]: { ...EXCHANGE, toolId: "t".repeat(513) } })],
    ["missing plan", card({ [MCP_UI_ACTION_PLAN_META_KEY]: undefined })],
    ["non-array actions", card({ [MCP_UI_ACTION_PLAN_META_KEY]: { actions: { confirm: true, cancel: true } } })],
    ["confirm without cancel", card({ [MCP_UI_ACTION_PLAN_META_KEY]: { actions: [{ id: "confirm" }, "cancel"] } })],
    ["cancel without confirm", card({ [MCP_UI_ACTION_PLAN_META_KEY]: { actions: [{ id: "cancel" }, { id: "save" }] } })],
  ] as const) {
    assert.equal(read(value), undefined, why);
  }
});

test("a split SSE id advances the resume cursor without changing bytes, and a heartbeat cannot advance it", async () => {
  const chunks = ["id: event-4\r\ndata: first\r\n\r\ni", "d: event-", "5\r", "\ndata: approval\r\n\r\n", ": ping\n\n", "id:\ndata: reset\n\n"]
    .map((chunk) => new TextEncoder().encode(chunk));
  const source = new ReadableStream<Uint8Array>({ start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  } });
  const tap = tapSseCursor({ reader: source.getReader() });
  assert.equal(tap.cursor(), undefined);
  for (const [index, cursor] of ["event-4", "event-4", "event-4", "event-5", "event-5", undefined].entries()) {
    assert.deepEqual(await tap.reader.read(), { done: false, value: chunks[index] });
    assert.equal(tap.cursor(), cursor);
  }
  assert.deepEqual(await tap.reader.read(), { done: true, value: undefined });
  await tap.reader.closed;
  tap.reader.releaseLock();
  assert.equal(source.locked, false);
});

test("cancelling the tapped reader propagates the caller's reason to its underlying stream", async () => {
  const reasons: unknown[] = [];
  const source = new ReadableStream<Uint8Array>({ cancel(reason) { reasons.push(reason); } });
  const tap = tapSseCursor({ reader: source.getReader() });
  await tap.reader.cancel("approval abandoned");
  await tap.reader.closed;
  assert.deepEqual(reasons, ["approval abandoned"]);
});

test("the last of two consecutive SSE id fields wins", async () => {
  const source = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode("id: provisional\nid: committed\ndata: approval\n\n"));
    controller.close();
  } });
  const tap = tapSseCursor({ reader: source.getReader() });
  await tap.reader.read();
  assert.equal(tap.cursor(), "committed");
});
