import assert from "node:assert/strict";
import test from "node:test";
import type { OutboxPort } from "@jini-ai/core/contracts/events";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import type { Tracker } from "@jini-ai/core/contracts/site/diagnostics-observability";

import { startPostGoLiveSweep } from "../go-live-sweep.js";

const outbox: OutboxPort = {
  async enqueue() {},
  async claimPending() { return []; },
  async markDelivered() {},
  async markFailed() {},
};

test("one go-live pass traces post.go_live.sweep", async () => {
  const names: string[] = [];
  let calls = 0;
  const tracker: Tracker = {
    ...createNoopTracker({}),
    async trace({ name, run }) { names.push(name); return run({ setOutcome() {} }); },
  };
  const sweep = startPostGoLiveSweep({
    deps: { repo: { async listGoLiveCandidates() { calls++; return []; } }, outbox, clock: { nowMs: () => Date.parse("2026-10-21T12:00:00.000Z") } },
    workspaceId: "ws",
  }, { tracker, timers: { setInterval: () => ({}), clearInterval() {} } });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(names, ["post.go_live.sweep"]);
    assert.equal(calls, 1);
  } finally {
    await sweep.stop();
  }
});

test("a rejected go-live pass reports and retries the same watermark", async () => {
  const names: string[] = [], errors: unknown[] = [];
  const requests: Array<{ workspaceId: string; nowIso: string; afterIso?: string }> = [];
  const failure = new Error("db locked");
  let failing = false, now = Date.parse("2026-10-21T12:00:00.000Z");
  let tick!: () => void;
  const tracker: Tracker = {
    ...createNoopTracker({}),
    async trace({ name, run }) { names.push(name); return run({ setOutcome() {} }); },
  };
  const repo: Parameters<typeof startPostGoLiveSweep>[0]["deps"]["repo"] = {
    async listGoLiveCandidates(input) { requests.push(input); if (failing) throw failure; return []; },
  };
  const sweep = startPostGoLiveSweep({ deps: { repo, outbox, clock: { nowMs: () => now } }, workspaceId: "ws" }, {
    tracker, onError: ({ error }) => { errors.push(error); },
    timers: { setInterval: ({ fn }) => { tick = fn; return {}; }, clearInterval() {} },
  });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    failing = true; now += 60_000;
    tick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(errors, [failure]);
    failing = false; now += 60_000;
    tick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(requests.length, 3);
    assert.equal(requests[1]?.afterIso, "2026-10-21T11:50:00.000Z");
    assert.equal(requests[2]?.afterIso, requests[1]?.afterIso);
    assert.deepEqual(names, ["post.go_live.sweep", "post.go_live.sweep", "post.go_live.sweep"]);
  } finally {
    await sweep.stop();
  }
});
