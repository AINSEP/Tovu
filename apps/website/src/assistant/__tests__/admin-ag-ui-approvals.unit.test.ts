import assert from "node:assert/strict";
import test from "node:test";
import { createAdminAgUiApprovals, type AnswerAdminExchange } from "../admin-ag-ui-approvals.js";

const CARD = { exchangeId: "exchange-73", toolId: "content_post_delete", message: "Move the draft to trash?" };
const RUN = { owner: "owner-4", threadId: "thread-2", runId: "segment-6", daemonRunId: "daemon-9" };
const RESUME = { owner: "owner-4", threadId: "thread-2", parentRunId: "segment-6", decision: "deny" as const };

function fixture({ accepted = true }: { accepted?: boolean } = {}) {
  let now = 1_000;
  let id = 0;
  const timers = new Map<object, { at: number; callback: () => void }>();
  const answers: Parameters<AnswerAdminExchange>[0][] = [];
  const approvals = createAdminAgUiApprovals({
    nowMs: () => now,
    newInterruptId: () => `interrupt-${++id}`,
    scheduler: {
      schedule({ delayMs, callback }) {
        const key = {};
        timers.set(key, { at: now + delayMs, callback });
        return () => { timers.delete(key); };
      },
    },
    answerExchange: async (answer) => {
      answers.push(answer);
      return accepted;
    },
  });
  const advanceTo = (time: number) => {
    now = time;
    for (const [key, timer] of timers) {
      if (timer.at > now) continue;
      timers.delete(key);
      timer.callback();
    }
  };
  return { ...approvals, advanceTo, answers, deadlines: () => [...timers.values()].map(timer => timer.at) };
}

test("the card's earlier deadline removes its checkpoint without answering the daemon", async () => {
  const f = fixture();
  assert.equal(f.parkAdminApproval({ ...RUN, cursor: "evt-17", card: { ...CARD, expiresAtMs: 1_250 } }), "interrupt-1");
  const key = { interruptId: "interrupt-1" };
  f.advanceTo(1_249);
  assert.deepEqual(f.peekAdminApproval(key), {
    owner: "owner-4", threadId: "thread-2", parentRunId: "segment-6", daemonRunId: "daemon-9", cursor: "evt-17",
  });
  f.advanceTo(1_250);
  assert.equal(f.peekAdminApproval(key), undefined);
  assert.equal(await f.redeemAgUiApproval({ ...RESUME, ...key }), "expired");
  assert.deepEqual(f.answers, []);
});

test("one owner cannot fill another owner's slots and expiry reopens a slot", () => {
  const f = fixture();
  for (let n = 1; n <= 4; n++) {
    assert.equal(f.parkAdminApproval({ ...RUN, runId: `segment-${n}`, card: { ...CARD, exchangeId: `exchange-${n}` } }), `interrupt-${n}`);
  }
  assert.equal(f.parkAdminApproval({ ...RUN, card: CARD }), undefined);
  assert.equal(f.parkAdminApproval({ ...RUN, owner: "owner-5", card: CARD }), "interrupt-6");
  assert.deepEqual(f.deadlines(), Array(5).fill(901_000), "caps do not allocate timers, and cards without a deadline get fifteen minutes");
  f.advanceTo(901_000);
  assert.equal(f.peekAdminApproval({ interruptId: "interrupt-1" }), undefined);
  assert.equal(f.parkAdminApproval({ ...RUN, card: CARD }), "interrupt-7");
  assert.deepEqual(f.answers, []);
});

test("a daemon refusal consumes the approval, clears its timer and cannot be retried", async () => {
  const f = fixture({ accepted: false });
  const key = { interruptId: "interrupt-1" };
  assert.equal(f.parkAdminApproval({ ...RUN, card: CARD }), key.interruptId);
  assert.deepEqual(f.peekAdminApproval(key), {
    owner: "owner-4", threadId: "thread-2", parentRunId: "segment-6", daemonRunId: "daemon-9",
  });
  assert.equal(await f.redeemAgUiApproval({ ...RESUME, ...key }), "expired");
  assert.equal(f.peekAdminApproval(key), undefined);
  assert.deepEqual(f.deadlines(), []);
  assert.equal(await f.redeemAgUiApproval({ ...RESUME, ...key, decision: "allow" }), "expired");
  assert.deepEqual(f.answers, [{ owner: "owner-4", toolId: "content_post_delete", exchangeId: "exchange-73", allow: false }]);
});

test("Stop removes only the approval for the supplied owner and daemon run", async () => {
  const f = fixture();
  assert.equal(f.parkAdminApproval({ ...RUN, card: CARD }), "interrupt-1");
  assert.equal(f.parkAdminApproval({ ...RUN, owner: "owner-5", card: { ...CARD, exchangeId: "exchange-74" } }), "interrupt-2");
  assert.equal(f.parkAdminApproval({ ...RUN, runId: "segment-7", daemonRunId: "daemon-10", card: { ...CARD, exchangeId: "exchange-75" } }), "interrupt-3");

  assert.equal(f.settleAdminApprovalsOnStop({ owner: RUN.owner, daemonRunId: RUN.daemonRunId }), 1);
  assert.equal(await f.redeemAgUiApproval({ ...RESUME, interruptId: "interrupt-1" }), "expired");
  assert.deepEqual(f.answers, []);
  assert.equal(await f.redeemAgUiApproval({ ...RESUME, owner: "owner-5", interruptId: "interrupt-2" }), "resumed");
  assert.equal(await f.redeemAgUiApproval({ ...RESUME, parentRunId: "segment-7", interruptId: "interrupt-3", decision: "allow" }), "resumed");
  assert.deepEqual(f.answers, [
    { owner: "owner-5", toolId: "content_post_delete", exchangeId: "exchange-74", allow: false },
    { owner: "owner-4", toolId: "content_post_delete", exchangeId: "exchange-75", allow: true },
  ]);
  assert.deepEqual(f.deadlines(), []);
});

test("the process-wide approval cap is shared across owners and Stop frees a slot", () => {
  const f = fixture();
  for (let n = 1; n <= 50; n++) {
    assert.equal(f.parkAdminApproval({ ...RUN, owner: `owner-${n}`, card: CARD }), `interrupt-${n}`);
  }
  assert.equal(f.parkAdminApproval({ ...RUN, owner: "pending-owner", card: CARD }), undefined);
  assert.equal(f.deadlines().length, 50);
  assert.equal(f.settleAdminApprovalsOnStop({ owner: "owner-1", daemonRunId: "daemon-9" }), 1);
  assert.equal(f.parkAdminApproval({ ...RUN, owner: "pending-owner", card: CARD }), "interrupt-52");
  assert.deepEqual(f.peekAdminApproval({ interruptId: "interrupt-52" }), {
    owner: "pending-owner", threadId: "thread-2", parentRunId: "segment-6", daemonRunId: "daemon-9",
  });
  assert.equal(f.deadlines().length, 50);
  assert.deepEqual(f.answers, []);
});
