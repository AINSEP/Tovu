import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";

import { createSiteAssistantTransport } from "../site-assistant-transport";

/**
 * SPEC-046/ADR-054 Task 2. `createSiteAssistantTransport` is the only export — everything else in
 * the source file (`priorTurnsBeforeLatestUserMessage`, `boundHistoryForRequest`, `parseSseFrame`,
 * `drainCompleteFrames`, `pumpServerSentEvents`) is module-private, so every test here drives it
 * through the public `ChatTransport` surface with `globalThis.fetch` stubbed per test (save/restore,
 * matching `remixicon-override.test.ts`'s pattern) rather than reaching into internals.
 *
 * One documented finding, not exercised here: `priorTurnsBeforeLatestUserMessage`'s post-loop
 * `return history;` fallback (no `role === "user"` entry found) is unreachable through this public
 * API. `startRun` calls `latestUserPromptFromHistory(input.history)` first and throws before
 * `boundHistoryForRequest` ever runs if it finds no user turn — and that helper scans for the exact
 * same condition (last `role === "user"` entry, from the end) `priorTurnsBeforeLatestUserMessage`
 * scans for, over the same unmutated array. Reaching the fallback would require history to contain a
 * user turn for the first scan and not for the second, which is impossible for the same input. Not
 * deleted here per the coverage-triage rule (report, don't delete without sign-off).
 */

const CHAT_URL = "/api/site-assistant/chat";

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A raw frame with only a `data:` line — no `event:` line at all, exercising `parseSseFrame`'s
 *  `let event = "message"` default (a server keep-alive comment would instead omit `data:` entirely;
 *  see `streamResponse`'s keep-alive test). "message" matches none of `startRun`'s known event
 *  branches, so this doubles as the "unrecognized event name" case. */
function defaultEventFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function streamResponse(frames: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}

/** Errors the response body's reader with `reason` on the first `read()` — models a stream that dies
 *  mid-flight (a dropped connection, e.g.) rather than one that never had a body at all. */
function erroringStreamResponse(reason: unknown, status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(reason);
    },
  });
  return new Response(stream, { status });
}

/** Resolves with `response` after `delayMs`, or rejects with an `AbortError` `DOMException` the
 *  moment `signal` aborts first — models real `fetch()` abort semantics closely enough to test
 *  `stopRun`/`input.signal` cancellation without a live network call. */
