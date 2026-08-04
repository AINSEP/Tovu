import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createA2uiActionPoster } from "../a2ui-action-poster";

/**
 * @file The client half of A2UI's inbound transport — `createA2uiActionPoster` posting a rendered
 * surface's agent-directed action to `a2ui-actions-route.ts`.
 *
 * `onAgentAction` is a fire-and-forget `void`-returning callback (`A2uiSurfaceCardProps`'s own
 * shape), so these tests flush microtasks after calling the poster rather than awaiting a return
 * value — there is none to await, by design (see the module's own doc for why).
 */

const ACTION_MESSAGE = {
  version: "v1.0",
  action: { name: "continue", surfaceId: "ex-1", sourceComponentId: "btn", timestamp: "2026-01-01T00:00:00Z", context: {} },
};

let fetchMock: ReturnType<typeof vi.fn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
});

async function flush(): Promise<void> {
  // A few extra ticks beyond a bare microtask flush: the poster's async IIFE awaits `fetch`, then
  // `response.text()` on the error path, each of which is its own microtask hop.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("posts {exchangeId, message} to baseUrl + path, using the message's own action.surfaceId as the exchangeId", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ delivered: true }), { status: 202 }));
  const post = createA2uiActionPoster("", { path: "/api/admin/v1/a2ui/actions" });

  post("run-1", ACTION_MESSAGE);
  await flush();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(endpoint).toBe("/api/admin/v1/a2ui/actions");
  expect(init.method).toBe("POST");
  expect(init.credentials).toBe("same-origin");
  expect(JSON.parse(String(init.body))).toEqual({ exchangeId: "ex-1", message: ACTION_MESSAGE });
});

test("ignores the chat runId for correlation — the message's own surfaceId is the address", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ delivered: true }), { status: 202 }));
  const post = createA2uiActionPoster("");

  post(undefined, ACTION_MESSAGE);
  await flush();

  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({ exchangeId: "ex-1", message: ACTION_MESSAGE });
});

test("a message with no surfaceId is never posted — reported to the console instead", async () => {
  const post = createA2uiActionPoster("");

  post("run-1", { version: "v1.0", functionResponse: { functionCallId: "c1", call: "greetUser", value: "hi" } });
  await flush();

  expect(fetchMock).not.toHaveBeenCalled();
  expect(consoleErrorSpy).toHaveBeenCalled();
});

test("a non-2xx response is reported to the console, not thrown at the caller", async () => {
  fetchMock.mockResolvedValue(new Response("that surface is no longer waiting for an answer", { status: 409 }));
  const post = createA2uiActionPoster("");

  expect(() => post("run-1", ACTION_MESSAGE)).not.toThrow();
  await flush();

  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining("action delivery failed (409)"),
    expect.stringContaining("no longer waiting")
  );
});

test("a network failure is caught and reported, not thrown", async () => {
  fetchMock.mockRejectedValue(new Error("network down"));
  const post = createA2uiActionPoster("");

  post("run-1", ACTION_MESSAGE);
  await flush();

  expect(consoleErrorSpy).toHaveBeenCalled();
});
