import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createA2uiActionPoster } from "../a2ui-action-poster";

/**
 * @file The client half of A2UI's inbound transport — `createA2uiActionPoster` posting a rendered
 * surface's agent-directed action to `a2ui-actions-route.ts`.
 *
 * `onAgentAction` resolves to `{ok: true} | {ok: false; reason: string}` (`A2uiSurfaceCardProps`'s
 * response channel), so these tests `await` the poster's own return value directly rather than
 * flushing microtasks blind — the returned promise settling is itself proof the request/response
 * cycle (including the error-path `response.text()` hop) has finished.
 */

const ACTION_MESSAGE = {
  version: "v1.0",
  action: { name: "continue", surfaceId: "ex-1", sourceComponentId: "btn", timestamp: "2026-01-01T00:00:00Z", context: {} },
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;
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

test("posts {exchangeId, message} to baseUrl + path, using the message's own action.surfaceId as the exchangeId", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ delivered: true }), { status: 202 }));
  const post = createA2uiActionPoster("", { path: "/api/admin/v1/a2ui/actions" });

  const outcome = await post("run-1", ACTION_MESSAGE);

  expect(outcome).toEqual({ ok: true });
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

  await post(undefined, ACTION_MESSAGE);

  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({ exchangeId: "ex-1", message: ACTION_MESSAGE });
});

test("a message with no surfaceId is never posted — reported to the console and returned as a failure", async () => {
  const post = createA2uiActionPoster("");

  const outcome = await post("run-1", { version: "v1.0", functionResponse: { functionCallId: "c1", call: "greetUser", value: "hi" } });

  expect(fetchMock).not.toHaveBeenCalled();
  expect(consoleErrorSpy).toHaveBeenCalled();
  expect(outcome).toEqual({ ok: false, reason: expect.any(String) });
});

test("a message that isn't an object at all (not just missing surfaceId) is still handled, not thrown on", async () => {
  const post = createA2uiActionPoster("");

  const outcome = await post("run-1", "not an object");

  expect(fetchMock).not.toHaveBeenCalled();
  expect(outcome).toEqual({ ok: false, reason: expect.any(String) });
});

test("a surfaceId-less message with no runId logs 'unknown' rather than the literal 'undefined'", async () => {
  const post = createA2uiActionPoster("");

  await post(undefined, { version: "v1.0" });

  expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("(run unknown)"), expect.anything());
});

test("an unmapped status code (not 409/400/401) falls through to the generic reason, carrying the status", async () => {
  fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
  const post = createA2uiActionPoster("");

  const outcome = await post("run-1", ACTION_MESSAGE);

  expect(outcome).toEqual({ ok: false, reason: "The action couldn't be delivered (server returned 500)." });
});

test("a non-ok response whose body can't be read (.text() rejects) still returns a failure outcome", async () => {
  const fakeResponse = { ok: false, status: 503, text: async () => { throw new Error("body stream errored"); } } as unknown as Response;
  fetchMock.mockResolvedValue(fakeResponse);
  const post = createA2uiActionPoster("");

  const outcome = await post("run-1", ACTION_MESSAGE);

  expect(outcome).toEqual({ ok: false, reason: "The action couldn't be delivered (server returned 503)." });
});

test("a non-2xx response is reported to the console and returned as a failure, not thrown", async () => {
  fetchMock.mockResolvedValue(new Response("that surface is no longer waiting for an answer", { status: 409 }));
  const post = createA2uiActionPoster("");

  const outcome = await post("run-1", ACTION_MESSAGE);

  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining("action delivery failed (409)"),
    expect.stringContaining("no longer waiting")
  );
  // The route's raw body text ("that surface is no longer waiting for an answer") is what reaches
  // the console; the outcome's `reason` is the poster's own human-facing wording, not an echo of the
  // server's message — a 409 is the common case (the agent moved on), not a mistake the human made,
  // so it must not read as one.
  expect(outcome).toEqual({ ok: false, reason: expect.stringContaining("no longer waiting for a response") });
});

test("a 400 response maps to a reason distinct from a 409's, so the human isn't told the wrong story", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "bad envelope", code: "VALIDATION_ERROR" }), { status: 400 }));
  const post = createA2uiActionPoster("");

  const outcome = await post("run-1", ACTION_MESSAGE);

  expect(outcome.ok).toBe(false);
  expect(outcome).not.toEqual(expect.objectContaining({ reason: expect.stringContaining("no longer waiting") }));
});

test("a 401 response is mapped to its own reason, not the generic fallback", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 }));
  const post = createA2uiActionPoster("");

  const outcome = await post("run-1", ACTION_MESSAGE);

  expect(outcome).toEqual({ ok: false, reason: expect.stringContaining("session") });
});

test("a network failure is caught and reported as a failure outcome, not thrown", async () => {
  fetchMock.mockRejectedValue(new Error("network down"));
  const post = createA2uiActionPoster("");

  const outcome = await post("run-1", ACTION_MESSAGE);

  expect(consoleErrorSpy).toHaveBeenCalled();
  expect(outcome).toEqual({ ok: false, reason: expect.any(String) });
});

test("an abort (timeout) is distinguished from an ordinary network failure in the console log, and still returns a failure outcome", async () => {
  fetchMock.mockImplementation((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = new Error("This operation was aborted");
        error.name = "AbortError";
        reject(error);
      });
    })
  );
  const post = createA2uiActionPoster("", { timeoutMs: 5 });

  const outcome = await post("run-1", ACTION_MESSAGE);

  expect(outcome).toEqual({ ok: false, reason: expect.any(String) });
  expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("action delivery failed"), expect.stringContaining("timed out after 5ms"));
});
