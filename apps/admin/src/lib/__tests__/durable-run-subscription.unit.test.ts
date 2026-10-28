import { expect, test, vi } from "vitest";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import { browserDurableSubscriptionPorts, followDurableRun, type DurableSubscriptionPorts } from "../durable-run-subscription";
import { browserQueuedStartPorts, startQueuedDaemonRun } from "../queued-daemon-start";
import { withAcceptanceCancellation } from "../acceptance-cancellation";
import { subscriptionEnded, type TrackedRunHandlers } from "../stream-activity";

function harness() {
  let saved: ChatMessage | null = null;
  let scheduled: (() => void) | undefined;
  const streams: Parameters<DurableSubscriptionPorts["stream"]>[0][] = [];
  const events: AgentEvent[] = [];
  const done: AgentEvent[][] = [];
  const errors: string[] = [];
  const checkpoints: ChatMessage[] = [];
  const reads: unknown[] = [];
  const ports: DurableSubscriptionPorts = {
    read: async (required) => { reads.push(required); return saved; },
    stream: (required) => { streams.push(required); return () => {}; },
    schedule: ({ work }) => { scheduled = work; return () => { scheduled = undefined; }; },
  };
  const abort = new AbortController();
  const stop = followDurableRun({ runId: "old", binding: { messageId: "answer", conversationId: "chat" }, signal: abort.signal, ports,
    handlers: { onEvent: (event) => events.push(event), onCheckpoint: (message) => checkpoints.push(message),
      onDone: (value) => done.push(value), onError: (error) => errors.push(error.message) },
  }, {});
  return { streams, events, done, errors, checkpoints, reads, stop, abort,
    save: (message: ChatMessage | null) => { saved = message; },
    async tick() { scheduled?.(); await Promise.resolve(); await Promise.resolve(); },
  };
}

test("404 or a lost connection never terminalizes the run or asks the user to resend", async () => {
  const h = harness();
  h.streams[0]!.dropped(); await Promise.resolve(); await Promise.resolve();
  expect(h.done).toEqual([]); expect(h.errors).toEqual([]); expect(h.events).toEqual([]);
  // Jini bf73324c6 backs off before recovery instead of reading on the disconnect stack.
  expect(h.reads).toEqual([]);
  await h.tick();
  expect(h.reads).toEqual([{ runId: "old", messageId: "answer" }]);
  h.stop();
});

test("a daemon failed end waits for the durable row, follows a continuation, then finishes with saved partial text", async () => {
  const h = harness();
  const partial = "Repo created (private, `main`). Now the backup plan.";
  h.save({ id: "answer", role: "assistant", content: partial, runId: "next", runStatus: "queued", events: [{ kind: "text", text: partial }] });
  h.streams[0]!.frame("end", JSON.stringify({ kind: "end", payload: { status: "failed", code: 1 } }), "9");
  await Promise.resolve(); await Promise.resolve();
  expect(h.done).toEqual([]); expect(h.errors).toEqual([]);
  expect(h.streams.at(-1)!.runId).toBe("next"); expect(h.streams.at(-1)!.cursor).toBe("");
  const complete: AgentEvent[] = [{ kind: "text", text: partial + "\n\nContinued\n\nBackup complete." }];
  h.save({ id: "answer", role: "assistant", content: complete[0]!.kind === "text" ? complete[0]!.text : "", runId: "next", runStatus: "succeeded", events: complete });
  await h.tick();
  expect(h.done).toEqual([complete]); expect(h.errors).toEqual([]);
});

test("browser unmount aborts its subscription and does not cancel or finish the durable run", async () => {
  const h = harness(); h.abort.abort(); await h.tick();
  expect(h.reads).toEqual([]); expect(h.done).toEqual([]); expect(h.errors).toEqual([]);
});

