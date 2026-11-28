import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import express, { type Response } from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { VISITOR_TOOL_REFUSAL } from "#src/assistant/site/visitor-executor";

import { createVisitorAgUiResume, type HeldVisitorApproval } from "#src/assistant/site/visitor-ag-ui-resume";
import type { VisitorConfirmations } from "#src/assistant/site/visitor-confirmations";
import { agUiApprovalChannel, createVisitorTurnSegments, handleVisitorAgUiResume, watchSegmentClose, type VisitorResumePorts, type VisitorSegment } from "../site-assistant-ag-ui-approval.js";

/**
 * The visitor Ask channel over the REAL park/resume (its per-client cap of two held approvals and its
 * pause store); only the HTTP response, the writer and the confirmation exchange are recorded fakes.
 */

const OWNER = { workspaceId: "ws-visitor", principalId: "visitor-7", tabId: "tab-3" };
const QUOTA_KEY = "203.0.113.9";

/** A response that records `end()` and emits `close` like Node's, nothing else. */
function fakeSegment({ runId }: { runId: string }) {
  const emitter = new EventEmitter();
  const interrupts: unknown[] = [];
  let ended = 0;
  const res = Object.assign(emitter, {
    writableEnded: false,
    end() { ended += 1; res.writableEnded = true; return res; },
  });
  const writer = {
    start: () => {}, text: () => {}, directive: () => {}, finish: () => {}, settle: () => {},
    interrupt: (required: unknown) => { interrupts.push(required); },
  };
  // The channel only calls `end()` and `on("close")` on the segment's response.
  const segment: VisitorSegment = { res: res as unknown as Response, writer, runId };
  return { segment, interrupts, ended: () => ended };
}

function recordingConfirmations() {
  const confirms: unknown[] = [];
  const confirmations: VisitorConfirmations = {
    request: async () => true,
    confirm: async (required) => { confirms.push(required); return true; },
  };
  return { confirmations, confirms };
}

function harness() {
  const scheduled: number[] = [];
  const resume = createVisitorAgUiResume<VisitorSegment>({
    nowMs: () => 1_000, scheduler: { schedule: ({ delayMs }) => { scheduled.push(delayMs); return () => {}; } },
    confirm: async () => true, reportError: () => {},
  });
  const { segment, interrupts, ended } = fakeSegment({ runId: "run-visitor-1" });
  const segments = createVisitorTurnSegments({ initial: segment });
  const { confirmations, confirms } = recordingConfirmations();
  const abort = new AbortController();
  const channel = agUiApprovalChannel({ confirmations, resume, segments, owner: OWNER, quotaKey: QUOTA_KEY,
    threadId: "thread-visitor", nowMs: () => 1_000, waitMs: 45_000, abort });
  return { resume, segments, channel, confirms, interrupts, ended, scheduled, abort };
}

const otherHeld = (): HeldVisitorApproval<VisitorSegment> => ({ quotaKey: QUOTA_KEY, attach: () => {}, cleanup: () => {} });

test("a visitor whose client already holds two approvals is denied the third instead of being parked", async () => {
  const h = harness();
  for (const interruptId of ["held-a", "held-b"]) {
    assert.equal(h.resume.parkVisitorApproval({ owner: OWNER, threadId: "thread-other", runId: "run-other",
      interruptId, held: otherHeld(), abandonAtMs: 9_000 }), true);
  }
  h.channel.confirmation!.emit({ kind: "tool_confirmation", challengeId: "challenge-third", title: "Send form", summary: "to the owner" });
  await Promise.resolve();
  assert.deepEqual(h.confirms, [{ challengeId: "challenge-third", allow: false, owner: OWNER }]);
  // Not parked: the segment keeps streaming, no pause terminal, the response stays open.
  assert.equal(h.segments.parked, false);
  assert.deepEqual(h.interrupts, []);
  assert.equal(h.ended(), 0);
  assert.equal(h.abort.signal.aborted, false);
});

