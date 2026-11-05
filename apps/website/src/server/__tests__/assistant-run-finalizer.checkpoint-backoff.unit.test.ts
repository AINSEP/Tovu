import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type { ChatRunLedger } from "#src/assistant/index";
import { createAssistantRunFinalizer, type AssistantRunFinalizerOptions } from "../runtime/composition/modules/assistant-run-finalizer.js";

/**
 * @file Memory cause 3: a run's checkpoint rewrites its whole saved projection, so once that
 * projection is many MB a once-per-second checkpoint churns ~100 MB/s. The finalizer backs off to
 * a longer interval for large payloads; small runs keep the 1 s cadence exactly.
 *
 * The clock is injected (`now`) and advanced 100 ms per daemon frame by the stream itself, so a
 * 20 s window is replayed deterministically in milliseconds. Trailing timers are mocked and never
 * fire: only the frame-driven checkpoints inside the window are counted.
 */

const encoder = new TextEncoder();
/** The response pipe reads one frame ahead, so the first frame is consumed at +100 ms. */
const READ_AHEAD_MS = 100;
const every = (intervalMs: number, count: number) => Array.from({ length: count }, (_, i) => READ_AHEAD_MS + i * intervalMs);
const frame = (kind: string, payload: unknown) => `event: ${kind}\ndata: ${JSON.stringify({ runId: "run-1", kind, payload })}\n\n`;
const text = (delta: string) => frame("agent", { type: "text_delta", delta });

/** A daemon stream that advances `clock` by `stepMs` before each frame after the first. */
function clockedStream({ frames, clock, stepMs }: { frames: string[]; clock: { now: number }; stepMs: number }): Response {
  let next = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next >= frames.length) { controller.close(); return; }
      if (next > 0) clock.now += stepMs;
      controller.enqueue(encoder.encode(frames[next]!));
      next += 1;
    },
  }, { highWaterMark: 0 });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Replays a 20 s run (one frame per 100 ms after the `first` frame) and returns the fake-clock
 * time of every checkpoint the finalizer wrote. */
async function checkpointTimes(
  t: TestContext,
  { first, following, settledAt, initialText = "", failFirstCheckpoint = false, options = {} }: {
    first: string; following?: string[]; settledAt?: number[]; initialText?: string;
    failFirstCheckpoint?: boolean; options?: Partial<AssistantRunFinalizerOptions>;
  },
): Promise<number[]> {
  const clock = { now: 1_000_000 };
  const times: number[] = [];
  const ledger = {
    checkpoint: async () => {
      times.push(clock.now - 1_000_000);
      if (failFirstCheckpoint && times.length === 1) throw new Error("storage temporarily unavailable");
      return true;
    },
    settle: async () => { settledAt?.push(clock.now - 1_000_000); return true; },
    reconcileInterrupted: async () => 0,
    unlessSettled: async () => ({ written: false }),
  } as unknown as ChatRunLedger;
  const frames = [first, ...(following ?? Array.from({ length: 200 }, () => text("y"))), frame("end", { code: 0, status: "succeeded" })];
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const finalizer = createAssistantRunFinalizer({
      ledger, now: () => clock.now, reconnectDelayMs: 0,
      scheduler: { schedule: () => () => undefined },
      daemon: { openEvents: async () => clockedStream({ frames, clock, stepMs: 100 }), runStatus: async () => 200 },
      ...options,
    }, {});
    finalizer.watch({ principalId: "admin", conversationId: "chat", message: { id: "a1", role: "assistant", content: initialText, runId: "run-1", runStatus: "running", events: initialText ? [{ kind: "text", text: initialText }] : [] } });
    await finalizer.idle();
  } finally {
    t.mock.timers.reset();
  }
  return times;
}

test("a small run keeps checkpointing once per second (unchanged cadence)", async (t) => {
  const times = await checkpointTimes(t, { first: text("x".repeat(10)) });
  assert.deepEqual(times, every(1_000, 21));
});

test("a run whose saved events reach 5 MB checkpoints every 10 s by default", async (t) => {
  const times = await checkpointTimes(t, { first: text("x".repeat(5_000_001)) });
  // Before the back-off: 21 checkpoints in this 20 s window (one per second). After: 3.
  assert.deepEqual(times, every(10_000, 3));
});

test("the checkpoint interval remains a deterministic test override", async t => {
  const times = await checkpointTimes(t, { first: text("x".repeat(2_000)), options: { checkpointIntervalMs: 2_500 } });
  assert.deepEqual(times, every(2_500, 9));
});

test("payload size counts nested tool input, not only text", async (t) => {
  const tool = frame("agent", { type: "tool_use", id: "t1", name: "write_file", input: { body: "x".repeat(5_000_001), lines: 5, flags: [null, true] } });
  const times = await checkpointTimes(t, { first: tool });
  assert.deepEqual(times, every(10_000, 3));
});