test("a failed persisted row is completed with its saved events exactly once", async () => {
  const h = harness();
  const events: AgentEvent[] = [{ kind: "text", text: "Saved partial" }, { kind: "status", label: "Stopped. Saved work is above." }];
  h.save({ id: "answer", role: "assistant", content: "Saved partial", runStatus: "failed", runId: "old", events });
  await h.tick(); await h.tick();
  expect(h.done).toEqual([events]); expect(h.errors).toEqual([]);
});

test("a refused concurrent turn waits client-side with the same accepted message identity", async () => {
  const body = { assistantMessageId: "answer", prompt: "Back up" };
  const calls: unknown[] = [];
  let tries = 0;
  const response = await startQueuedDaemonRun({ body, ports: {
    post: async (required) => { calls.push(required); return ++tries === 1 ? new Response(JSON.stringify({ code: "CHAT_RUN_BUSY" }), { status: 409 }) : new Response('{"run":{"id":"next"}}', { status: 201 }); },
    wait: async () => { calls.push("wait"); },
  } }, {});
  expect(response.status).toBe(201); expect(calls).toEqual([{ body }, "wait", { body }]);
});

test("user Stop during client backoff prevents dispatch and needs no resend", async () => {
  const abort = new AbortController();
  let posts = 0;
  await expect(startQueuedDaemonRun({ body: {}, signal: abort.signal, ports: {
    post: async () => { posts++; return new Response('{"code":"CHAT_RUN_BUSY"}', { status: 409 }); }, wait: async () => { abort.abort(); },
  } }, {})).rejects.toThrow("The queued turn was stopped.");
  expect(posts).toBe(1);
});

test("Stop before a start response persists intent by message identity, including a lost response", async () => {
  const abort = new AbortController();
  const actions: string[] = [];
  await expect(withAcceptanceCancellation({ signal: abort.signal,
    start: async () => { actions.push("accepting"); abort.abort(); throw new Error("response lost"); },
    cancel: async () => { actions.push("persist-stop"); },
  }, {})).rejects.toThrow("response lost");
  expect(actions).toEqual(["accepting", "persist-stop", "persist-stop"]);
});

test("a cancel that rejects while the stop beats acceptance is swallowed, and the start result still wins", async () => {
  const abort = new AbortController();
  const cancels: string[] = [];
  const result = await withAcceptanceCancellation({ signal: abort.signal,
    start: async () => { abort.abort(); return "accepted"; },
    cancel: async () => { cancels.push("persist-stop"); throw new Error("daemon unreachable"); },
  }, {});
  await Promise.resolve();
  expect(result).toBe("accepted"); expect(cancels).toEqual(["persist-stop", "persist-stop"]);
});

test("an accepted turn that is never stopped never asks the daemon to cancel it", async () => {
  const abort = new AbortController();
  let cancels = 0;
  const result = await withAcceptanceCancellation({ signal: abort.signal, start: async () => 7, cancel: async () => { cancels++; } }, {});
  abort.abort();
  expect(result).toBe(7); expect(cancels).toBe(0);
  expect(await withAcceptanceCancellation({ start: async () => "no signal", cancel: async () => { cancels++; } }, {})).toBe("no signal");
  expect(cancels).toBe(0);
});

test("a 409 that is not CHAT_RUN_BUSY, or whose body is not JSON, is returned instead of retried", async () => {
  for (const body of ['{"code":"VERSION_CONFLICT"}', "not json"]) {
    let waits = 0;
    const response = await startQueuedDaemonRun({ body: {}, ports: {
      post: async () => new Response(body, { status: 409 }), wait: async () => { waits++; },
    } }, {});
    expect(response.status).toBe(409); expect(await response.text()).toBe(body); expect(waits).toBe(0);
  }
});

test("a turn already stopped before dispatch never posts", async () => {
  const abort = new AbortController(); abort.abort();
  let posts = 0;
  await expect(startQueuedDaemonRun({ body: {}, signal: abort.signal, ports: {
    post: async () => { posts++; return new Response("{}", { status: 201 }); }, wait: async () => {},
  } }, {})).rejects.toMatchObject({ name: "AbortError" });
  expect(posts).toBe(0);
});

