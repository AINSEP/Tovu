import assert from "node:assert/strict";
import test from "node:test";
import { createVisitorAgUiResume, VISITOR_APPROVAL_EXPIRED, type HeldVisitorApproval } from "#src/assistant/site/visitor-ag-ui-resume";

const OWNER = { workspaceId: "ws-1", principalId: "guest-1", tabId: "tab-1" };
const CHALLENGE = "c".repeat(22);

/** Real coordinator, fake edges: the clock, the one expiry timer and the bound confirmation op.
 *  `events` records the order of attach/settle/cleanup so ordering mutations are observable. */
function harness({ settle = async () => true }: { settle?: () => Promise<boolean> } = {}) {
  const clock = { now: 1_000 };
  const timers: Array<{ at: number; callback: () => void; cancelled: boolean }> = [];
  const confirms: Array<{ challengeId: string; allow: boolean; owner: unknown }> = [];
  const events: string[] = [];
  const reports: unknown[] = [];
  const coordinator = createVisitorAgUiResume<string>({
    nowMs: () => clock.now,
    scheduler: { schedule: ({ delayMs, callback }) => {
      const timer = { at: clock.now + delayMs, callback, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    } },
    confirm: async (required) => { confirms.push(required); events.push(`settle:${required.allow}`); return settle(); },
    reportError: ({ error }) => { reports.push(error); },
  });
  const held = (quotaKey = "203.0.113.9"): HeldVisitorApproval<string> => ({
    quotaKey,
    attach: ({ segment }) => { events.push(`attach:${segment}`); },
    cleanup: ({ reason }) => { events.push(`cleanup:${reason}`); },
  });
  const park = (over: Record<string, unknown> = {}) => coordinator.parkVisitorApproval({
    owner: OWNER, threadId: "thread-1", runId: "run-1", interruptId: CHALLENGE, held: held(), abandonAtMs: clock.now + 60_000, ...over,
  });
  const fireDue = () => { for (const timer of timers) if (!timer.cancelled && timer.at <= clock.now) { timer.cancelled = true; timer.callback(); } };
  return { clock, confirms, events, reports, coordinator, park, held, fireDue };
}

function resumeInput({ threadId = "thread-1", parentRunId = "run-1", interruptId = CHALLENGE, status = "resolved", payload = "allow" as unknown, runId = "run-2" } = {}) {
  return { threadId, runId, parentRunId, state: {}, messages: [], tools: [], context: [], forwardedProps: {},
    resume: [{ interruptId, status, ...(payload === undefined ? {} : { payload }) }] };
}
const attachResponse = ({ runId }: { runId: string }) => `segment:${runId}`;

test("accept resumes the parked call exactly once", async () => {
  const h = harness();
  assert.equal(h.park(), true);
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "resumed");
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "expired");
  assert.deepEqual(h.confirms, [{ challengeId: CHALLENGE, allow: true, owner: OWNER }]);
  // Claim, attach the replacement writer, THEN settle: the resumed output has somewhere to go.
  assert.deepEqual(h.events, ["attach:segment:run-2", "settle:true"]);
});

test("decline runs nothing", async () => {
  // `cancelled` is a deny too, but it ends the held call instead of continuing it: see the Stop test below.
  for (const answer of [{ payload: "deny" }, { payload: "dismissed" }]) {
    const h = harness();
    h.park();
    assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(answer), owner: OWNER, attachResponse }), "resumed");
    assert.deepEqual(h.confirms.map((c) => c.allow), [false], JSON.stringify(answer));
  }
  // An unrecognized payload is no answer at all — refused, and the claim stays for the real answer.
  const h = harness();
  h.park();
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput({ payload: "yes please" }), owner: OWNER, attachResponse }), "expired");
  assert.equal(h.confirms.length, 0);
});

test("expired resume is refused in plain words", async () => {
  const h = harness();
  h.park();
  h.clock.now += 60_001; // past the deadline, timer not yet fired: the claim itself must check time
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "expired");
  assert.equal(h.confirms.length, 0);
  assert.equal(VISITOR_APPROVAL_EXPIRED, "This request expired. Ask again.");
  h.fireDue();
  // Expiry abandons through the shared cleanup: the parked call is denied, never allowed.
  assert.deepEqual(h.events, ["settle:false", "cleanup:expired"]);
});

test("another visitor or owner cannot resume", async () => {
  const h = harness();
  h.park();
  const foreign = [
    { owner: { ...OWNER, workspaceId: "ws-2" }, input: resumeInput() },
    { owner: { ...OWNER, tabId: "tab-2" }, input: resumeInput() },
    { owner: { ...OWNER, principalId: "guest-2" }, input: resumeInput() },
    { owner: OWNER, input: resumeInput({ threadId: "thread-2" }) },
    { owner: OWNER, input: resumeInput({ parentRunId: "run-9" }) },
    { owner: OWNER, input: resumeInput({ interruptId: "d".repeat(22) }) },
    // The body cannot name its own owner: a request-supplied owner is ignored entirely.
    { owner: { ...OWNER, tabId: "tab-2" }, input: { ...resumeInput(), forwardedProps: { owner: OWNER } } },
  ];
  for (const { owner, input } of foreign) {
    assert.equal(await h.coordinator.resumeVisitorApproval({ input, owner, attachResponse }), "expired", JSON.stringify({ owner, input }));
  }
  assert.equal(h.confirms.length, 0);
  // None of those consumed the legitimate owner's claim.
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "resumed");
});

test("resume without an authenticated owner refuses without consuming the claim", async () => {
  const h = harness();
  h.park();
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: null, attachResponse }), "expired");
  assert.deepEqual(h.events, []);
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "resumed");
});

