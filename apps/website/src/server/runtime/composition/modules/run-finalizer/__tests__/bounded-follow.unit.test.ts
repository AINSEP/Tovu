import assert from "node:assert/strict";
import test from "node:test";

import type { RunDaemonClient } from "../../run-daemon-http-client.js";
import { createFollower, type FollowerPorts } from "../bounded-follow.js";
import type { StreamResult } from "../stream.js";
import { makeWatch, type Watch } from "../watch-state.js";

/**
 * @file The bounded follower driven directly: a stream that stays quiet past the resolution
 * deadline, a status probe the test answers, and recording settle/recover/retain ports.
 */

const RUN = "run-1";
const realTimers: FollowerPorts["timers"] = {
  schedule: ({ delayMs, run }) => { const handle = setTimeout(run, delayMs); return () => { clearTimeout(handle); }; },
};

function quietRun({ runStatus }: { runStatus: (watch: () => Watch) => Promise<number | null> }) {
  let current!: Watch;
  const daemon: RunDaemonClient = {
    openEvents: async () => { throw new Error("the follower reads through the injected stream port"); },
    runStatus: () => runStatus(() => current),
  };
  current = makeWatch({
    principalId: "owner", conversationId: "chat", runId: RUN, daemon, attemptBase: [], now: Date.now(), resolutionTimeoutMs: 5,
    message: { id: "answer", role: "assistant", content: "", events: [], runId: RUN, runStatus: "running" },
  });
  return current;
}

function recordingPorts(stream: Promise<StreamResult>, { retainLive }: { retainLive: boolean }) {
  const calls: string[] = [];
  const ports: FollowerPorts = {
    stream: { read: () => stream }, now: () => Date.now(), timers: realTimers,
    settings: { reconnectDelayMs: 1, maxReconnects: 3, resolutionTimeoutMs: 5, statusTimeoutMs: 1_000 },
    recoveryAvailable: true,
    settle: async ({ status }) => { calls.push(`settle:${status}`); },
    recoverWatch: async ({ trigger }) => { calls.push(`recover:${trigger}`); },
    retainLive: async () => { calls.push("retain"); return retainLive; },
  };
  return { ports, calls };
}

test("a quiet stream whose live daemon recovery will not retain is stopped and resolved by the timeout recovery", async () => {
  const watch = quietRun({ runStatus: async () => 200 });
  const { ports, calls } = recordingPorts(new Promise<StreamResult>(() => {}), { retainLive: false });
  const outcome = await createFollower(ports).follow({ watch });
  assert.equal(outcome, "interrupted");
  assert.deepEqual(calls, ["retain", "recover:timeout"]);
  assert.equal(watch.abortStream.signal.aborted, true, "the relinquished watch's stream is aborted");
  assert.equal(watch.terminal, true);
});

test("an end frame that lands during the deadline probe outranks the probe's failed answer", async () => {
  let finish!: (result: StreamResult) => void;
  const stream = new Promise<StreamResult>((resolve) => { finish = resolve; });
  const watch = quietRun({ runStatus: async (current) => {
    current().terminal = true;
    finish({ kind: "ended", status: "succeeded" });
    return 503;
  } });
  const { ports, calls } = recordingPorts(stream, { retainLive: true });
  const outcome = await createFollower(ports).follow({ watch });
  assert.equal(outcome, "succeeded");
  assert.deepEqual(calls, ["settle:succeeded"]);
});
