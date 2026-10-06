import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { ChatRunLedger } from "#src/assistant/index";
import { createInMemoryChatHistory } from "#src/assistant/persistence/store-factory";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { createLiveRunTracker, CONCURRENT_RUN_REFUSAL_MESSAGE, failRunBeforeStart } from "../inbound/assistant/agent-run-concurrency.js";
import { wouldForcedColdStartLoseConversationContext } from "../inbound/assistant/agent-session-resume.js";
import { createAssistantChatsModule } from "../runtime/composition/modules/assistant-chats.js";
import { createAssistantRunFinalizer, createHttpRunDaemonClient, type RunDaemonClient } from "../runtime/composition/modules/assistant-run-finalizer.js";
import type { RouteDeps } from "../routes/types.js";

/** Spec/decision: only a serving boot reconciles transcripts. A surviving daemon run is adopted
 * through its replayable stream, so the row remains running until its answer is persisted and
 * the daemon releases the conversation. A 404 proves interruption; transport/auth errors start
 * bounded resolution. Fresh live proof renews the watch. Ports and fakes keep this contract
 * independent of processes or HTTP listeners. */
function harness(required: { status: number | null }, optional: { events?: ChatMessage["events"] } = {}) {
  const message: ChatMessage = { id: "answer", role: "assistant", content: "partial", events: optional.events ?? [], runId: "run-old", runStatus: "running" };
  const tracker = createLiveRunTracker();
  tracker.register("chat", "run-old");
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
  const calls: unknown[] = [];
  let repairs = 0;
  const ledger: ChatRunLedger = {
    unlessSettled: async (_run, write) => ({ written: true, value: await write() }),
    checkpoint: async () => true,
    settle: async (input) => {
      calls.push(input);
      if (message.runStatus !== "running") return false;
      Object.assign(message, { content: input.content, events: [...input.events], runStatus: input.status, endedAt: input.endedAt });
      return true;
    },
    reconcileInterrupted: async (_required, options) => {
      repairs++;
      if (await options?.recover?.({ principalId: "owner", conversationId: "chat", message: { ...message } })) return 0;
      message.runStatus = "canceled";
      return 1;
    },
  };
  const daemon: RunDaemonClient = {
    runStatus: async ({ runId, principalId }) => { calls.push({ runId, principalId }); return required.status; },
    openEvents: async ({ runId, principalId }) => {
      calls.push({ stream: runId, principalId });
      return required.status === 404 ? new Response(null, { status: 404 }) : new Response(body);
    },
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => 1234, checkpointIntervalMs: 0, reconnectDelayMs: 0 });
  function finish() {
    // The real daemon releases its tracker on waitForTerminal, independently of the API finalizer.
    tracker.unregister("chat", "run-old");
    const frames = [
      ["agent", { type: "text_delta", delta: "Recovered answer" }],
      ["end", { status: "succeeded", code: 0 }],
    ].map(([kind, payload]) => `event: ${kind}\ndata: ${JSON.stringify({ runId: "run-old", kind, payload })}\n\n`).join("");
    stream.enqueue(new TextEncoder().encode(frames));
    stream.close();
  }
  async function send() {
    const errors: string[] = [];
    let status = "running";
    tracker.register("chat", "run-next");
    if (wouldForcedColdStartLoseConversationContext({
      storedSessionId: "session", carriesOwnMemory: true,
      hasConcurrentLiveRun: tracker.hasConcurrentLiveRun("chat", "run-next"),
    })) {
      await failRunBeforeStart({
        emit: async ({ input }) => { errors.push(input.data.message); },
        finish: async (input) => { status = input.status; tracker.unregister("chat", "run-next"); },
      }, "run-next", CONCURRENT_RUN_REFUSAL_MESSAGE);
    }
    return { status, errors };
  }
  return { message, ledger, tracker, finalizer, finish, send, calls, repairs: () => repairs };
}

test("restart recovery adopts a live daemon run, persists its reply, and permits the next send", async () => {
  const h = harness({ status: 200 });
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  assert.equal(h.message.runStatus, "running");
  assert.equal(h.finalizer.activeCount(), 1);
  assert.deepEqual(h.calls.slice(0, 2), [{ runId: "run-old", principalId: "owner" }, { stream: "run-old", principalId: "owner" }]);
  // While the adopted answer is actually live, ordinary serialization still applies.
  assert.deepEqual(await h.send(), { status: "failed", errors: [
    "The assistant could not start: another answer in this chat is still running. Wait for it to finish, or stop it, then send again.",
  ] });
  h.finish();
  await h.finalizer.idle();
  assert.deepEqual(h.message, { id: "answer", role: "assistant", runId: "run-old", runStatus: "succeeded", content: "Recovered answer", events: [{ kind: "text", text: "Recovered answer" }], endedAt: 1234 });
  assert.deepEqual(await h.send(), { status: "running", errors: [] });
});

test("restart recovery cancels only a run the daemon has forgotten", async () => {
  const h = harness({ status: 404 });
  h.tracker.unregister("chat", "run-old");
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 1);
  assert.equal(h.message.runStatus, "canceled");
  assert.equal(h.finalizer.activeCount(), 0);
  assert.deepEqual(h.calls, [{ runId: "run-old", principalId: "owner" }]);
  assert.equal(h.tracker.hasConcurrentLiveRun("chat", "run-next"), false);
});

for (const status of [null, 401, 403, 503]) {
  test(`restart recovery preserves and watches an unproven run when daemon status is ${status}`, async () => {
    const h = harness({ status });
    assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
    assert.equal(h.message.runStatus, "running");
    h.finish();
    await h.finalizer.idle();
    assert.equal(h.message.content, "Recovered answer");
    assert.equal(h.message.runStatus, "succeeded");
  });
}