test("replayed resume does nothing", async () => {
  const pending: Array<(value: boolean) => void> = [];
  const h = harness({ settle: () => new Promise<boolean>((resolve) => { pending.push(resolve); }) });
  h.park();
  const first = h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse });
  const replay = h.coordinator.resumeVisitorApproval({ input: resumeInput({ runId: "run-3" }), owner: OWNER, attachResponse });
  assert.equal(await replay, "expired");
  for (const resolve of pending) resolve(true);
  assert.equal(await first, "resumed");
  assert.equal(h.confirms.length, 1);
  assert.deepEqual(h.events, ["attach:segment:run-2", "settle:true"]);
});

test("stop and a racing resume cannot both claim the parked call", async () => {
  const resumedFirst = harness();
  resumedFirst.park();
  const resuming = resumedFirst.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse });
  resumedFirst.coordinator.abandonVisitorApproval({ interruptId: CHALLENGE, reason: "stopped" });
  assert.equal(await resuming, "resumed");
  assert.deepEqual(resumedFirst.events, ["attach:segment:run-2", "settle:true"]);

  const stoppedFirst = harness();
  stoppedFirst.park();
  stoppedFirst.coordinator.abandonVisitorApproval({ interruptId: CHALLENGE, reason: "stopped" });
  assert.equal(await stoppedFirst.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "expired");
  stoppedFirst.coordinator.abandonVisitorApproval({ interruptId: CHALLENGE, reason: "shutdown" });
  assert.deepEqual(stoppedFirst.events, ["settle:false", "cleanup:stopped"]);
});

test("park keeps the twenty-held and two-per-address caps", () => {
  const h = harness();
  const id = (n: number) => `${String(n).padStart(2, "0")}${"x".repeat(20)}`;
  assert.equal(h.park({ interruptId: id(0) }), true);
  assert.equal(h.park({ interruptId: id(1) }), true);
  assert.equal(h.park({ interruptId: id(2) }), false, "a third from one address");
  for (let n = 3; n < 21; n++) assert.equal(h.park({ interruptId: id(n), held: h.held(`198.51.100.${n}`) }), true);
  assert.equal(h.park({ interruptId: id(21), held: h.held("192.0.2.1") }), false, "the twenty-first held");
  h.coordinator.shutdownVisitorApprovals();
  assert.equal(h.events.filter((e) => e === "cleanup:shutdown").length, 20);
});

test("visitor Stop while an approval is parked sends one cancelled resume and runs nothing", async () => {
  const h = harness();
  h.park();
  const cancelled = resumeInput({ status: "cancelled", payload: undefined });
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: cancelled, owner: OWNER, attachResponse }), "stopped");
  // Deny once, then end the held execution: no writer is attached, so no continuation can run.
  assert.deepEqual(h.events, ["settle:false", "cleanup:stopped"]);
  assert.deepEqual(h.confirms, [{ challengeId: CHALLENGE, allow: false, owner: OWNER }]);
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "expired");
  h.clock.now += 120_000;
  h.fireDue();
  assert.deepEqual(h.events, ["settle:false", "cleanup:stopped"], "the expiry timer was cleared: nothing ends twice");
});

test("a cancelled resume from another owner stops nothing", async () => {
  const h = harness();
  h.park();
  const cancelled = resumeInput({ status: "cancelled", payload: undefined });
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: cancelled, owner: { ...OWNER, tabId: "tab-2" }, attachResponse }), "expired");
  assert.deepEqual(h.events, []);
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "resumed");
});

test("malformed resume envelopes never attach or consume the parked approval", async () => {
  const h = harness();
  assert.equal(h.park(), true);
  const valid = resumeInput();
  for (const input of [
    null, "resume", { ...valid, resume: {} }, { ...valid, resume: [] },
    { ...valid, resume: [...valid.resume, ...valid.resume] }, { ...valid, resume: [null] },
    { ...valid, resume: [{ ...valid.resume[0], interruptId: "x".repeat(129) }] },
    { ...valid, runId: 123 }, { ...valid, runId: "" }, { ...valid, runId: "x".repeat(129) },
    { ...valid, runId: "run-1" },
  ]) {
    assert.equal(await h.coordinator.resumeVisitorApproval({ input, owner: OWNER, attachResponse }), "expired", JSON.stringify(input));
    assert.deepEqual(h.events, []);
  }
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: valid, owner: OWNER, attachResponse: ids => {
    assert.deepEqual(ids, { threadId: "thread-1", parentRunId: "run-1", runId: "run-2" });
    return "new-segment";
  } }), "resumed");
  assert.deepEqual(h.events, ["attach:new-segment", "settle:true"]);
});

test("a bound exchange that already ended cleans up the attached segment without denying twice", async () => {
  const h = harness({ settle: async () => false });
  assert.equal(h.park(), true);
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "expired");
  h.clock.now += 120_000;
  h.fireDue();
  assert.deepEqual(h.events, ["attach:segment:run-2", "settle:true", "cleanup:expired"]);
});

test("a failed shutdown denial is reported while the parked execution is still cleaned up", async () => {
  const error = new Error("confirmation backend closed");
  const h = harness({ settle: () => Promise.reject(error) });
  assert.equal(h.park(), true);
  h.coordinator.shutdownVisitorApprovals();
  assert.equal(await h.coordinator.resumeVisitorApproval({ input: resumeInput(), owner: OWNER, attachResponse }), "expired");
  assert.deepEqual(h.confirms, [{ challengeId: CHALLENGE, owner: OWNER, allow: false }]);
  assert.deepEqual(h.events, ["settle:false", "cleanup:shutdown"]);
  // The denial is fire-and-forget: its rejection reaches reportError on a later microtask.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.reports, [error]);
});
