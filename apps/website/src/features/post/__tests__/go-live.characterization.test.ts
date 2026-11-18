import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent, OutboxPort } from "@jini-ai/core/contracts/events";
import {
  announceDueGoLives,
  goLiveEvent,
  POST_GO_LIVE_LOOKBACK_MS,
  wentLiveSinceSave,
  type GoLiveCandidatesPort,
} from "../go-live.js";
import { startPostGoLiveSweep } from "../go-live-sweep.js";
import type { PostRecord } from "../post.js";
import { buildPostRecord } from "./post-record.fixture.js";

/**
 * @file Characterization of the go-live decision and the sweep lifecycle, written BEFORE the sweep
 * moved to its own file (`go-live-sweep.ts`): the instant boundary of the decision, the fact that a
 * pass re-enqueues repeats (de-duplication is the outbox's contract, not this module's), and the two
 * lifecycle guarantees the sweep owns — a failed pass leaves its window start unchanged, and a tick
 * during a pass in flight starts no second pass. Fakes only: a recording outbox, a candidates port,
 * a fixed clock and manual timers.
 */

const SAVED = "2026-10-21T10:00:00.000Z";
const GO_LIVE = "2026-10-21T12:00:00.000Z";
const ONE_MS_BEFORE_GO_LIVE = "2026-10-21T11:59:59.999Z";
const LATER = "2026-10-21T13:00:00.000Z";
const scheduled = (fields: Partial<PostRecord> = {}) => buildPostRecord({ id: "p1", publishAt: GO_LIVE, updatedAt: SAVED, version: 3, ...fields });

/** Keeps EVERY call: it implements no de-duplication, so a test sees what the sweep itself enqueued. */
class RecordingOutbox implements OutboxPort {
  enqueued: DomainEvent[] = [];
  async enqueue(event: DomainEvent): Promise<void> { this.enqueued.push(event); }
  async claimPending(): Promise<never[]> { return []; }
  async markDelivered(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

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

function manualTimers() {
  const state = { tick: undefined as (() => void) | undefined };
  return {
    state,
    timers: {
      setInterval: ({ fn }: { fn: () => void; ms: number }) => { state.tick = fn; return { unref: () => {} }; },
      clearInterval: () => {},
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("decision: a post whose publishAt equals now is live; one millisecond earlier it is not yet", () => {
  assert.equal(wentLiveSinceSave({ post: scheduled(), nowIso: GO_LIVE }), true);
  assert.equal(wentLiveSinceSave({ post: scheduled(), nowIso: ONE_MS_BEFORE_GO_LIVE }), false);
});

test("decision: the event id and payload are a golden of post id + publishAt + content type", () => {
  assert.deepEqual(goLiveEvent({ post: scheduled({ workspaceId: "ws", kind: "post" }) }), {
    id: `p1-entry.published-at-${GO_LIVE}`,
    name: "entry.published",
    occurredAt: GO_LIVE,
    aggregateId: "p1",
    workspaceId: "ws",
    payload: { entryId: "p1", contentType: "post" },
  });
});

test("announceDueGoLives enqueues every candidate each time it runs; the two calls carry equal event ids", async () => {
  const repo = new FakeCandidates([scheduled()]);
  const outbox = new RecordingOutbox();
  const input = { workspaceId: "ws", nowIso: LATER };
  assert.deepEqual(await announceDueGoLives({ deps: { repo, outbox }, input }), { announced: 1 });
  assert.deepEqual(await announceDueGoLives({ deps: { repo, outbox }, input }), { announced: 1 });
  assert.equal(outbox.enqueued.length, 2, "no de-duplication here: that is the outbox's own contract");
  assert.equal(outbox.enqueued[0]?.id, outbox.enqueued[1]?.id);
});

test("lifecycle: a failed pass leaves the window start unchanged, so the next tick retries the same range", async () => {
  const repo = new FakeCandidates([scheduled()]);
  let now = Date.parse(GO_LIVE);
  const { state, timers } = manualTimers();
  const sweep = startPostGoLiveSweep(
    { deps: { repo, outbox: new RecordingOutbox(), clock: { nowMs: () => now } }, workspaceId: "ws" },
    { timers, onError: () => {} }
  );
  await settle();
  const afterFirstSuccess = new Date(Date.parse(GO_LIVE) - POST_GO_LIVE_LOOKBACK_MS).toISOString();

  repo.failing = true;
  now = Date.parse(LATER);
  state.tick?.();
  await settle();
  now = Date.parse(LATER) + 60_000;
  state.tick?.();
  await settle();
  assert.deepEqual(
    repo.calls.slice(1).map((call) => call.afterIso),
    [afterFirstSuccess, afterFirstSuccess],
    "both failed passes asked for the window the last SUCCESSFUL pass left behind"
  );
  await sweep.stop();
});

test("lifecycle: the first pass runs at once, a tick during an active pass starts no second pass, and none starts after stop", async () => {
  const repo = new FakeCandidates();
  let release!: () => void;
  repo.gate = new Promise<void>((resolve) => { release = resolve; });
  const { state, timers } = manualTimers();
  const sweep = startPostGoLiveSweep({ deps: { repo, outbox: new RecordingOutbox(), clock: { nowMs: () => Date.parse(LATER) } }, workspaceId: "ws" }, { timers });
  assert.equal(repo.calls.length, 1, "the first pass starts immediately, before any tick");
  state.tick?.();
  state.tick?.();
  assert.equal(repo.calls.length, 1, "ticks while a pass is active start no second pass");
  const stopped = sweep.stop();
  let settled = false;
  void stopped.then(() => { settled = true; });
  await settle();
  assert.equal(settled, false, "stop resolves only after the active pass settles");
  release();
  await stopped;
  state.tick?.();
  await settle();
  assert.equal(repo.calls.length, 1, "no pass starts after stop");
});
