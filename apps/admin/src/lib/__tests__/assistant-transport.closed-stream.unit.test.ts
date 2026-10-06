import { act, cleanup, renderHook } from "@testing-library/react";
import { useConversation } from "@jini-ai/chat/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createTovuAssistantTransport } from "../assistant-transport";
import { FakeEventSource, resetFakeEventSource } from "./assistant-transport.test-helpers";

/**
 * 2026-10-05: "List the secrets on my Fly app tovu." finished ("Done · 10s · $0.3651") but the chat
 * kept "Still working…" with Stop active for over a minute. The dev API restarts (and takes the
 * daemon with it) on every watched file edit; while the daemon boots, the API answers the stream's
 * reconnect with 502/503. A browser `EventSource` that gets a non-200 answer closes for good
 * (`readyState` CLOSED) and fires one bare `error`. The status lookup then saw the same 5xx, which
 * is not a 404, so nothing settled the turn and nothing ever reconnected.
 */
beforeEach(() => {
  resetFakeEventSource();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function frame(kind: string, payload: unknown): string {
  return JSON.stringify({ runId: "run-1", kind, payload });
}

/** `statuses` answers successive `GET /api/runs/run-1` lookups; the last one repeats. */
function stubRunApi(statuses: Array<number | { state: string }>) {
  const lookups: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/runs" && init?.method === "POST") return new Response(JSON.stringify({ run: { id: "run-1" } }));
    if (url === "/api/runs/run-1" && !init?.method) {
      const next = statuses[Math.min(lookups.length, statuses.length - 1)]!;
      lookups.push(url);
      return typeof next === "number"
        ? new Response(JSON.stringify({ error: "assistant is unavailable" }), { status: next })
        : new Response(JSON.stringify({ run: next }));
    }
    throw new Error(`unexpected fetch: ${init?.method ?? "GET"} ${url}`);
  }));
  return lookups;
}

async function startTurn() {
  const transport = createTovuAssistantTransport();
  const hook = renderHook(() => useConversation({ transport }));
  await act(async () => { await hook.result.current.sendMessage("List the secrets on my Fly app tovu."); });
  return hook;
}

test("a stream the browser closed on a 5xx reopens after the last cursor and settles on the replayed end", async () => {
  stubRunApi([503, { state: "succeeded" }]);
  const { result } = await startTurn();
  const first = FakeEventSource.instances[0]!;
  await act(async () => {
    first.emit("agent", frame("agent", { type: "text_delta", delta: "Your Fly app has 3 secrets." }), "cur-7");
    first.failPermanently();
    await vi.advanceTimersByTimeAsync(1_000);
  });

  expect(first.closed).toBe(true);
  expect(FakeEventSource.instances.map((source) => source.url)).toEqual([
    "/api/runs/run-1/events",
    "/api/runs/run-1/events?afterCursor=cur-7",
  ]);
  expect(result.current.isStreaming).toBe(true);

  await act(async () => { FakeEventSource.instances[1]!.emit("end", frame("end", { status: "succeeded", code: 0 }), "cur-8"); });
  const answer = result.current.messages.find((message) => message.role === "assistant")!;
  expect(result.current.isStreaming).toBe(false);
  expect(answer.runStatus).toBe("succeeded");
  expect(answer.content).toBe("Your Fly app has 3 secrets.");
});

test("a closed stream whose run the restarted daemon no longer knows settles as interrupted, without reopening", async () => {
  stubRunApi([404]);
  const { result } = await startTurn();
  await act(async () => {
    FakeEventSource.instances[0]!.failPermanently();
    await vi.advanceTimersByTimeAsync(10_000);
  });

  expect(FakeEventSource.instances).toHaveLength(1);
  expect(result.current.isStreaming).toBe(false);
  expect(result.current.messages.find((message) => message.role === "assistant")!.runStatus).toBe("failed");
});

test("reopen attempts back off while the API keeps failing and stop once the chat is abandoned", async () => {
  const lookups = stubRunApi([502]);
  const transport = createTovuAssistantTransport();
  const abort = new AbortController();
  await transport.reattachRun("run-1", { onEvent: () => {}, onError: () => {}, onDone: () => {} } as never, { signal: abort.signal } as never);
  await act(async () => {
    FakeEventSource.instances[0]!.failPermanently();
    await vi.advanceTimersByTimeAsync(1_000);
    FakeEventSource.instances[1]!.failPermanently();
    await vi.advanceTimersByTimeAsync(1_000);
  });
  expect(FakeEventSource.instances).toHaveLength(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(FakeEventSource.instances).toHaveLength(3);

  await act(async () => {
    FakeEventSource.instances[2]!.failPermanently();
    abort.abort();
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(FakeEventSource.instances).toHaveLength(3);
  expect(lookups).toHaveLength(3);
});

test("a run that is already over but whose stream cannot be reopened settles instead of retrying forever", async () => {
  stubRunApi([{ state: "succeeded" }]);
  const { result } = await startTurn();
  await act(async () => {
    FakeEventSource.instances[0]!.emit("agent", frame("agent", { type: "text_delta", delta: "Done." }), "cur-1");
    FakeEventSource.instances[0]!.failPermanently();
    await vi.advanceTimersByTimeAsync(1_000);
    FakeEventSource.instances[1]!.failPermanently();
    await vi.advanceTimersByTimeAsync(60_000);
  });

  expect(FakeEventSource.instances).toHaveLength(2);
  expect(result.current.isStreaming).toBe(false);
  expect(result.current.messages.find((message) => message.role === "assistant")!.content).toBe("Done.");
});

test("a failed run whose end frame could not be loaded settles as failed, not as a clean finish", async () => {
  stubRunApi([{ state: "failed" }]);
  const { result } = await startTurn();
  await act(async () => {
    FakeEventSource.instances[0]!.failPermanently();
    await vi.advanceTimersByTimeAsync(1_000);
    FakeEventSource.instances[1]!.failPermanently();
    await vi.advanceTimersByTimeAsync(1_000);
  });

  expect(FakeEventSource.instances).toHaveLength(2);
  expect(result.current.isStreaming).toBe(false);
  expect(result.current.messages.find((message) => message.role === "assistant")!.runStatus).toBe("failed");
});
