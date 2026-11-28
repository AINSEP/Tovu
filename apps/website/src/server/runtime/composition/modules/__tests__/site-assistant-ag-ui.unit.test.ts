import assert from "node:assert/strict";
import test from "node:test";

import { createVisitorAgUiWriter, readVisitorChatInput, selectVisitorChatWire } from "../site-assistant-ag-ui.js";

function writerFixture() {
  const chunks: string[] = [];
  const writer = createVisitorAgUiWriter({
    ids: { next: ({ prefix, ordinal }) => `${prefix}-${ordinal}` },
    encode: (event) => JSON.stringify(event), write: (chunk) => { chunks.push(chunk); },
    threadId: "visitor-thread", runId: "visitor-run",
    copy: { noReply: "No answer was available.", interrupted: "The answer was interrupted." },
  });
  return { writer, events: () => chunks.map((chunk) => JSON.parse(chunk) as { type: string }) };
}

test("the visitor writer forwards directives until interrupt, then suppresses output from the old segment", () => {
  const { writer, events } = writerFixture();
  writer.start();
  writer.directive({ value: { type: "display", text: "Approval controls" } });
  writer.interrupt({ interrupt: { id: "approval-2", reason: "confirmation", message: "Approve this action?" } });
  writer.directive({ value: { type: "display", text: "Late controls" } });
  writer.text({ delta: "Late reply" });
  writer.finish({ outcome: { kind: "ok", reason: "stop" } });
  writer.settle();

  assert.deepEqual(events(), [
    { type: "RUN_STARTED", threadId: "visitor-thread", runId: "visitor-run" },
    { type: "CUSTOM", name: "client_directive", value: { type: "display", text: "Approval controls" } },
    { type: "RUN_FINISHED", threadId: "visitor-thread", runId: "visitor-run",
      outcome: { type: "interrupt", interrupts: [{ id: "approval-2", reason: "confirmation", message: "Approve this action?" }] } },
  ]);
});

test("only an explicit, non-zero-quality agui=1 event-stream range selects the AG-UI wire", () => {
  const cases: [string | undefined, string][] = [
    [undefined, "legacy"], ["", "legacy"],
    ["text/event-stream", "legacy"], ["text/event-stream; agui=2", "legacy"], ["application/json; agui=1", "legacy"],
    ["text/event-stream; agui=1; q=0", "legacy"],
    ["text/event-stream; agui=1", "ag-ui"], ["TEXT/Event-Stream ; AGUI = 1 ; q=0.5", "ag-ui"],
    ["application/json, text/event-stream;agui=1", "ag-ui"],
  ];
  for (const [accept, wire] of cases) assert.equal(selectVisitorChatWire({ accept }), wire, String(accept));
});

test("an AG-UI body is read to one visitor turn, or refused before any spend", () => {
  const readTurnId = ({ body }: { body: unknown }) => ((body as { turnId?: unknown }).turnId as string | undefined) ?? null;
  const read = (body: unknown) => readVisitorChatInput({ body, wire: "ag-ui", readTurnId, maxMessageChars: 10 });
  const ids = { threadId: "t-1", runId: "r-1" };
  assert.deepEqual(read({ ...ids, threadId: " " }), { ok: false, status: 400, code: "VALIDATION", diagnostic: "threadId and runId must be bounded non-empty strings" });
  assert.deepEqual(read({ ...ids }), { ok: false, status: 400, code: "VALIDATION", diagnostic: "the last message must be the visitor's" }, "no messages array");
  assert.deepEqual(read({ ...ids, messages: [{ role: "assistant", content: "hi" }] }), { ok: false, status: 400, code: "VALIDATION", diagnostic: "the last message must be the visitor's" });
  assert.deepEqual(read({ ...ids, messages: [{ role: "user", content: 7 }] }), { ok: false, status: 400, code: "VALIDATION", diagnostic: "message must be a non-empty string" });
  assert.deepEqual(read({ ...ids, messages: [{ role: "user", content: "x".repeat(11) }] }), { ok: false, status: 413, code: "TOO_LARGE", diagnostic: "message exceeds 10 characters" });
  const prior = { role: "assistant", content: "earlier" };
  assert.deepEqual(read({ ...ids, messages: [prior, { role: "user", content: "  hello " }] }),
    { ok: true, message: "hello", rawHistory: [prior], turnId: null, wireIds: ids }, "no forwardedProps: no turn id");
  assert.deepEqual(read({ ...ids, messages: [{ role: "user", content: "hello" }], forwardedProps: { turnId: "turn-9" } }),
    { ok: true, message: "hello", rawHistory: [], turnId: "turn-9", wireIds: ids });
  assert.deepEqual(readVisitorChatInput({ body: null, wire: "legacy", readTurnId, maxMessageChars: 10 }),
    { ok: false, status: 400, code: "VALIDATION", diagnostic: "message must be a non-empty string" }, "a non-object legacy body");
});

