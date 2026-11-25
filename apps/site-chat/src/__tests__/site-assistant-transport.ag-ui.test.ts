import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import type { ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers, StartRunInput } from "@jini-ai/chat/react";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";

import { createSiteAssistantTransport } from "../site-assistant-transport";
import { createSiteVanillaArgs } from "../vanilla-host";

/**
 * The visitor transport on the negotiated AG-UI wire (P6-T1.T). Kept apart from
 * `site-assistant-transport.test.ts` because this file must not import React: the AG-UI request,
 * idle and terminal rules are transport behavior and must stay runnable without a renderer.
 */

const TIMEOUT_MESSAGE = "Couldn't get an answer: the site took too long to respond. Try again.";
const RECOVERY_MESSAGE = "Couldn't get an answer from this site. Reload the page and try again.";

const frame = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;

interface SentRun { threadId: string; runId: string; body: Record<string, unknown>; init: RequestInit }

function readSent(init: RequestInit | undefined): SentRun {
  const body = JSON.parse(String(init!.body)) as { threadId: string; runId: string };
  return { threadId: body.threadId, runId: body.runId, body, init: init! };
}

/** A response whose bytes the test writes by hand, and a fetch that answers only when told to. */
function controlledServer() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  let answer!: (response: Response) => void;
  let sent: SentRun | undefined;
  const fetch = (async (_url: string, init: RequestInit) => {
    sent = readSent(init);
    return new Promise<Response>((resolve, reject) => {
      answer = resolve;
      init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }) as typeof globalThis.fetch;
  return {
    fetch,
    sent: () => sent!,
    answer: () => answer(new Response(stream, { headers: { "content-type": "text/event-stream" } })),
    send: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
    close: () => controller.close(),
    started: () => frame({ type: "RUN_STARTED", threadId: sent!.threadId, runId: sent!.runId }),
    finished: (reason = "stop") => frame({ type: "RUN_FINISHED", threadId: sent!.threadId, runId: sent!.runId, result: { reason } }),
  };
}

const text = (delta: string) =>
  frame({ type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" })
  + frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta })
  + frame({ type: "TEXT_MESSAGE_END", messageId: "m1" });

// Let the reader finish its pending reads while the response remains open.
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise<void>((resolve) => setImmediate(resolve)); };

function userMessage(content: string): ChatMessage {
  return { id: `msg-${content}`, role: "user", content };
}

function baseInput(history: ChatMessage[]): StartRunInput {
  return { history, signal: new AbortController().signal };
}

function makeHandlers() {
  const events: AgentEvent[] = [];
  const errors: Error[] = [];
  let doneCount = 0;
  let resolveDone!: () => void;
  const donePromise = new Promise<void>((resolve) => { resolveDone = resolve; });
  const handlers: RunHandlers = {
    onEvent: (ev) => events.push(ev),
    onError: (err) => errors.push(err),
    onDone: () => { doneCount += 1; resolveDone(); },
  };
  return { handlers, events, errors, doneCount: () => doneCount, donePromise };
}

