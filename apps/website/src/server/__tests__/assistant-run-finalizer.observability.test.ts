import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";

import type { ChatMessage } from "@jini-ai/chat/core";

import { createAssistantRunFinalizer, type RunDaemonClient } from "../runtime/composition/modules/assistant-run-finalizer.js";
import { createNoopObservabilityPort, type AgentRunStatus, type ObservabilityPort } from "#src/platform/observability/index";
import type { ChatRunLedger } from "../../assistant/index.js";

/**
 * @file The finalizer is the API-side seam that sees every daemon run's terminal outcome, so it is
 * where `trackAgentRun` is recorded: one tracked run per watched run, ended with the outcome the
 * finalizer itself proved (succeeded/failed/canceled from the `end` frame, interrupted on a 404,
 * abandoned on reconnect exhaustion), and the follow loop runs inside the run's scope so its
 * ledger writes nest under the run span.
 */

interface Recorded {
  runId: string;
  conversationId: string | undefined;
  outcome?: { status: AgentRunStatus; error?: unknown };
  ranInside: boolean;
}

function recordingPort(): { port: ObservabilityPort; runs: Recorded[]; inside: () => boolean } {
  const runs: Recorded[] = [];
  // Async scope, like the real adapter's: the follow loop awaits, so a sync flag would read false.
  const scope = new AsyncLocalStorage<true>();
  const port: ObservabilityPort = {
    ...createNoopObservabilityPort({}),
    trackAgentRun({ runId }, { conversationId } = {}) {
      const record: Recorded = { runId, conversationId, ranInside: false };
      runs.push(record);
      return {
        run<T>(fn: () => T): T {
          record.ranInside = true;
          return scope.run(true, fn);
        },
        end(outcome) {
          record.outcome = outcome;
        },
      };
    },
  };
  return { port, runs, inside: () => scope.getStore() === true };
}

/** The finalizer writes through `settle`/`checkpoint` only; the fake records the settled status. */
function fakeLedger(options: { failSettle?: boolean } = {}): ChatRunLedger & { settled: string[] } {
  const settled: string[] = [];
  const ledger = {
    settled,
    async settle(input: { status: string }) {
      if (options.failSettle) throw new Error("SQLITE_FULL: database or disk is full");
      settled.push(input.status);
    },
    async checkpoint() {},
  };
  return ledger as unknown as ChatRunLedger & { settled: string[] };
}

const frame = (kind: string, payload: unknown) => `event: ${kind}\ndata: ${JSON.stringify({ runId: "run-1", kind, payload })}\n\n`;
const stream = (...chunks: string[]) => new Response(chunks.join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const daemon = (events: () => Response, runStatus: number | null = 200): RunDaemonClient => ({ openEvents: async () => events(), runStatus: async () => runStatus });
const stub: ChatMessage = { id: "a1", role: "assistant", content: "", runId: "run-1", runStatus: "running" } as ChatMessage;

async function watchOnce(input: { daemon: RunDaemonClient; ledger?: ChatRunLedger & { settled: string[] } }) {
  const { port, runs } = recordingPort();
  const ledger = input.ledger ?? fakeLedger();
  const finalizer = createAssistantRunFinalizer({ ledger, daemon: input.daemon, observability: port, reconnectDelayMs: 1, maxReconnects: 1, checkpointIntervalMs: 0 });
  finalizer.watch({ principalId: "p1", conversationId: "conv-1", message: stub });
  await finalizer.idle();
  return { runs, ledger };
}

for (const status of ["succeeded", "failed", "canceled"] as const) {
  test(`an end frame with status ${status} ends the tracked run ${status}, with run and conversation ids`, async () => {
    const { runs, ledger } = await watchOnce({ daemon: daemon(() => stream(frame("start", { agentId: "claude" }), frame("end", { code: 0, status }))) });
    assert.deepEqual(ledger.settled, [status]);
    assert.deepEqual(runs, [{ runId: "run-1", conversationId: "conv-1", ranInside: true, outcome: { status } }]);
  });
}

test("a run the daemon no longer knows (404) is tracked as interrupted", async () => {
  const { runs } = await watchOnce({ daemon: daemon(() => new Response("", { status: 404 })) });
  assert.deepEqual(runs.map((run) => run.outcome), [{ status: "interrupted" }]);
});

test("reconnect exhaustion is tracked as abandoned, not as a failure", async () => {
  const { runs, ledger } = await watchOnce({ daemon: daemon(() => stream(frame("agent", { type: "text_delta", delta: "Part" }))) });
  assert.deepEqual(ledger.settled, []);
  assert.deepEqual(runs.map((run) => run.outcome), [{ status: "abandoned" }]);
});

test("a failed terminal write ends the tracked run abandoned with the error, so the span shows why", async () => {
  const { runs } = await watchOnce({ daemon: daemon(() => stream(frame("end", { code: 0, status: "succeeded" }))), ledger: fakeLedger({ failSettle: true }) });
  assert.equal(runs[0]?.outcome?.status, "abandoned");
  assert.match(String((runs[0]?.outcome?.error as Error).message), /SQLITE_FULL/);
});

test("the follow loop, including its ledger write, runs inside the tracked run's scope", async () => {
  const { port, inside } = recordingPort();
  const seen: boolean[] = [];
  const ledger = fakeLedger();
  const original = ledger.settle.bind(ledger);
  ledger.settle = async (input) => {
    seen.push(inside());
    return original(input);
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon: daemon(() => stream(frame("end", { code: 0, status: "succeeded" }))), observability: port, checkpointIntervalMs: 0 });
  finalizer.watch({ principalId: "p1", conversationId: "conv-1", message: stub });
  await finalizer.idle();
  assert.deepEqual(seen, [true]);
});