test("the visitor writer holds leading whitespace, nests a page action under the open message, and ends once", () => {
  const { writer, events } = writerFixture();
  writer.start();
  writer.toolCall({ toolCallId: "call-0", toolCallName: "page.scroll", args: "{}" });
  writer.text({ delta: "  " });
  writer.text({ delta: "Hi" });
  writer.text({ delta: " there" });
  writer.toolCall({ toolCallId: "call-1", toolCallName: "page.highlight", args: "{\"id\":\"a\"}" });
  writer.finish({ outcome: { kind: "error", message: "Public failure." } });
  writer.toolCall({ toolCallId: "call-2", toolCallName: "page.scroll", args: "{}" });
  writer.settle();
  const all = events() as { type: string; delta?: string; messageId?: string; parentMessageId?: string; toolCallId?: string; message?: string; code?: string }[];
  const opened = all.find((event) => event.type === "TEXT_MESSAGE_START")?.messageId;
  assert.equal(typeof opened, "string");
  const starts = all.filter((event) => event.type === "TOOL_CALL_START");
  assert.deepEqual(starts.map((event) => [event.toolCallId, event.parentMessageId]), [["call-0", undefined], ["call-1", opened]],
    "only the action taken while a message is open names it; nothing after the terminal");
  assert.deepEqual(all.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta), ["  Hi", " there"]);
  const terminals = all.filter((event) => event.type === "RUN_ERROR" || event.type === "RUN_FINISHED");
  assert.deepEqual(terminals, [{ type: "RUN_ERROR", message: "Public failure." }], "an error without a code carries none; settle adds nothing");
});

test("a whitespace-only reply ends as the no-reply error, and a turn that never finishes settles as interrupted", () => {
  const silent = writerFixture();
  silent.writer.start();
  silent.writer.text({ delta: "   " });
  silent.writer.finish({ outcome: { kind: "ok", reason: "stop" } });
  assert.deepEqual(silent.events().filter((event) => event.type !== "RUN_STARTED"), [{ type: "RUN_ERROR", message: "No answer was available.", code: "NO_REPLY" }]);

  const dropped = writerFixture();
  dropped.writer.start();
  dropped.writer.settle();
  assert.deepEqual(dropped.events().at(-1), { type: "RUN_ERROR", message: "The answer was interrupted.", code: "INTERRUPTED" });

  const coded = writerFixture();
  coded.writer.text({ delta: "Partial" });
  coded.writer.finish({ outcome: { kind: "error", message: "Provider failed.", code: "provider_error" } });
  assert.deepEqual(coded.events().at(-1), { type: "RUN_ERROR", message: "Provider failed.", code: "provider_error" });
});

test("optional AG-UI fields are absent, not undefined, on the events handed to the encoder", () => {
  const raw: Record<string, unknown>[] = [];
  const writer = createVisitorAgUiWriter({ ids: { next: ({ prefix, ordinal }) => `${prefix}-${ordinal}` },
    encode: (event) => { raw.push(event as unknown as Record<string, unknown>); return ""; }, write: () => {},
    threadId: "visitor-thread", runId: "visitor-run", copy: { noReply: "none", interrupted: "cut" } });
  writer.toolCall({ toolCallId: "call-0", toolCallName: "page.scroll", args: "{}" });
  writer.text({ delta: "Hi" });
  writer.finish({ outcome: { kind: "error", message: "Public failure." } });
  const start = raw.find((event) => event.type === "TOOL_CALL_START")!;
  assert.equal(Object.hasOwn(start, "parentMessageId"), false, "no open message: no parent key");
  const error = raw.find((event) => event.type === "RUN_ERROR")!;
  assert.equal(Object.hasOwn(error, "code"), false, "an uncoded error carries no code key");
});