describe("visitor AG-UI transport", () => {
  it("idle timeout aborts once after the last byte", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    // Pre-header silence: a server that never answers times out from the moment the turn starts.
    const silent = controlledServer();
    const silentRun = makeHandlers();
    await createSiteAssistantTransport({}, { idleTimeoutMs: 100, fetch: silent.fetch }).startRun(baseInput([userMessage("hi")]), silentRun.handlers);
    t.mock.timers.tick(99);
    await flush();
    assert.equal((silent.sent().init.signal as AbortSignal).aborted, false);
    t.mock.timers.tick(1);
    await silentRun.donePromise;
    assert.deepEqual(silentRun.errors.map((e) => e.message), [TIMEOUT_MESSAGE]);

    // Split frames and a heartbeat are bytes without a complete event; each restarts the timer.
    const server = controlledServer();
    const run = makeHandlers();
    await createSiteAssistantTransport({}, { idleTimeoutMs: 100, fetch: server.fetch }).startRun(baseInput([userMessage("hi")]), run.handlers);
    // The page-header step settles a few microtasks before the chat POST is made.
    await flush();
    server.answer();
    const reply = server.started() + text("Hello there");
    server.send(reply.slice(0, 40));
    await flush();
    t.mock.timers.tick(60);
    server.send(reply.slice(40));
    await flush();
    t.mock.timers.tick(60);
    server.send(": keep-alive\n\n");
    await flush();
    t.mock.timers.tick(60);
    server.send(": keep-alive\n\n");
    await flush();
    t.mock.timers.tick(99);
    await flush();
    const signal = server.sent().init.signal as AbortSignal;
    assert.equal(signal.aborted, false, "every received byte restarts the idle timer");
    assert.deepEqual(run.events, [{ kind: "text", text: "Hello there" }]);
    t.mock.timers.tick(1);
    await run.donePromise;
    await flush();
    assert.equal(signal.aborted, true);
    assert.deepEqual(run.errors.map((e) => e.message), [TIMEOUT_MESSAGE], "the timeout is reported exactly once");
    assert.equal(run.doneCount(), 1);
    t.mock.timers.tick(500);
    await flush();
    assert.equal(run.errors.length, 1);
    assert.equal(run.doneCount(), 1);
  });

  it("EOF without a terminal does not mark a partial reply successful", async () => {
    const finishes: unknown[] = [];
    const frontend = { headers: async () => ({}), acceptBrowserInvocation: () => {}, finish: (args: unknown) => { finishes.push(args); } };

    // Interrupted: partial text, split across chunks, then the body just ends.
    const cut = controlledServer();
    const cutRun = makeHandlers();
    await createSiteAssistantTransport({}, { fetch: cut.fetch, frontend }).startRun(baseInput([userMessage("hi")]), cutRun.handlers);
    // The page-header step settles a few microtasks before the chat POST is made.
    await flush();
    cut.answer();
    const partial = cut.started() + frame({ type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" }) + frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Half an ans" });
    cut.send(partial.slice(0, 25));
    cut.send(partial.slice(25));
    await flush();
    cut.close();
    await cutRun.donePromise;
    assert.deepEqual(cutRun.events, [{ kind: "text", text: "Half an ans" }]);
    assert.deepEqual(cutRun.errors.map((e) => e.message), [RECOVERY_MESSAGE]);
    assert.equal(cutRun.doneCount(), 1);
    assert.deepEqual(finishes, [], "an interrupted reply is never saved as a success");

    // Stop mid-reply is the visitor's own choice: silent, settled once.
    const stopped = controlledServer();
    const stopRun = makeHandlers();
    const stopTransport = createSiteAssistantTransport({}, { fetch: stopped.fetch, frontend });
    const { runId } = await stopTransport.startRun(baseInput([userMessage("hi")]), stopRun.handlers);
    // The page-header step settles a few microtasks before the chat POST is made.
    await flush();
    stopped.answer();
    stopped.send(stopped.started() + text("partial"));
    await flush();
    await stopTransport.stopRun(runId);
    await stopRun.donePromise;
    assert.deepEqual(stopRun.errors, []);
    assert.equal(stopRun.doneCount(), 1);
    assert.deepEqual(finishes, []);

    // A real terminal succeeds once; late bytes and events after it change nothing.
    const done = controlledServer();
    const doneRun = makeHandlers();
    await createSiteAssistantTransport({}, { fetch: done.fetch, frontend }).startRun(baseInput([userMessage("hi")]), doneRun.handlers);
    // The page-header step settles a few microtasks before the chat POST is made.
    await flush();
    done.answer();
    done.send(done.started() + text("Full answer") + done.finished());
    await doneRun.donePromise;
    done.send(text("late") + frame({ type: "RUN_ERROR", message: "late" }));
    await flush();
    done.close();
    await flush();
    assert.deepEqual(doneRun.events, [{ kind: "text", text: "Full answer" }]);
    assert.deepEqual(doneRun.errors, []);
    assert.equal(doneRun.doneCount(), 1);
    assert.equal(finishes.length, 1);
  });

  it("page navigation still navigates after saving the reply", async () => {
    const finishes: Array<{ navigation: boolean; messages?: ChatMessage[] }> = [];
    const frontend = { headers: async () => ({ "X-Visitor-Tab": "tab-1" }), acceptBrowserInvocation: () => {}, finish: (args: { navigation: boolean; messages?: ChatMessage[] }) => { finishes.push(args); } };
    const server = controlledServer();
    const run = makeHandlers();
    const history = [userMessage("take me to about")];
    await createSiteAssistantTransport({}, { fetch: server.fetch, frontend }).startRun(baseInput(history), run.handlers);
    // The page-header step settles a few microtasks before the chat POST is made.
    await flush();
    server.answer();
    server.send(server.started() + text("Opening About.")
      + frame({ type: "CUSTOM", name: "client_directive", value: { type: "navigate", target: { path: "/about", title: "About" }, auto: true } })
      + server.finished("navigation"));
    await run.donePromise;
    server.close();
    await flush();
    assert.equal(new Headers(server.sent().init.headers).get("x-visitor-tab"), "tab-1", "frontend headers still travel");
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.events, [{ kind: "text", text: "Opening About." }], "the directive never enters the transcript");
    assert.equal(finishes.length, 1);
    assert.equal(finishes[0]!.navigation, true, "the navigation terminal releases the deferred page action");
    const saved = finishes[0]!.messages!;
    assert.deepEqual(saved.slice(0, 1), history);
    assert.equal(saved[1]!.role, "assistant");
    assert.equal(saved[1]!.content, "Opening About.");
  });

  // Sheet C refusal witness, rerun against the AG-UI request: refusal behavior is unchanged.
  for (const mode of ["React transport", "vanilla host"]) {
    it(`${mode}: malformed envelopes and body I/O settle once with private evidence`, async () => {
      const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
      try {
        for (const scenario of ["html", "read", "reference"]) {
          const cause = new TypeError("password=BODY_IO_CANARY");
          let sent: SentRun | undefined;
          const fetch = (async (_url: string, init: RequestInit) => {
            sent = readSent(init);
            if (scenario === "html") return new Response("<html>HTML_CANARY</html>", { status: 502 });
            if (scenario === "reference") return Response.json({ error: "Visitor replies are paused.", errorId: "visitor-incident-7" }, { status: 503 });
            const response = new Response(null, { status: 504 });
            response.json = async () => { throw cause; };
            return response;
          }) as typeof globalThis.fetch;
          const savedFetch = globalThis.fetch;
          globalThis.fetch = fetch;
          try {
            const transport = mode === "vanilla host"
              ? createSiteVanillaArgs({ element: dom.window.document.getElementById("root")! }, { document: dom.window.document }).transport
              : createSiteAssistantTransport();
            const { handlers, errors, doneCount, donePromise } = makeHandlers();
            await transport.startRun(baseInput([userMessage("hello")]), handlers);
            await donePromise;
            assert.equal(new Headers(sent!.init.headers).get("accept"), "text/event-stream; agui=1");
            assert.deepEqual([sent!.init.credentials, sent!.init.mode, sent!.init.redirect], ["same-origin", "same-origin", "error"]);
            assert.equal(doneCount(), 1);
            assert.equal(errors.length, 1);
            assert.doesNotMatch(errors[0]!.message, /HTML_CANARY|BODY_IO_CANARY/);
            if (scenario === "reference") assert.match(errors[0]!.message, /Visitor replies are paused.*visitor-incident-7/);
            else assert.match(errors[0]!.message, new RegExp(`HTTP ${scenario === "html" ? 502 : 504}`));
            if (scenario === "read") assert.equal((errors[0]!.cause as Error).cause, cause);
          } finally { globalThis.fetch = savedFetch; }
        }
      } finally { dom.window.close(); }
    });
  }
});