function abortableFetchStub(response: Response, delayMs = 30): typeof fetch {
  return (async (_url: string, opts: RequestInit) => {
    const signal = opts.signal as AbortSignal;
    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(() => resolve(response), delayMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }) as typeof fetch;
}

function userMessage(content: string): ChatMessage {
  return { id: `msg-${content}`, role: "user", content };
}

function baseInput(history: ChatMessage[], signal?: AbortSignal): StartRunInput {
  return { history, signal: signal ?? new AbortController().signal };
}

function makeHandlers(): {
  handlers: RunHandlers;
  events: AgentEvent[];
  errors: Error[];
  doneCount: () => number;
  doneEvents: () => AgentEvent[] | null;
  donePromise: Promise<void>;
} {
  const events: AgentEvent[] = [];
  const errors: Error[] = [];
  let doneCount = 0;
  let doneEvents: AgentEvent[] | null = null;
  let resolveDone!: () => void;
  const donePromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const handlers: RunHandlers = {
    onEvent: (ev) => events.push(ev),
    onError: (err) => errors.push(err),
    onDone: (finalEvents) => {
      doneCount += 1;
      doneEvents = finalEvents;
      resolveDone();
    },
  };
  return { handlers, events, errors, doneCount: () => doneCount, doneEvents: () => doneEvents, donePromise };
}

describe("createSiteAssistantTransport", () => {
  let savedFetch: typeof fetch;
  let transport: ChatTransport;

  beforeEach(() => {
    savedFetch = globalThis.fetch;
    transport = createSiteAssistantTransport();
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  describe("startRun", () => {
    it("throws without calling fetch when history has no user turn", async () => {
      let fetchCalled = false;
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return streamResponse([sseFrame("end", { reason: "stop" })]);
      }) as typeof fetch;

      const { handlers } = makeHandlers();
      await assert.rejects(
        () => transport.startRun(baseInput([{ id: "a1", role: "assistant", content: "hi" }]), handlers),
        (err: Error) => {
          assert.equal(err.message, "no user message to send");
          return true;
        },
      );
      assert.equal(fetchCalled, false, "fetch must not fire when there is nothing to send");
    });

    it("posts the latest user message with no credentials or auth header", async () => {
      let capturedUrl: string | undefined;
      let capturedInit: RequestInit | undefined;
      globalThis.fetch = (async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return streamResponse([sseFrame("end", { reason: "stop" })]);
      }) as typeof fetch;

      const { handlers, donePromise } = makeHandlers();
      const { runId } = await transport.startRun(baseInput([userMessage("hello there")]), handlers);
      await donePromise;

      assert.equal(capturedUrl, CHAT_URL);
      assert.equal(capturedInit?.method, "POST");
      assert.equal((capturedInit?.headers as Record<string, string>)["Content-Type"], "application/json");
      assert.equal(capturedInit && "credentials" in capturedInit, false, "no cookie/session credentials sent");
      const body = JSON.parse(capturedInit?.body as string) as { message: string; history: unknown[] };
      assert.equal(body.message, "hello there");
      assert.deepEqual(body.history, []);
      assert.match(runId, /^[0-9a-f-]{36}$/i);
    });

    it("streams text and client_directive frames through onEvent and collects both for onDone", async () => {
      globalThis.fetch = (async () =>
        streamResponse([
          sseFrame("text", { delta: "Hi " }),
          sseFrame("text", { delta: "there" }),
          sseFrame("client_directive", { type: "highlight_entry", title: "My Post" }),
          sseFrame("end", { reason: "stop" }),
        ])) as typeof fetch;

      const { handlers, events, doneCount, doneEvents, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, [
        { kind: "text", text: "Hi " },
        { kind: "text", text: "there" },
        { kind: "ext", name: "client_directive", data: { type: "highlight_entry", title: "My Post" } },
      ]);
      assert.equal(doneCount(), 1);
      assert.deepEqual(doneEvents(), events);
    });

    it("passes client_directive data through unvalidated, whatever shape it is", async () => {
      globalThis.fetch = (async () =>
        streamResponse([sseFrame("client_directive", { anything: [1, 2, 3] }), sseFrame("end", { reason: "stop" })])) as typeof fetch;

      const { handlers, events, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, [{ kind: "ext", name: "client_directive", data: { anything: [1, 2, 3] } }]);
    });

    it("surfaces an error frame via onError without ending the run, then still ends on a later end frame", async () => {
      globalThis.fetch = (async () =>
        streamResponse([
          sseFrame("error", { message: "upstream hiccup" }),
          sseFrame("text", { delta: "still going" }),
          sseFrame("end", { reason: "stop" }),
        ])) as typeof fetch;

      const { handlers, events, errors, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, "upstream hiccup");
      assert.deepEqual(events, [{ kind: "text", text: "still going" }], "processing must continue past the error frame");
      assert.equal(doneCount(), 1, "onDone fires exactly once, from the end frame, not the error");
    });

    it("falls back to a generic error message when an error frame carries no message", async () => {
      globalThis.fetch = (async () => streamResponse([sseFrame("error", {}), sseFrame("end", { reason: "stop" })])) as typeof fetch;

      const { handlers, errors, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, "site assistant error");
    });

    it("ends the run when the stream closes with no explicit end frame", async () => {
      globalThis.fetch = (async () => streamResponse([sseFrame("text", { delta: "partial" })])) as typeof fetch;

      const { handlers, events, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, [{ kind: "text", text: "partial" }]);
      assert.equal(doneCount(), 1);
    });

    it("skips a keep-alive comment frame (no data: line) without crashing or forwarding it", async () => {
      globalThis.fetch = (async () =>
        streamResponse([": keep-alive\n\n", sseFrame("text", { delta: "after keep-alive" }), sseFrame("end", { reason: "stop" })])) as typeof fetch;

      const { handlers, events, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, [{ kind: "text", text: "after keep-alive" }]);
      assert.equal(doneCount(), 1);
    });

    it("ignores a frame with no event: line (defaults to \"message\", matches no known kind)", async () => {
      globalThis.fetch = (async () =>
        streamResponse([defaultEventFrame({ delta: "ignored" }), sseFrame("end", { reason: "stop" })])) as typeof fetch;

      const { handlers, events, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, [], "an unrecognized event name must not be forwarded");
      assert.equal(doneCount(), 1);
    });

    it("reports onError with the server's parsed error body when the response is not ok", async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 })) as typeof fetch;

      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, "rate limited");
      assert.equal(doneCount(), 1, "a non-ok response still finishes the run");
    });

    it("falls back to a status-coded message when a non-ok response body is not JSON", async () => {
      globalThis.fetch = (async () => new Response("<html>502</html>", { status: 502 })) as typeof fetch;

      const { handlers, errors, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, "site assistant request failed (502)");
    });

    it("throws 'no stream body' when the response has no body at all", async () => {
      globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;

      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, "site assistant response had no stream body");
      assert.equal(doneCount(), 1);
    });

    it("finishes with no onError when input.signal aborts before the response resolves", async () => {
      globalThis.fetch = abortableFetchStub(streamResponse([sseFrame("end", { reason: "stop" })]), 40);

      const controller = new AbortController();
      const { handlers, events, errors, doneCount, doneEvents, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")], controller.signal), handlers);
      controller.abort();
      await donePromise;

      assert.equal(errors.length, 0, "an abort we caused is not a reportable failure");
      assert.equal(events.length, 0);
      assert.equal(doneCount(), 1);
      assert.deepEqual(doneEvents(), []);
    });

    it("finishes with no onError when stopRun aborts an in-flight request", async () => {
      globalThis.fetch = abortableFetchStub(streamResponse([sseFrame("end", { reason: "stop" })]), 40);

      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      const { runId } = await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await transport.stopRun(runId);
      await donePromise;

      assert.equal(errors.length, 0);
      assert.equal(doneCount(), 1);
    });

    it("reports onError for a DOMException that is not an AbortError (e.g. a dropped stream)", async () => {
      globalThis.fetch = (async () => erroringStreamResponse(new DOMException("connection reset", "NetworkError"))) as typeof fetch;

      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, "connection reset");
      assert.equal(doneCount(), 1);
    });

    it("wraps a non-Error stream rejection reason in an Error before reporting it", async () => {
      globalThis.fetch = (async () => erroringStreamResponse("boom-non-error")) as typeof fetch;

      const { handlers, errors, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof Error);
      assert.equal(errors[0]?.message, "boom-non-error");
    });

    it("bounds the history sent to the server: excludes the latest turn, drops empty-content turns, keeps only the most recent 12 prior turns, and truncates any turn over 2000 chars", async () => {
      const priors: ChatMessage[] = [];
      for (let i = 0; i < 14; i += 1) {
        if (i === 5) {
          priors.push({ id: `p${i}`, role: "assistant", content: "   " }); // whitespace-only -> filtered
        } else if (i === 10) {
          priors.push({ id: `p${i}`, role: "user", content: "x".repeat(2500) }); // over the char cap -> truncated
        } else {
          priors.push({ id: `p${i}`, role: i % 2 === 0 ? "user" : "assistant", content: `prior-${i}` });
        }
      }
      const history = [...priors, userMessage("the actual question")];

      let capturedBody: { message: string; history: { role: string; content: string }[] } | undefined;
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return streamResponse([sseFrame("end", { reason: "stop" })]);
      }) as typeof fetch;

      const { handlers, donePromise } = makeHandlers();
      await transport.startRun(baseInput(history), handlers);
      await donePromise;

      assert.ok(capturedBody);
      assert.equal(capturedBody?.message, "the actual question");
      // Kept priors: oldest-dropped-first down to the most recent 12 (indices 2..13), then index 5
      // (whitespace-only) filtered out -> 11 entries; index 10's content truncated to 2000 chars.
      const kept = capturedBody!.history;
      assert.equal(kept.length, 11);
      assert.deepEqual(
        kept.map((m) => m.role),
        [2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => (i % 2 === 0 ? "user" : "assistant")),
      );
      assert.equal(kept[0]?.content, "prior-2", "index 0 and 1 (oldest) were dropped by the 12-turn cap");
      const truncated = kept.find((m) => m.content.startsWith("x"));
      assert.ok(truncated, "the over-cap entry survived the count cap (it's within the most recent 12)");
      assert.equal(truncated?.content.length, 2000);
      assert.equal(truncated?.content, "x".repeat(2000));
      assert.ok(
        kept.every((m) => m.content.trim().length > 0),
        "no whitespace-only entry should survive",
      );
    });
  });

  describe("reattachRun", () => {
    it("resolves immediately by calling onDone with an empty event log, without calling fetch", async () => {
      let fetchCalled = false;
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return streamResponse([]);
      }) as typeof fetch;

      const { handlers, doneCount, doneEvents } = makeHandlers();
      await transport.reattachRun("some-run-id", handlers);

      assert.equal(doneCount(), 1);
      assert.deepEqual(doneEvents(), []);
      assert.equal(fetchCalled, false);
    });
  });

  describe("fetchRunStatus", () => {
    it("always resolves null (no server-side run registry to query)", async () => {
      const status = await transport.fetchRunStatus("any-run-id");
      assert.equal(status, null);
    });
  });

  describe("stopRun", () => {
    it("is a no-op for an unknown or already-finished runId", async () => {
      await assert.doesNotReject(() => transport.stopRun("never-started"));
    });
  });
});
