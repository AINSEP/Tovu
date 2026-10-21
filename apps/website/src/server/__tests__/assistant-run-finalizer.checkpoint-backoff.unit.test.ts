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
  { first, options = {} }: { first: string; options?: Partial<AssistantRunFinalizerOptions> },
): Promise<number[]> {
  const clock = { now: 1_000_000 };
  const times: number[] = [];
  const ledger = {
    checkpoint: async () => { times.push(clock.now - 1_000_000); return true; },
    settle: async () => true,
    reconcileInterrupted: async () => 0,
    unlessSettled: async () => ({ written: false }),
  } as unknown as ChatRunLedger;
  const frames = [first, ...Array.from({ length: 200 }, () => text("y")), frame("end", { code: 0, status: "succeeded" })];
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const finalizer = createAssistantRunFinalizer({
      ledger, now: () => clock.now, reconnectDelayMs: 0,
      scheduler: { schedule: () => () => undefined },
      daemon: { openEvents: async () => clockedStream({ frames, clock, stepMs: 100 }), runStatus: async () => 200 },
      ...options,
    }, {});
    finalizer.watch({ principalId: "admin", conversationId: "chat", message: { id: "a1", role: "assistant", content: "", runId: "run-1", runStatus: "running", events: [] } });
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

test("a run whose saved events exceed 5 MB checkpoints every 5 s by default", async (t) => {
  const times = await checkpointTimes(t, { first: text("x".repeat(5_000_001)) });
  // Before the back-off: 21 checkpoints in this 20 s window (one per second). After: 5.
  assert.deepEqual(times, every(5_000, 5));
});

test("the size threshold and the large-payload interval are host-configurable", async (t) => {
  const times = await checkpointTimes(t, { first: text("x".repeat(2_000)), options: { largeCheckpointBytes: 1_000, largeCheckpointIntervalMs: 2_500 } });
  assert.deepEqual(times, every(2_500, 9));
  // 700 + 200 one-char deltas stays under the 1000 threshold: the normal interval applies.
  const under = await checkpointTimes(t, { first: text("x".repeat(700)), options: { largeCheckpointBytes: 1_000, largeCheckpointIntervalMs: 2_500, checkpointIntervalMs: 4_000 } });
  assert.deepEqual(under, every(4_000, 6));
});

test("payload size counts nested tool input, not only text", async (t) => {
  const tool = frame("agent", { type: "tool_use", id: "t1", name: "write_file", input: { body: "x".repeat(2_000), lines: 5, flags: [null, true] } });
  const times = await checkpointTimes(t, { first: tool, options: { largeCheckpointBytes: 1_000, largeCheckpointIntervalMs: 2_500 } });
  assert.deepEqual(times, every(2_500, 9));
});
