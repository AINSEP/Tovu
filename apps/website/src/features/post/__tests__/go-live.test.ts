import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";
import {
  announceDueGoLives,
  announcePendingGoLive,
  goLiveEvent,
  POST_GO_LIVE_LOOKBACK_MS,
  POST_GO_LIVE_SWEEP_INTERVAL_MS,
  startPostGoLiveSweep,
  wentLiveSinceSave,
  type GoLiveCandidatesPort,
} from "../go-live.js";
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
      setInterval: (fn: () => void, ms: number) => { state.tick = fn; state.ms = ms; return { unref: () => { state.unrefed = true; } }; },
      clearInterval: () => { state.cleared = true; },
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("wentLiveSinceSave: only a published, untrashed row saved before a publishAt that has passed", () => {
  assert.equal(wentLiveSinceSave({ post: scheduled(), nowIso: LATER }), true);
  assert.equal(wentLiveSinceSave({ post: scheduled(), nowIso: GO_LIVE }), true, "inclusive at the instant");
  assert.equal(wentLiveSinceSave({ post: scheduled(), nowIso: SAVED }), false, "still scheduled");
  assert.equal(wentLiveSinceSave({ post: scheduled({ status: "draft" }), nowIso: LATER }), false);
  assert.equal(wentLiveSinceSave({ post: scheduled({ deletedAt: LATER }), nowIso: LATER }), false);
  assert.equal(wentLiveSinceSave({ post: scheduled({ publishAt: null }), nowIso: LATER }), false);
  assert.equal(wentLiveSinceSave({ post: scheduled({ updatedAt: LATER }), nowIso: LATER }), false, "saved after go-live: that save announced it");
});

test("goLiveEvent: keyed by the scheduled publication (post + publishAt), not the version, occurring at the go-live instant", () => {
  assert.deepEqual(goLiveEvent({ post: scheduled({ kind: "page", workspaceId: "ws" }) }), {
    id: `p1-entry.published-at-${GO_LIVE}`,
    name: "entry.published",
    occurredAt: GO_LIVE,
    aggregateId: "p1",
    workspaceId: "ws",
    payload: { entryId: "p1", contentType: "page" },
  });
  assert.equal(goLiveEvent({ post: scheduled({ publishAt: null }) }).occurredAt, SAVED);
  assert.equal(goLiveEvent({ post: scheduled({ version: 9 }) }).id, goLiveEvent({ post: scheduled() }).id, "every version of one schedule shares the id");
});

test("announcePendingGoLive: enqueues the go-live event only for a row that went live since its save", async () => {
  const outbox = new RecordingOutbox();
  await announcePendingGoLive({ outbox, post: scheduled(), nowIso: SAVED });
  assert.deepEqual(outbox.enqueued, [], "still scheduled: nothing to announce yet");
  await announcePendingGoLive({ outbox, post: scheduled(), nowIso: LATER });
  assert.deepEqual(outbox.enqueued, [goLiveEvent({ post: scheduled() })]);
});

test("announceDueGoLives enqueues one event per candidate and passes the window through", async () => {
  const repo = new FakeCandidates([scheduled(), scheduled({ id: "p2" })]);
  const outbox = new RecordingOutbox();
  assert.deepEqual(await announceDueGoLives({ deps: { repo, outbox }, input: { workspaceId: "ws", nowIso: LATER } }), { announced: 2 });
  assert.deepEqual(outbox.enqueued.map((event) => event.id), [`p1-entry.published-at-${GO_LIVE}`, `p2-entry.published-at-${GO_LIVE}`]);
  await announceDueGoLives({ deps: { repo, outbox }, input: { workspaceId: "ws", nowIso: LATER } }, { afterIso: GO_LIVE });
  assert.deepEqual(repo.calls, [{ workspaceId: "ws", nowIso: LATER }, { workspaceId: "ws", nowIso: LATER, afterIso: GO_LIVE }]);
});

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
    { timers, onError: (error) => { errors.push(error); throw new Error("reporter broke"); } }
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