test("registering chat routes for a static export never reconciles a live turn", () => {
  const h = harness({ status: 200 });
  const deps = { chatRunLedger: h.ledger } as unknown as RouteDeps;
  createAssistantChatsModule(deps, { finalizer: h.finalizer }).registerRoutes!(express());
  assert.equal(h.repairs(), 0);
  assert.equal(h.message.runStatus, "running");
  assert.equal(h.finalizer.activeCount(), 0);
});

test("serving chat route registration starts recovery exactly once and tracks its boot work", async () => {
  const h = harness({ status: 200 });
  const work: Promise<void>[] = [];
  createAssistantChatsModule({ chatRunLedger: h.ledger } as unknown as RouteDeps, {
    finalizer: h.finalizer, recoverInterrupted: true, onBootWork: (promise) => work.push(promise),
  }).registerRoutes!(express());
  await Promise.all(work);
  assert.equal(work.length, 1);
  assert.equal(h.repairs(), 1);
  assert.equal(h.message.runStatus, "running");
  h.finish();
  await h.finalizer.idle();
});

test("restart recovery through the lazy history ledger persists the surviving daemon answer", async () => {
  const { chatHistory, chatRunLedger } = createInMemoryChatHistory();
  const store = chatHistory({ kind: "user", workspaceId: "ws", userId: "owner" });
  await store.create({ id: "chat" });
  await store.appendMessage({ conversationId: "chat", message: { id: "answer", role: "assistant", runId: "run-old", runStatus: "running", content: "Partial" } });
  const daemon: RunDaemonClient = {
    runStatus: async () => 200,
    openEvents: async ({ runId, principalId }) => {
      assert.equal(runId, "run-old");
      assert.equal(principalId, "owner");
      return new Response(`event: agent\ndata: ${JSON.stringify({ runId, kind: "agent", payload: { type: "text_delta", delta: "Durable recovered answer" } })}\n\nevent: end\ndata: ${JSON.stringify({ runId, kind: "end", payload: { status: "succeeded", code: 0 } })}\n\n`);
    },
  };
  const finalizer = createAssistantRunFinalizer({ ledger: chatRunLedger, daemon, now: () => 1234 });
  assert.equal(await finalizer.reconcileInterrupted({}, {}), 0);
  await finalizer.idle();
  const [saved] = await store.messages({ conversationId: "chat" });
  assert.equal(saved?.runStatus, "succeeded");
  assert.equal(saved?.content, "Durable recovered answer");
  assert.deepEqual(saved?.events, [{ kind: "text", text: "Durable recovered answer" }]);
  assert.equal(saved?.endedAt, 1234);
});

test("recovery probes the previous live daemon port and switches only after that process dies", async () => {
  let alive = true;
  let discovered = 0;
  const calls: string[] = [];
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => { discovered++; return { url: "http://127.0.0.1:4101", pid: 77 }; },
    isAlive: ({ pid }) => { assert.equal(pid, 77); return alive; },
    currentUrl: () => "http://127.0.0.1:4102",
    fetch: async (url) => { calls.push(String(url)); return new Response(null, { status: String(url).includes(":4101/") ? 200 : 404 }); },
  });
  assert.equal(await client.runStatus({ runId: "run-old", principalId: "owner" }, {}), 200);
  assert.equal((await client.openEvents({ runId: "run-old", principalId: "owner" }, {})).status, 200);
  alive = false;
  assert.equal(await client.runStatus({ runId: "run-old", principalId: "owner" }, {}), 404);
  assert.equal(discovered, 1);
  assert.deepEqual(calls, ["http://127.0.0.1:4101/api/runs/run-old", "http://127.0.0.1:4101/api/runs/run-old/events", "http://127.0.0.1:4102/api/runs/run-old"]);
});

test("a failed prior-daemon discovery is inconclusive and never falls through to a new daemon's 404", async () => {
  let fetched = 0;
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => { throw new Error("registry read failed"); },
    currentUrl: () => "http://127.0.0.1:4102",
    fetch: async () => { fetched++; return new Response(null, { status: 404 }); },
  });
  assert.equal(await client.runStatus({ runId: "run-old", principalId: "owner" }, {}), null);
  await assert.rejects(client.openEvents({ runId: "run-old", principalId: "owner" }, {}), { message: "registry read failed" });
  assert.equal(fetched, 0);
});

test("adopted watches use the recovery daemon while new sends use the current daemon", async () => {
  const h = harness({ status: 200 });
  const calls: string[] = [];
  const completed = (runId: string) => new Response(`event: end\ndata: ${JSON.stringify({ runId, kind: "end", payload: { status: "succeeded", code: 0 } })}\n\n`);
  const finalizer = createAssistantRunFinalizer({
    ledger: h.ledger,
    recoveryDaemon: {
      runStatus: async ({ runId }) => { calls.push(`probe:${runId}`); return 200; },
      openEvents: async ({ runId }) => { calls.push(`recovered:${runId}`); return completed(runId); },
    },
    daemon: {
      runStatus: async () => 200,
      openEvents: async ({ runId }) => { calls.push(`current:${runId}`); return completed(runId); },
    },
  });
  assert.equal(await finalizer.reconcileInterrupted({}, {}), 0);
  await finalizer.idle();
  finalizer.watch({ principalId: "owner", conversationId: "chat", message: { id: "next", role: "assistant", content: "", runId: "run-next", runStatus: "running" } }, {});
  await finalizer.idle();
  assert.deepEqual(calls, ["probe:run-old", "recovered:run-old", "current:run-next"]);
});
