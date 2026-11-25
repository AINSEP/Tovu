import { React, act, createRoot, installDom } from "./react-dom-harness";
import { useSiteAssistantWidget } from "../SiteAssistantWidget.hooks";
import { JSDOM } from "jsdom";
import { createSiteVanillaArgs } from "../vanilla-host";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";

import { createSiteAssistantTransport } from "../site-assistant-transport";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";

/**
 * SPEC-046/ADR-054 Task 2, now on the AG-UI wire. `createSiteAssistantTransport` is the main export
 * — everything else in the source file (`latestUserTurnIndex`, `boundHistoryForRequest`, the run
 * lifecycle and the per-event handlers) is module-private, and the SSE parsing and AG-UI validation
 * belong to Jini's `createAgUiFetchAgent`, so every test here drives the transport through the
 * public `ChatTransport` surface with `globalThis.fetch` stubbed per test (save/restore, matching
 * `remixicon-override.test.ts`'s pattern) rather than reaching into internals.
 *
 * Every fixture speaks AG-UI and echoes the `threadId`/`runId` of the request it answers (the
 * transport ignores a `RUN_STARTED` for any other ids): `answering` builds a one-shot body from the
 * request's ids and `controlledStreamResponse` exposes the same builders for hand-fed streams.
 *
 * One documented finding, since resolved: `priorTurnsBeforeLatestUserMessage`'s post-loop
 * `return history;` fallback (no `role === "user"` entry found) was unreachable through this public
 * API, and was removed in favour of a stated precondition (see that function). `startRun` calls `latestUserPromptFromHistory(input.history)` first and throws before
 * `boundHistoryForRequest` ever runs if it finds no user turn — and that helper scans for the exact
 * same condition (last `role === "user"` entry, from the end) `priorTurnsBeforeLatestUserMessage`
 * scans for, over the same unmutated array. Reaching the fallback would require history to contain a
 * user turn for the first scan and not for the second, which is impossible for the same input.
 * Removed in the T2 coverage wave under the owner's standing rule for unreachable code (remove in a
 * behaviour-preserving refactor and list it).
 */

const CHAT_URL = "/api/site-assistant/chat";

const TIMEOUT_MESSAGE = "Couldn't get an answer: the site took too long to respond. Try again.";
const RECOVERY_MESSAGE = "Couldn't get an answer from this site. Reload the page and try again.";
const NO_REPLY_MESSAGE = "Couldn't get an answer: the assistant sent no reply. Try again.";

const frame = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;

interface RequestIds { threadId: string; runId: string }

function idsOf(init: RequestInit | undefined): RequestIds {
  const body = JSON.parse(String(init!.body)) as RequestIds;
  return { threadId: body.threadId, runId: body.runId };
}

/** AG-UI frames that echo one request's ids. */
function wireFor(ids: RequestIds) {
  return {
    started: () => frame({ type: "RUN_STARTED", ...ids }),
    finished: (reason = "stop") => frame({ type: "RUN_FINISHED", ...ids, result: { reason } }),
    text: (delta: string, messageId = "m1") =>
      frame({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" })
      + frame({ type: "TEXT_MESSAGE_CONTENT", messageId, delta })
      + frame({ type: "TEXT_MESSAGE_END", messageId }),
    error: (message: string, code?: string) => frame({ type: "RUN_ERROR", message, ...(code ? { code } : {}) }),
    custom: (name: string, value: unknown) => frame({ type: "CUSTOM", name, value }),
  };
}
type Wire = ReturnType<typeof wireFor>;

/** A fetch whose single response body is built from the ids of the request it answers. */
function answering(build: (wire: Wire) => string[]): typeof fetch {
  return (async (_url: string, init: RequestInit) => streamResponse(build(wireFor(idsOf(init))))) as typeof fetch;
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

/** Keep fetch pending until the actual signal supplied by the transport aborts. */
function abortableFetchStub(): { fetch: typeof fetch; signal: () => AbortSignal } {
  let capturedSignal: AbortSignal;
  return {
    signal: () => capturedSignal,
    fetch: (async (_url: string, opts: RequestInit) => {
      capturedSignal = opts.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException("Aborted", "AbortError"));
        if (capturedSignal.aborted) abort();
        else capturedSignal.addEventListener("abort", abort, { once: true });
      });
    }) as typeof fetch,
  };
}

function controlledStreamResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let ids!: RequestIds;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
  const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const response = new Response(stream, { headers: { "content-type": "text/event-stream" } });
  return {
    response,
    /** Answers with the held-open body and records the request's ids; await `ready` before `wire()`. */
    fetch: (async (_url: string, init: RequestInit) => { ids = idsOf(init); resolveReady(); return response; }) as typeof fetch,
    ready,
    wire: () => wireFor(ids),
    send: (frame: string) => controller.enqueue(new TextEncoder().encode(frame)),
    close: () => controller.close(),
  };
}

// Let the pump finish its pending reads while the response remains open.
const flushStream = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The AG-UI request's `messages` read as the latest turn plus the prior turns before it. */
function toLegacyShape(body: { messages: { role: string; content: string }[] }): { message: string; history: { role: string; content: string }[] } {
  const prior = body.messages.slice(0, -1).map(({ role, content }) => ({ role, content }));
  return { message: body.messages.at(-1)!.content, history: prior };
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
        return streamResponse([]);
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

    it("posts the latest message with same-origin credentials and no provider auth header", async () => {
      let capturedUrl: string | undefined;
      let capturedInit: RequestInit | undefined;
      globalThis.fetch = (async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return streamResponse([wireFor(idsOf(init)).started(), wireFor(idsOf(init)).finished()]);
      }) as typeof fetch;

      const { handlers, donePromise } = makeHandlers();
      const { runId } = await transport.startRun(baseInput([userMessage("hello there")]), handlers);
      await donePromise;

      assert.equal(capturedUrl, CHAT_URL);
      assert.equal(capturedInit?.method, "POST");
      assert.equal((capturedInit?.headers as Record<string, string>)["Content-Type"], "application/json");
      assert.equal(capturedInit?.credentials, "same-origin");
      assert.equal(new Headers(capturedInit?.headers).has("Authorization"), false);
      assert.equal(new Headers(capturedInit?.headers).get("accept"), "text/event-stream; agui=1");
      const body = JSON.parse(capturedInit?.body as string) as { messages: { role: string; content: string }[] };
      assert.equal(body.messages.at(-1)?.content, "hello there");
      assert.deepEqual(body.messages.slice(0, -1), []);
      assert.match(runId, /^[0-9a-f-]{36}$/i);
    });

    it("streams text and client_directive frames through onEvent and collects both for onDone", async () => {
      globalThis.fetch = answering((w) => [
        w.started(),
        frame({ type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" }),
        frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Hi " }),
        frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "there" }),
        frame({ type: "TEXT_MESSAGE_END", messageId: "m1" }),
        w.custom("client_directive", { type: "highlight_entry", title: "My Post" }),
        w.finished(),
      ]);

      const { handlers, events, doneCount, doneEvents, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, [
        { kind: "text", text: "Hi " },
        { kind: "text", text: "there" },
      ]);
      assert.equal(doneCount(), 1);
      assert.deepEqual(doneEvents(), events);
    });

    it("preserves split frames, split delimiters, and split UTF-8 bytes", async () => {
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        const w = wireFor(idsOf(init));
        const encoded = new TextEncoder().encode(
          w.started() + w.text("Hi 🌍 café") + w.custom("client_directive", { type: "highlight_entry", title: "Café" }) + w.finished(),
        );
        const emojiStart = Buffer.from(encoded).indexOf(Buffer.from("🌍"));
        const cuts = [5, emojiStart + 1, emojiStart + 3, encoded.length - 1];
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            let offset = 0;
            for (const cut of cuts) {
              controller.enqueue(encoded.slice(offset, cut));
              offset = cut;
            }
            controller.enqueue(encoded.slice(offset));
            controller.close();
          },
        }));
      }) as typeof fetch;
      const { handlers, events, errors, doneCount, doneEvents, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      assert.deepEqual(errors, []);
      assert.deepEqual(events, [
        { kind: "text", text: "Hi 🌍 café" },
      ]);
      assert.equal(doneCount(), 1);
      assert.deepEqual(doneEvents(), events);
    });

    it("delivers text while the response is still open, before end or EOF", async () => {
      const stream = controlledStreamResponse();
      globalThis.fetch = stream.fetch;
      const { handlers, events, errors, doneCount, doneEvents, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await stream.ready;
      try {
        stream.send(stream.wire().started() + stream.wire().text("first"));
        await flushStream();
        assert.deepEqual(events, [{ kind: "text", text: "first" }]);
        assert.equal(doneCount(), 0);
        stream.send(stream.wire().finished());
        await flushStream();
        assert.equal(doneCount(), 1);
        assert.deepEqual(doneEvents(), events);
        assert.deepEqual(errors, []);
      } finally {
        stream.close();
      }
      await donePromise;
    });

    it("drains multiple coalesced frames exactly once and in order", async () => {
      globalThis.fetch = answering((w) => [
        w.started() + w.text("one", "m1") + w.text("two", "m2") +
        w.custom("client_directive", { type: "highlight_entry", title: "Post" }) +
        w.finished(),
      ]);
      const { handlers, events, errors, doneCount, doneEvents, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      assert.deepEqual(events, [
        { kind: "text", text: "one" },
        { kind: "text", text: "two" },
      ]);
      assert.deepEqual(errors, []);
      assert.equal(doneCount(), 1);
      assert.deepEqual(doneEvents(), events);
    });

    it("drops unknown and retired client directives before transcript events", async () => {
      globalThis.fetch = answering((w) => [w.started(), w.custom("client_directive", { anything: [1, 2, 3] }), w.finished()]);

      const { handlers, events, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, []);
    });

    // AG-UI's RUN_ERROR is terminal (legacy `error` frames were not); the visitor-visible contract is
    // one reported error, one finish, and nothing after it changing either.
    it("surfaces a RUN_ERROR via onError exactly once, finishes the run, and ignores later frames", async () => {
      const stream = controlledStreamResponse();
      globalThis.fetch = stream.fetch;
      const { handlers, events, errors, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await stream.ready;
      try {
        stream.send(stream.wire().started() + stream.wire().error("upstream hiccup"));
        await flushStream();
        assert.equal(errors.length, 1);
        assert.equal(doneCount(), 1, "a RUN_ERROR finishes the run");
        stream.send(stream.wire().text("still going") + stream.wire().finished());
        await flushStream();
      } finally {
        stream.close();
      }
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, "Couldn't get an answer: upstream hiccup. Try again.");
      assert.deepEqual(events, [], "nothing after the terminal error reaches the transcript");
      assert.equal(doneCount(), 1, "onDone fires exactly once");
    });

    it("falls back to the generic recovery wording when a RUN_ERROR carries no message", async () => {
      globalThis.fetch = answering((w) => [w.started(), w.error("")]);

      const { handlers, errors, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, RECOVERY_MESSAGE);
    });

    it("ends the run with the recovery error when the stream closes with no terminal frame", async () => {
      globalThis.fetch = answering((w) => [w.started(), w.text("partial")]);

      const { handlers, events, errors, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, [{ kind: "text", text: "partial" }]);
      assert.deepEqual(errors.map((e) => e.message), [RECOVERY_MESSAGE]);
      assert.equal(doneCount(), 1);
    });

    it("reports malformed JSON once, finishes once, and removes the active run", async () => {
      let signal!: AbortSignal;
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        return streamResponse([wireFor(idsOf(init)).started(), "data: {bad\n\n"]);
      }) as typeof fetch;
      const { handlers, events, errors, doneCount, doneEvents, donePromise } = makeHandlers();
      const { runId } = await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, RECOVERY_MESSAGE);
      assert.deepEqual(events, []);
      assert.equal(doneCount(), 1);
      assert.deepEqual(doneEvents(), []);
      await transport.stopRun(runId);
      assert.equal(signal.aborted, false, "a finished run must no longer be cancellable");
    });

    it("skips a keep-alive comment frame (no data: line) without crashing or forwarding it", async () => {
      globalThis.fetch = answering((w) => [": keep-alive\n\n", w.started(), w.text("after keep-alive"), w.finished()]);

      const { handlers, events, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.deepEqual(events, [{ kind: "text", text: "after keep-alive" }]);
      assert.equal(doneCount(), 1);
    });

    it("ignores a CUSTOM event with an unrecognized name (matches no known kind)", async () => {
      globalThis.fetch = answering((w) => [w.started(), w.custom("something_else", { delta: "ignored" }), w.finished()]);

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
      assert.equal(errors[0]?.message, "Couldn't get an answer: rate limited. Try again.");
      assert.equal(doneCount(), 1, "a non-ok response still finishes the run");
    });

    it("falls back to a status-coded message when a non-ok response body is not JSON", async () => {
      globalThis.fetch = (async () => new Response("<html>502</html>", { status: 502 })) as typeof fetch;

      const { handlers, errors, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, "Couldn't get an answer: This site could not answer (HTTP 502). Try again.");
    });

    it("throws 'no stream body' when the response has no body at all", async () => {
      globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;

      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.message, RECOVERY_MESSAGE);
      assert.equal(doneCount(), 1);
    });

    it("finishes with no onError when input.signal aborts before the response resolves", async () => {
      const pending = abortableFetchStub();
      globalThis.fetch = pending.fetch;

      const controller = new AbortController();
      const { handlers, events, errors, doneCount, doneEvents, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")], controller.signal), handlers);
      assert.equal(pending.signal().aborted, false);
      controller.abort();
      assert.equal(pending.signal().aborted, true, "input cancellation must abort fetch");
      await donePromise;

      assert.equal(errors.length, 0, "an abort we caused is not a reportable failure");
      assert.equal(events.length, 0);
      assert.equal(doneCount(), 1);
      assert.deepEqual(doneEvents(), []);
    });

    it("finishes with no onError when stopRun aborts an in-flight request", async () => {
      const pending = abortableFetchStub();
      globalThis.fetch = pending.fetch;

      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      const { runId } = await transport.startRun(baseInput([userMessage("hi")]), handlers);
      assert.equal(pending.signal().aborted, false);
      await transport.stopRun(runId);
      assert.equal(pending.signal().aborted, true, "stopRun must abort fetch");
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
      assert.equal(errors[0]?.message, RECOVERY_MESSAGE);
      assert.equal(doneCount(), 1);
    });

    it("wraps a non-Error stream rejection reason in an Error before reporting it", async () => {
      globalThis.fetch = (async () => erroringStreamResponse("boom-non-error")) as typeof fetch;

      const { handlers, errors, donePromise } = makeHandlers();
      await transport.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;

      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof Error);
      assert.equal(errors[0]?.message, RECOVERY_MESSAGE);
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
        capturedBody = toLegacyShape(JSON.parse(init.body as string));
        return streamResponse([wireFor(idsOf(init)).started(), wireFor(idsOf(init)).finished()]);
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

  // Visitor-visible failures: both widget builds paint `onError`'s message where the reply would
  // be, so every way a turn can go wrong must reach it exactly once and still finish the run.
  describe("startRun failure reporting (DI fetch)", () => {
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    it("reports an end-only stream (no text, no page action) as one no-reply error and still finishes", async () => {
      const injected = createSiteAssistantTransport({}, { fetch: answering((w) => [w.started(), w.finished()]) });
      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await injected.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      assert.deepEqual(errors.map((e) => e.message), [NO_REPLY_MESSAGE]);
      assert.equal(doneCount(), 1);
    });

    it("treats whitespace-only text that ends the run cleanly as no reply", async () => {
      const injected = createSiteAssistantTransport({}, { fetch: answering((w) => [w.started(), w.text("  \n"), w.finished()]) });
      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await injected.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      assert.deepEqual(errors.map((e) => e.message), [NO_REPLY_MESSAGE]);
      assert.equal(doneCount(), 1);
    });

    it("a retired page action alone is not a reply", async () => {
      const injected = createSiteAssistantTransport({}, { fetch: answering((w) => [
        w.started(),
        w.custom("client_directive", { type: "navigate", target: { path: "/about", title: "About" }, auto: true }),
        w.finished(),
      ]) });
      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await injected.startRun(baseInput([userMessage("take me to about")]), handlers);
      await donePromise;
      assert.equal(errors.length, 1);
      assert.equal(doneCount(), 1);
    });

    it("does not add a no-reply error on top of a server error frame", async () => {
      const injected = createSiteAssistantTransport({}, { fetch: answering((w) => [
        w.started(),
        w.error("Visitor AI needs a saved key and model."),
        w.finished("error"),
      ]) });
      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await injected.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      assert.deepEqual(errors.map((e) => e.message), ["Couldn't get an answer: Visitor AI needs a saved key and model. Try again."]);
      assert.equal(doneCount(), 1);
    });

    it("stays silent for an error frame that arrives after the run already ended", async () => {
      const injected = createSiteAssistantTransport({}, { fetch: answering((w) => [
        w.started(),
        w.text("answer"),
        w.finished(),
        w.error("late"),
      ]) });
      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await injected.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      await flushStream();
      assert.deepEqual(errors, []);
      assert.equal(doneCount(), 1);
    });

    it("does not re-arm or fire the idle timer for chunks received after end", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const schedule = t.mock.method(globalThis, "setTimeout");
      const stream = controlledStreamResponse();
      let requestSignal!: AbortSignal;
      const injected = createSiteAssistantTransport({}, { idleTimeoutMs: 100, fetch: async (url, init) => {
        requestSignal = init!.signal!;
        return stream.fetch(url, init);
      } });
      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      try {
        await injected.startRun(baseInput([userMessage("hi")]), handlers);
        await stream.ready;
        stream.send(stream.wire().started() + stream.wire().text("answer") + stream.wire().finished());
        await donePromise;
        const schedulesAtEnd = schedule.mock.callCount();
        stream.send(": late keep-alive\n\n");
        await flushStream();
        t.mock.timers.tick(200);
        await flushStream();
        assert.equal(requestSignal.aborted, false, "no idle timer may fire after end");
        assert.equal(schedule.mock.callCount(), schedulesAtEnd, "late bytes must not schedule a timer");
        assert.deepEqual(errors, []);
        assert.equal(doneCount(), 1);
      } finally {
        stream.close();
        await flushStream();
      }
    });

    it("removes the input abort listener at end even while the response remains open", async () => {
      const stream = controlledStreamResponse();
      const input = baseInput([userMessage("hi")]);
      const listenersBefore = getEventListeners(input.signal, "abort").length;
      const injected = createSiteAssistantTransport({}, { fetch: stream.fetch });
      const { handlers, donePromise } = makeHandlers();
      try {
        await injected.startRun(input, handlers);
        await stream.ready;
        assert.equal(getEventListeners(input.signal, "abort").length, listenersBefore + 1);
        stream.send(stream.wire().started() + stream.wire().text("answer") + stream.wire().finished());
        await donePromise;
        assert.equal(getEventListeners(input.signal, "abort").length, listenersBefore);
      } finally {
        stream.close();
        await flushStream();
      }
    });

    for (const delivery of ["same chunk", "later chunk"] as const) {
      it(`ignores all frames after end in the ${delivery}`, async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const stream = controlledStreamResponse();
        const frontendFinish = t.mock.fn();
        const confirmation = t.mock.fn();
        const injected = createSiteAssistantTransport({}, {
          fetch: stream.fetch,
          frontend: { headers: async () => ({}), finish: frontendFinish },
          onToolConfirmation: confirmation,
        });
        const { handlers, events, errors, doneCount, doneEvents, donePromise } = makeHandlers();
        try {
          await injected.startRun(baseInput([userMessage("hi")]), handlers);
          await stream.ready;
          const w = stream.wire();
          const end = w.started() + w.text("answer") + w.finished();
          const late = w.text("late", "m2") + w.error("late error") +
            w.custom("client_directive", { kind: "tool_confirmation", challengeId: "a".repeat(22), title: "Allow?", summary: "Search." }) +
            w.finished("navigation");
          stream.send(end + (delivery === "same chunk" ? late : ""));
          await donePromise;
          if (delivery === "later chunk") stream.send(late);
          await flushStream();
          assert.deepEqual(events, [{ kind: "text", text: "answer" }]);
          assert.deepEqual(doneEvents(), [{ kind: "text", text: "answer" }], "completed transcript must stay unchanged");
          assert.deepEqual(errors, []);
          assert.equal(doneCount(), 1);
          assert.equal(frontendFinish.mock.callCount(), 1);
          assert.equal(frontendFinish.mock.calls[0]!.arguments[0].navigation, false);
          assert.deepEqual(confirmation.mock.calls.map(call => call.arguments[0]), [{ directive: null }]);
        } finally {
          stream.close();
          await flushStream();
        }
      });
    }

    it("words a fetch network failure as an unreachable site", async () => {
      const injected = createSiteAssistantTransport({}, { fetch: (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch });
      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await injected.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      assert.deepEqual(errors.map((e) => e.message), ["Couldn't get an answer: couldn't reach the site. Try again."]);
      assert.equal(doneCount(), 1);
    });

    it("times out a request that never answers: aborts fetch, reports once, finishes", async () => {
      const pending = abortableFetchStub();
      const injected = createSiteAssistantTransport({}, { fetch: pending.fetch, idleTimeoutMs: 20 });
      const { handlers, errors, doneCount, donePromise } = makeHandlers();
      await injected.startRun(baseInput([userMessage("hi")]), handlers);
      await donePromise;
      assert.equal(pending.signal().aborted, true, "the idle timer must abort the hung request");
      assert.deepEqual(errors.map((e) => e.message), [TIMEOUT_MESSAGE]);
      assert.equal(doneCount(), 1);
    });

    it("restarts the idle timer on every received chunk, so a slow but live reply is not cut off", async () => {
      const stream = controlledStreamResponse();
      const injected = createSiteAssistantTransport({}, { fetch: stream.fetch, idleTimeoutMs: 300 });
      const { handlers, events, errors, doneCount, donePromise } = makeHandlers();
      await injected.startRun(baseInput([userMessage("hi")]), handlers);
      await stream.ready;
      stream.send(stream.wire().started());
      for (const [i, part] of ["one ", "two ", "three"].entries()) {
        await sleep(150);
        stream.send(stream.wire().text(part, `m${i}`));
      }
      await sleep(150);
      stream.send(stream.wire().finished());
      stream.close();
      await donePromise;
      assert.deepEqual(errors, [], "600ms total but never 300ms of silence: no timeout");
      assert.equal(events.length, 3);
      assert.equal(doneCount(), 1);
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

describe("history scanning when the latest user turn is not the last entry", () => {
  it("sends the latest user turn as the message and only the turns before it as history", async () => {
    let capturedBody: { message: string; history: { role: string; content: string }[] } | undefined;
    const transport = createSiteAssistantTransport({}, {
      fetch: (async (_url: string, init: RequestInit) => {
        capturedBody = toLegacyShape(JSON.parse(init.body as string));
        return streamResponse([wireFor(idsOf(init)).started(), wireFor(idsOf(init)).finished()]);
      }) as typeof fetch,
    });
    const history: ChatMessage[] = [
      userMessage("first question"),
      { id: "a1", role: "assistant", content: "first answer" },
      userMessage("second question"),
      { id: "a2", role: "assistant", content: "partial reply still streaming" },
    ];
    const { handlers, donePromise } = makeHandlers();
    await transport.startRun(baseInput(history), handlers);
    await donePromise;
    assert.equal(capturedBody?.message, "second question");
    assert.deepEqual(capturedBody?.history, [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);
  });
});

for (const mode of ["React transport", "vanilla host"]) {
  it(`${mode}: malformed envelopes and body I/O settle once with private evidence`, async () => {
    const savedFetch = globalThis.fetch;
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
    try {
      for (const scenario of ["html", "read", "reference"]) {
        const cause = new TypeError("password=BODY_IO_CANARY");
        globalThis.fetch = async () => {
          if (scenario === "html") return new Response("<html>HTML_CANARY</html>", { status: 502 });
          if (scenario === "reference") return Response.json({ error: "Visitor replies are paused.", errorId: "visitor-incident-7" }, { status: 503 });
          const response = new Response(null, { status: 504 });
          response.json = async () => { throw cause; };
          return response;
        };
        const transport = mode === "vanilla host"
          ? createSiteVanillaArgs({ element: dom.window.document.getElementById("root")! }, { document: dom.window.document }).transport
          : createSiteAssistantTransport();
        const { handlers, errors, doneCount, donePromise } = makeHandlers();
        await transport.startRun(baseInput([userMessage("hello")]), handlers);
        await donePromise;
        assert.equal(doneCount(), 1);
        assert.equal(errors.length, 1);
        assert.doesNotMatch(errors[0]!.message, /HTML_CANARY|BODY_IO_CANARY/);
        if (scenario === "reference") assert.match(errors[0]!.message, /Visitor replies are paused.*visitor-incident-7/);
        else assert.match(errors[0]!.message, new RegExp(`HTTP ${scenario === "html" ? 502 : 504}`));
        if (scenario === "read") assert.equal((errors[0]!.cause as Error).cause, cause);
      }
    } finally { globalThis.fetch = savedFetch; dom.window.close(); }
  });
}

it("the React widget hook delivers the same safe refusal reference and settles once", async () => {
  const savedFetch = globalThis.fetch;
  const { dom, restore } = installDom({ html: '<div id="tovu-site-assistant-root"></div>' }, { url: 'https://example.test/' });
  const root = createRoot(dom.window.document.getElementById("tovu-site-assistant-root")!);
  let transport!: ChatTransport;
  function Probe() { transport = useSiteAssistantWidget({}).transport; return null; }
  try {
    globalThis.fetch = async () => Response.json({ error: "Visitor replies are paused.", errorId: "react-visitor-incident" }, { status: 503 });
    await act(async () => root.render(React.createElement(Probe)));
    const { handlers, errors, doneCount, donePromise } = makeHandlers();
    await act(async () => { await transport.startRun(baseInput([userMessage("hello")]), handlers); await donePromise; });
    assert.equal(errors.length, 1);
    assert.match(errors[0]!.message, /Visitor replies are paused.*react-visitor-incident/);
    assert.equal(doneCount(), 1);
  } finally { await act(async () => root.unmount()); globalThis.fetch = savedFetch; restore(); }
});
