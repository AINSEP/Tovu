import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent, OutboxPort } from "@jini-ai/core/contracts/events";
import type { GoLiveCandidatesPort } from "@jini-ai/cms/entries";
import { POST_GO_LIVE_LOOKBACK_MS, POST_GO_LIVE_SWEEP_INTERVAL_MS, startPostGoLiveSweep } from "../go-live-sweep.js";
import type { PostRecord } from "../post.js";
import { buildPostRecord } from "./post-record.fixture.js";

/**
 * @file `go-live.ts` in isolation: the go-live predicate and event, one announce pass, and the
 * sweep's lifecycle (catch-up pass at start, lookback window, single-flight, failure keeps the window,
 * stop waits) — driven by a fake clock and fake timers, never a real interval.
 */

const SAVED = "2026-10-21T10:00:00.000Z";
const GO_LIVE = "2026-10-21T12:00:00.000Z";
const LATER = "2026-10-21T13:00:00.000Z";
const scheduled = (fields: Partial<PostRecord> = {}) => buildPostRecord({ id: "p1", publishAt: GO_LIVE, updatedAt: SAVED, version: 3, ...fields });

class RecordingOutbox implements OutboxPort {
  enqueued: DomainEvent[] = [];
  async enqueue(event: DomainEvent): Promise<void> { this.enqueued.push(event); }
  async claimPending(): Promise<never[]> { return []; }
  async markDelivered(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

/** Records each window it is asked for; answers from `rows` or throws while `failing`. */
class FakeCandidates implements GoLiveCandidatesPort {
  calls: Array<{ workspaceId: string; nowIso: string; afterIso?: string }> = [];
  failing = false;
  gate: Promise<void> | undefined;
  constructor(public rows: PostRecord[] = []) {}
  async listGoLiveCandidates(required: { workspaceId: string; nowIso: string; afterIso?: string }): Promise<PostRecord[]> {
    this.calls.push(required);
    await this.gate;
    if (this.failing) throw new Error("db locked");
    return this.rows;
  }
}

function fakeTimers() {
  const state = { tick: undefined as (() => void) | undefined, ms: 0, cleared: false, unrefed: false };
  return {
    state,
    timers: {
      setInterval: ({ fn, ms }: { fn: () => void; ms: number }) => { state.tick = fn; state.ms = ms; return { unref: () => { state.unrefed = true; } }; },
      clearInterval: () => { state.cleared = true; },
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("the sweep catches up fully at start, then reads only since the previous pass minus the lookback", async () => {
  const repo = new FakeCandidates([scheduled()]);
  const outbox = new RecordingOutbox();
  let now = Date.parse(GO_LIVE);
  const { state, timers } = fakeTimers();
  const sweep = startPostGoLiveSweep({ deps: { repo, outbox, clock: { nowMs: () => now } }, workspaceId: "ws" }, { timers });
  await settle();
  assert.equal(state.ms, POST_GO_LIVE_SWEEP_INTERVAL_MS);
  assert.equal(state.unrefed, true, "never keeps the process alive");
  assert.deepEqual(repo.calls, [{ workspaceId: "ws", nowIso: GO_LIVE }], "boot pass: no lower bound");

  now = Date.parse(LATER);
  state.tick?.();
  await settle();
  assert.deepEqual(repo.calls[1], { workspaceId: "ws", nowIso: LATER, afterIso: new Date(Date.parse(GO_LIVE) - POST_GO_LIVE_LOOKBACK_MS).toISOString() });
  assert.equal(outbox.enqueued.length, 2, "the overlap re-enqueues; the outbox's id makes it a no-op");
  assert.equal(outbox.enqueued[0]?.id, outbox.enqueued[1]?.id);

  await sweep.stop();
  assert.equal(state.cleared, true);
  state.tick?.();
  await settle();
  assert.equal(repo.calls.length, 2, "no pass after stop");
});

test("a tick during a pass in flight is skipped, and stop waits for that pass", async () => {
  const repo = new FakeCandidates([scheduled()]);
  let release!: () => void;
  repo.gate = new Promise<void>((resolve) => { release = resolve; });
  const outbox = new RecordingOutbox();
  const { state, timers } = fakeTimers();
  const sweep = startPostGoLiveSweep({ deps: { repo, outbox, clock: { nowMs: () => Date.parse(LATER) } }, workspaceId: "ws" }, { timers, intervalMs: 5 });
  state.tick?.();
  assert.equal(repo.calls.length, 1, "single-flight");
  const stopped = sweep.stop();
  let done = false;
  void stopped.then(() => { done = true; });
  await settle();
  assert.equal(done, false, "stop waits for the pass in flight");
  release();
  await stopped;
  assert.equal(outbox.enqueued.length, 1);
});

test("a failed pass reports, keeps its window, and a throwing reporter is swallowed", async () => {
  const repo = new FakeCandidates();
  repo.failing = true;
  const errors: unknown[] = [];
  const { state, timers } = fakeTimers();
  const sweep = startPostGoLiveSweep(
    { deps: { repo, outbox: new RecordingOutbox(), clock: { nowMs: () => Date.parse(LATER) } }, workspaceId: "ws" },
    { timers, onError: ({ error }) => { errors.push(error); throw new Error("reporter broke"); } }
  );
  await settle();
  state.tick?.();
  await settle();
  assert.equal(errors.length, 2);
  assert.equal(repo.calls[1]?.afterIso, undefined, "the failed catch-up is retried in full");
  await sweep.stop();
});

test("the default reporter logs; a non-positive interval is refused; default timers start and stop", async () => {
  const repo = new FakeCandidates();
  repo.failing = true;
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const sweep = startPostGoLiveSweep({ deps: { repo, outbox: new RecordingOutbox(), clock: { nowMs: () => Date.parse(LATER) } }, workspaceId: "ws" });
    await settle();
    await sweep.stop();
  } finally {
    console.error = original;
  }
  assert.match(String(logged[0]?.[0]), /post-go-live-sweep/);
  for (const intervalMs of [0, -1, 1.5]) {
    assert.throws(() => startPostGoLiveSweep({ deps: { repo, outbox: new RecordingOutbox(), clock: { nowMs: () => 0 } }, workspaceId: "ws" }, { intervalMs }), RangeError);
  }
});