test("a run whose saved events reach 1 MB checkpoints every 3 s", async (t) => {
  const times = await checkpointTimes(t, { first: text("x".repeat(1_000_000)) });
  assert.deepEqual(times, every(3_000, 7));
});

test("status frames and empty deltas do not checkpoint unchanged content", async (t) => {
  const following = Array.from({ length: 200 }, (_, i) => i % 2 === 0
    ? frame("agent", { type: "status", label: `waiting ${i}` }) : text(""));
  assert.deepEqual(await checkpointTimes(t, { first: text("answer"), following }), [READ_AHEAD_MS]);
});

test("status-only output never writes a periodic checkpoint", async (t) => {
  const status = frame("agent", { type: "status", label: "working" });
  assert.deepEqual(await checkpointTimes(t, { first: status, following: Array(30).fill(status) }), []);
});

test("new tool calls and results qualify without new answer text", async (t) => {
  const status = frame("agent", { type: "status", label: "waiting" });
  const following = [
    ...Array(10).fill(status),
    frame("agent", { type: "tool_use", id: "t1", name: "read_file", input: {} }),
    ...Array(10).fill(status),
    frame("agent", { type: "tool_result", toolUseId: "t1", content: "done" }),
    ...Array(10).fill(status),
  ];
  const times = await checkpointTimes(t, { first: text("answer"), following });
  assert.equal(times.length, 3);
});

test("repeated tool identities do not count as new progress", async (t) => {
  const tool = frame("agent", { type: "tool_use", id: "t1", name: "read_file", input: {} });
  assert.deepEqual(await checkpointTimes(t, { first: tool, following: Array(30).fill(tool) }), [READ_AHEAD_MS]);
});

test("a run end settles immediately inside the scaled checkpoint interval", async (t) => {
  const settledAt: number[] = [];
  const times = await checkpointTimes(t, {
    first: text("x".repeat(5_000_000)), following: [text("final suffix")], settledAt,
  });
  assert.deepEqual(times, [READ_AHEAD_MS]);
  // The end arrives at 200 ms, well before the next 10 s checkpoint; no timer needs to fire.
  assert.deepEqual(settledAt, [200]);
});


test("a failed checkpoint retries without new meaningful progress", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const status = frame("agent", { type: "status", label: "waiting" });
  const times = await checkpointTimes(t, { first: text("answer"), following: Array(30).fill(status), failFirstCheckpoint: true });
  assert.deepEqual(times, [READ_AHEAD_MS, READ_AHEAD_MS + 1_000]);
});


test("a compacted text event can grow without increasing event count", async (t) => {
  const status = frame("agent", { type: "status", label: "waiting" });
  const times = await checkpointTimes(t, {
    initialText: "prior", first: text("prior plus growth"), following: Array(30).fill(status),
  });
  assert.deepEqual(times, [READ_AHEAD_MS]);
});

test("the watch passes only its last successful persisted length to the next checkpoint", async (t) => {
  const expected: Array<number | undefined> = [];
  const ledger: Partial<ChatRunLedger> = {
    async checkpoint(progress, options = {}) {
      expected.push(options.expected);
      options.onPersisted?.({ ...progress, version: 'fake-receipt', length: 123, contentLength: progress.content.length, tailLength: 1, tail: ']' });
      return true;
    },
    settle: async () => true,
  };
  await checkpointTimes(t, { first: text('answer'), options: { ledger: ledger as ChatRunLedger } });
  assert.equal(expected[0], undefined);
  assert.ok(expected.length > 1);
  assert.deepEqual(expected.slice(1), Array(expected.length - 1).fill(123));
});

test("a terminal frame settles while a delta checkpoint is still pending", async (t) => {
  let release!: () => void;
  const pending = new Promise<boolean>(resolve => { release = () => resolve(true); });
  let settled = false;
  const ledger: Partial<ChatRunLedger> = {
    checkpoint: async () => pending,
    settle: async () => { settled = true; release(); return true; },
  };
  await checkpointTimes(t, { first: text('answer'), following: [text('tail')], options: { ledger: ledger as ChatRunLedger } });
  assert.equal(settled, true);
});

test('thinking-only growth is checkpointed before any answer text', async t => {
  const thinking = (delta: string) => frame('agent', { type: 'thinking_delta', delta });
  assert.deepEqual(await checkpointTimes(t, { first: thinking('think'), following: Array.from({ length: 20 }, () => thinking('more')) }), every(1_000, 3));
});

test('a mid-run user receipt triggers a checkpoint without answer/tool growth', async t => {
  const receipt = frame('agent', { type: 'user_message', id: 'u2', content: 'follow-up' });
  assert.deepEqual(await checkpointTimes(t, { first: receipt, following: [] }), [READ_AHEAD_MS]);
});