test("browser queued-start ports POST the same-origin JSON body to /api/runs", async () => {
  const requests: [string, RequestInit][] = [];
  const ports = browserQueuedStartPorts({}, { request: async (url, init) => { requests.push([String(url), init!]); return new Response("{}", { status: 201 }); } });
  const response = await ports.post({ body: { assistantMessageId: "answer" } }, {});
  expect(response.status).toBe(201);
  expect(requests).toEqual([["/api/runs", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: '{"assistantMessageId":"answer"}' }]]);
});

test("browser queued-start backoff waits one second, and a Stop during it cancels the timer and rejects", async () => {
  const timers: { work: () => void; delayMs: number; cancelled: boolean }[] = [];
  const ports = browserQueuedStartPorts({}, { schedule: ({ work, delayMs }) => {
    const timer = { work, delayMs, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true; };
  } });
  const abort = new AbortController();
  const waited = ports.wait({ signal: abort.signal }, {});
  expect(timers.map((timer) => timer.delayMs)).toEqual([1_000]);
  timers[0]!.work();
  await expect(waited).resolves.toBeUndefined();
  abort.abort();
  expect(timers[0]!.cancelled).toBe(false);

  const stopping = new AbortController();
  const stopped = ports.wait({ signal: stopping.signal }, {});
  stopping.abort();
  await expect(stopped).rejects.toMatchObject({ name: "AbortError", message: "The queued turn was stopped." });
  expect(timers[1]!.cancelled).toBe(true);

  await expect(ports.wait({ signal: stopping.signal }, {})).rejects.toMatchObject({ name: "AbortError" });
  expect(timers).toHaveLength(2);
});

