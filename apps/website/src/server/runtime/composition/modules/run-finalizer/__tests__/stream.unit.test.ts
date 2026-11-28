import assert from "node:assert/strict";
import test from "node:test";

import { end, frame, text } from "../../../../../__tests__/run-finalizer-characterization.fixture.js";
import type { RunDaemonClient } from "../../run-daemon-http-client.js";
import type { Checkpointer } from "../checkpointer.js";
import { createStreamReader } from "../stream.js";
import { makeWatch, type Watch } from "../watch-state.js";

/**
 * @file One events connection read directly: a real SSE body, a recording checkpointer, and the
 * watch the finalizer would hand the reader.
 */

const RUN = "run-1";

function watchOver(body: string): Watch {
  const daemon: RunDaemonClient = {
    openEvents: async () => new Response(body, { status: 200 }),
    runStatus: async () => { throw new Error("the stream reader never probes"); },
  };
  return makeWatch({
    principalId: "owner", conversationId: "chat", runId: RUN, daemon, attemptBase: [], now: 0, resolutionTimeoutMs: 60_000,
    message: { id: "answer", role: "assistant", content: "", events: [], runId: RUN, runStatus: "running" },
  });
}

test("an error frame before a succeeded end settles the connection as failed", async () => {
  const frames: number[] = [];
  const checkpointer: Checkpointer = { onFrame: ({ watch }) => { frames.push(watch.events.length); } };
  const watch = watchOver(frame(RUN, "error", { message: "the agent crashed" }) + end(RUN, "succeeded"));
  const result = await createStreamReader({ checkpointer }).read({ watch });
  assert.deepEqual(result, { kind: "ended", status: "failed" });
  assert.equal(watch.failed, true);
  assert.equal(watch.terminal, true);
  assert.equal(frames.length, 1, "only the non-terminal error frame reached the checkpointer");
});

test("an error frame before a canceled end keeps the end's own status", async () => {
  const checkpointer: Checkpointer = { onFrame: () => {} };
  const watch = watchOver(frame(RUN, "error", { message: "stopped" }) + end(RUN, "canceled"));
  assert.deepEqual(await createStreamReader({ checkpointer }).read({ watch }), { kind: "ended", status: "canceled" });
});

test("a stream aborted while a frame is being checkpointed applies no later frame and is dropped", async () => {
  let seen = 0;
  const checkpointer: Checkpointer = { onFrame: ({ watch }) => { seen += 1; watch.abortStream.abort(); } };
  const watch = watchOver(text(RUN, "first") + text(RUN, "second") + end(RUN, "succeeded"));
  const result = await createStreamReader({ checkpointer }).read({ watch });
  assert.deepEqual(result, { kind: "dropped" });
  assert.equal(seen, 1);
  assert.equal(watch.terminal, false, "the end frame after the abort never settled the watch");
  assert.equal(watch.events.length, 1, "only the first frame's event was applied");
});