test("an accepted approval parks the turn, writes one interrupt naming the card and ends the segment", () => {
  const h = harness();
  h.channel.confirmation!.emit({ kind: "tool_confirmation", challengeId: "challenge-1", title: "Send form", summary: "to the owner" });
  assert.equal(h.segments.parked, true);
  assert.deepEqual(h.interrupts, [{ interrupt: { id: "challenge-1", reason: "confirmation", message: "Send form: to the owner" } }]);
  assert.equal(h.ended(), 1);
  assert.deepEqual(h.scheduled, [45_000]);
  assert.deepEqual(h.confirms, []);
});

test("a segment the visitor drops ends the turn's run; a segment we ended ourselves does not", () => {
  const dropped = fakeSegment({ runId: "run-dropped" });
  const droppedAbort = new AbortController();
  watchSegmentClose({ segment: dropped.segment, abort: droppedAbort });
  (dropped.segment.res as unknown as EventEmitter).emit("close");
  assert.equal(droppedAbort.signal.aborted, true, "the visitor left mid-segment: the run stops");

  const finished = fakeSegment({ runId: "run-finished" });
  const finishedAbort = new AbortController();
  watchSegmentClose({ segment: finished.segment, abort: finishedAbort });
  finished.segment.res.end();
  (finished.segment.res as unknown as EventEmitter).emit("close");
  assert.equal(finishedAbort.signal.aborted, false, "our own end is not a Stop");
});

test("without an approval owner there is no Ask channel", () => {
  const { segment } = fakeSegment({ runId: "run-ownerless" });
  const resume = createVisitorAgUiResume<VisitorSegment>({ nowMs: () => 1_000, scheduler: { schedule: () => () => {} }, confirm: async () => true, reportError: () => {} });
  const channel = agUiApprovalChannel({ confirmations: recordingConfirmations().confirmations, resume, segments: createVisitorTurnSegments({ initial: segment }),
    owner: null, quotaKey: QUOTA_KEY, threadId: "thread-visitor", nowMs: () => 1_000, waitMs: 45_000, abort: new AbortController() });
  assert.deepEqual(channel, {});
});

/** A resume route over recording ports: every later gate records that it was reached. */
async function resumeRoute(t: import("node:test").TestContext, gates: { allowed: boolean; enabled: boolean }) {
  const reached: string[] = [];
  const ports: VisitorResumePorts = {
    limiter: { check: async ({ key }) => { reached.push(`limiter:${key === "" ? "empty" : "ip"}`); return gates.allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: 30 }; } },
    enabled: async () => { reached.push("enabled"); return gates.enabled; },
    allowsOrigin: async () => { reached.push("origin"); return true; },
    resolveApprovalOwner: async () => { reached.push("owner"); return null; },
    resume: { resumeVisitorApproval: async () => { reached.push("resume"); return "expired"; } } as unknown as VisitorResumePorts["resume"],
    openSegment: () => { reached.push("segment"); return assert.fail("no segment opens for a refused resume"); },
  };
  const app = express();
  app.use(express.json());
  app.post("/chat", (req, res) => { void handleVisitorAgUiResume({ req, res, ports }); });
  const baseUrl = await startTestServer(app, t);
  const response = await fetch(`${baseUrl}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resume: [] }) });
  return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() as unknown, reached };
}

test("a rate-limited resume is the 429 refusal before the enabled check, the owner lookup or any claim", async (t) => {
  const answer = await resumeRoute(t, { allowed: false, enabled: true });
  assert.deepEqual(answer, { status: 429, cache: "no-store", body: { error: VISITOR_TOOL_REFUSAL }, reached: ["limiter:ip"] });
});

test("a resume while visitor chat is turned off is the 404 refusal before the origin check, the owner lookup or any claim", async (t) => {
  const answer = await resumeRoute(t, { allowed: true, enabled: false });
  assert.deepEqual(answer, { status: 404, cache: "no-store", body: { error: VISITOR_TOOL_REFUSAL }, reached: ["limiter:ip", "enabled"] });
});