test("default browser queued-start ports use the real one-second timer, cleared on Stop", async () => {
  vi.useFakeTimers();
  try {
    let resolved = false;
    const waited = browserQueuedStartPorts().wait({}, {}).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(999); expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await waited; expect(resolved).toBe(true);
    const abort = new AbortController();
    const stopped = browserQueuedStartPorts().wait({ signal: abort.signal }, {});
    expect(vi.getTimerCount()).toBe(1);
    abort.abort();
    await expect(stopped).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

function fakeSource() {
  const listeners = new Map<string, (event: Event) => void>();
  let closed = 0;
  const source = {
    readyState: 1,
    addEventListener: (kind: string, listener: (event: Event) => void) => { listeners.set(kind, listener); },
    close: () => { closed++; },
  } as unknown as Pick<EventSource, "addEventListener" | "close" | "readyState">;
  return { source, listeners, closed: () => closed };
}

test("browser durable ports recover by message identity, read a checkpoint without recovery, and map 404 and failures", async () => {
  const requests: [string, RequestInit][] = [];
  const replies = [
    new Response(JSON.stringify({ message: { id: "answer", role: "assistant", content: "saved" } }), { status: 200 }),
    new Response("{}", { status: 404 }),
    new Response("{}", { status: 503 }),
    new Response(JSON.stringify({ message: { id: "plain", role: "assistant", content: "" } }), { status: 200 }),
  ];
  const ports = browserDurableSubscriptionPorts({}, { request: async (url, init) => { requests.push([String(url), init!]); return replies.shift()!; } });
  expect(await ports.read({ runId: "run/1", messageId: "answer" }, {})).toEqual({ id: "answer", role: "assistant", content: "saved" });
  expect(await ports.read({ runId: "run/1", messageId: "answer" }, { recover: false })).toBe("gone");
  expect(await ports.read({ runId: "run/1", messageId: "a b" }, { recover: false })).toBeNull();
  expect(await ports.read({ runId: "run/1" }, { recover: false })).toEqual({ id: "plain", role: "assistant", content: "" });
  expect(requests).toEqual([
    ["/api/runs/run%2F1/recover", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: '{"messageId":"answer"}' }],
    ["/api/runs/run%2F1/checkpoint?messageId=answer", { method: "GET", credentials: "same-origin" }],
    ["/api/runs/run%2F1/checkpoint?messageId=a%20b", { method: "GET", credentials: "same-origin" }],
    ["/api/runs/run%2F1/checkpoint", { method: "GET", credentials: "same-origin" }],
  ]);
});

test("browser durable ports stream frames after the cursor, and an empty native error closes and reports a drop", () => {
  const opened: string[] = [];
  const sources: ReturnType<typeof fakeSource>[] = [];
  const ports = browserDurableSubscriptionPorts({}, { open: (url) => { opened.push(url); const fake = fakeSource(); sources.push(fake); return fake.source; } });
  const frames: [string, string, string][] = [];
  let drops = 0;
  const stop = ports.stream({ runId: "run 1", cursor: "c/9", frame: (kind, data, id) => frames.push([kind, data, id]), dropped: () => { drops++; } }, {});
  const [first] = sources;
  expect([...first!.listeners.keys()]).toEqual(["agent", "stdout", "stderr", "end", "error"]);
  first!.listeners.get("agent")!(new MessageEvent("agent", { data: '{"kind":"text"}', lastEventId: "10" }));
  first!.listeners.get("error")!(new MessageEvent("error", { data: '{"message":"boom"}', lastEventId: "11" }));
  expect(frames).toEqual([["agent", '{"kind":"text"}', "10"], ["error", '{"message":"boom"}', "11"]]);
  expect(drops).toBe(0);
  first!.listeners.get("error")!(new Event("error"));
  expect(drops).toBe(1); expect(first!.closed()).toBe(1); expect(frames).toHaveLength(2);
  stop(); expect(first!.closed()).toBe(2);
  ports.stream({ runId: "run 1", cursor: "", frame: () => {}, dropped: () => {} }, {});
  expect(opened).toEqual(["/api/runs/run%201/events?afterCursor=c%2F9", "/api/runs/run%201/events"]);
});

test("browser durable ports delegate scheduling, and the defaults use EventSource and a cancellable timer", () => {
  const scheduled: number[] = [];
  const cancel = () => {};
  const injected = browserDurableSubscriptionPorts({}, { schedule: ({ delayMs }) => { scheduled.push(delayMs); return cancel; } });
  expect(injected.schedule({ work: () => {}, delayMs: 250 }, {})).toBe(cancel);
  expect(scheduled).toEqual([250]);

  const constructed: string[] = [];
  class FakeEventSource { readyState = 0; constructor(url: string) { constructed.push(url); } addEventListener() {} close() {} }
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.useFakeTimers();
  try {
    const defaults = browserDurableSubscriptionPorts();
    defaults.stream({ runId: "r", cursor: "", frame: () => {}, dropped: () => {} }, {});
    expect(constructed).toEqual(["/api/runs/r/events"]);
    let ran = 0;
    defaults.schedule({ work: () => { ran++; }, delayMs: 100 }, {});
    const stop = defaults.schedule({ work: () => { ran += 10; }, delayMs: 100 }, {});
    stop();
    vi.advanceTimersByTime(100);
    expect(ran).toBe(1);
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});

test("a missing durable row releases the host's page-stream activity and completes observation; stopping still releases it", async () => {
  let ended = 0;
  const done: unknown[] = [];
  const handlers: TrackedRunHandlers = { onEvent: () => {}, onDone: (events) => done.push(events), onError: () => {}, [subscriptionEnded]: () => { ended++; } };
  let poll: (() => void) | undefined;
  const stop = followDurableRun({ runId: "gone", binding: { messageId: "answer", conversationId: "chat" }, handlers, ports: {
    read: async () => "gone", stream: () => () => {}, schedule: ({ work }) => { poll = work; return () => { poll = undefined; }; },
  } }, {});
  poll?.();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(ended).toBe(1); expect(done).toEqual([[]]);
  stop(); expect(ended).toBe(2);
});
