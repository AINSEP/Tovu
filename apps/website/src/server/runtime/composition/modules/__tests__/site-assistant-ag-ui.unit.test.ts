import assert from "node:assert/strict";
import test from "node:test";

import { createVisitorAgUiWriter } from "../site-assistant-ag-ui.js";

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
