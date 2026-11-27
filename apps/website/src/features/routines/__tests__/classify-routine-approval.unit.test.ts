import assert from "node:assert/strict";
import test from "node:test";

import { classifyApprovalEvent } from "../classify-routine-approval.js";

const expectedRun = {
  routineRunId: "routine-row-4",
  agentRunId: "agent-attempt-9",
  messageId: "assistant-turn-2",
  principalId: "owner-17",
  workspaceId: "site-8",
};
const event = {
  runId: "agent-attempt-9", messageId: "assistant-turn-2", principalId: "owner-17", workspaceId: "site-8",
  receipt: { kind: "open", exchangeId: "approval-23" },
};

test("routine approval projection refuses each independently mismatched trusted identity", () => {
  assert.deepEqual(classifyApprovalEvent({ event, expectedRun }), {
    kind: "waiting", routineRunId: "routine-row-4", ref: "approval-23",
  });
  for (const key of ["runId", "messageId", "principalId", "workspaceId"] as const) {
    assert.equal(classifyApprovalEvent({ event: { ...event, [key]: "mismatch" }, expectedRun }), null, key);
  }
});

test("malformed receipts cannot change a routine's approval state", () => {
  assert.equal(classifyApprovalEvent({ event: null, expectedRun }), null);
  for (const receipt of [
    null, "confirmed", { kind: "open", exchangeId: 23 }, { kind: "open", exchangeId: "" },
    { kind: "answered", exchangeId: "approval-23", confirmed: "true" },
    { kind: "ended", exchangeId: "approval-23", reason: "unrelated" },
  ]) {
    assert.equal(classifyApprovalEvent({ event: { ...event, receipt }, expectedRun }), null, JSON.stringify(receipt));
  }
});

test("answers and closed exchanges settle the matching approval without implying a tool result", () => {
  for (const [receipt, state] of [
    [{ kind: "answered", confirmed: true }, "approved"],
    [{ kind: "answered", confirmed: false }, "declined"],
    [{ kind: "ended", reason: "expired" }, "expired"],
    [{ kind: "ended", reason: "abandoned" }, "expired"],
  ] as const) {
    assert.deepEqual(classifyApprovalEvent({
      event: { ...event, receipt: { exchangeId: "approval-23", ...receipt } }, expectedRun,
    }), { kind: "settled", routineRunId: "routine-row-4", expectedRef: "approval-23", state });
  }
});
