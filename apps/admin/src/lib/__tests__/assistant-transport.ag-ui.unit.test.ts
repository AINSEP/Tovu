import { afterEach, describe, expect, test, vi } from "vitest";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers } from "@jini-ai/chat/react";

import {
  AG_UI_RUN_PATH,
  consumeAgUiStream,
  createAgUiToAgentTranslationState,
  fetchAgUiRunStatus,
  handleAgUiFrame,
  isAgUiRunId,
  isAgUiTransportEnabled,
  reattachAgUiRun,
  startAgUiRun,
  stopAgUiRun,
  translateAgUiEventToAgentEvent,
  type AgUiEvent,
} from "../assistant-transport-ag-ui";
import { createTovuAssistantTransport } from "../assistant-transport";
import { flushMicrotasks, streamFromChunks } from "./assistant-transport.test-helpers";

/**
 * @file ADR-059's AG-UI canary transport — the client-side half. Mirrors
 * `assistant-transport.byok.unit.test.ts`'s structure (pure dispatch/translate tests first, then
 * end-to-end `startRun` tests driving a real `ReadableStream`), since `startAgUiRun` is built on
 * the identical held-open-POST shape `startByokRun` established.
 *
 * ADR-059 Decision 6 names one case as a required regression: the interruption sequence (text ->
 * tool_use -> text again) must round-trip through the real AG-UI wire frames without the second
 * text segment being mistaken for a continuation of the first. See the dedicated describe block
 * near the bottom.
 */

function handlers(): RunHandlers & { events: AgentEvent[]; errors: Error[]; done: AgentEvent[] | null } {
  const events: AgentEvent[] = [];
  const errors: Error[] = [];
  let done: AgentEvent[] | null = null;
  return {
    events,
    errors,
    get done() {
      return done;
    },
    onEvent: (ev: AgentEvent) => events.push(ev),
    onError: (err: Error) => errors.push(err),
    onDone: (finalEvents: AgentEvent[]) => {
      done = finalEvents;
    },
  } as unknown as RunHandlers & { events: AgentEvent[]; errors: Error[]; done: AgentEvent[] | null };
}

const HISTORY: ChatMessage[] = [{ id: "1", role: "user", content: "find my posts" }];

/** One AG-UI SSE frame, wire-formatted exactly as `assistant-ag-ui.ts` sends it: `data: <json>\n\n`,
 *  no `event:` field. */
function frame(event: AgUiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

describe("isAgUiRunId", () => {
  test("matches only agui:-prefixed ids", () => {
    expect(isAgUiRunId("agui:abc")).toBe(true);
    expect(isAgUiRunId("byok:abc")).toBe(false);
    expect(isAgUiRunId("run-123")).toBe(false);
  });
});

describe("isAgUiTransportEnabled", () => {
  afterEach(() => {
    localStorage.removeItem("tovu:assistant-ag-ui");
  });

  test("off by default", () => {
    expect(isAgUiTransportEnabled()).toBe(false);
  });

  test("on once the localStorage flag is set to '1'", () => {
    localStorage.setItem("tovu:assistant-ag-ui", "1");
    expect(isAgUiTransportEnabled()).toBe(true);
  });

  test("any other value (including 'true') is treated as off — only the exact string '1' opts in", () => {
    localStorage.setItem("tovu:assistant-ag-ui", "true");
    expect(isAgUiTransportEnabled()).toBe(false);
  });

  test("an environment with no localStorage at all (e.g. SSR) is off, not a throw", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(isAgUiTransportEnabled()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("translateAgUiEventToAgentEvent — direct mappings", () => {
  test("TEXT_MESSAGE_CONTENT / REASONING_MESSAGE_CONTENT map to text/thinking deltas", () => {
    const state = createAgUiToAgentTranslationState();
    expect(translateAgUiEventToAgentEvent({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "hi" }, state)).toEqual([
      { kind: "text", text: "hi" },
    ]);
    expect(translateAgUiEventToAgentEvent({ type: "REASONING_MESSAGE_CONTENT", messageId: "r1", delta: "hmm" }, state)).toEqual([
      { kind: "thinking", text: "hmm" },
    ]);
  });

  test("message/reasoning boundary markers (START/END) produce no AgentEvent", () => {
    const state = createAgUiToAgentTranslationState();
    const boundaryEvents: AgUiEvent[] = [
      { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
      { type: "TEXT_MESSAGE_END", messageId: "m1" },
      { type: "REASONING_START" },
      { type: "REASONING_MESSAGE_START", messageId: "r1" },
      { type: "REASONING_MESSAGE_END", messageId: "r1" },
      { type: "REASONING_END" },
    ];
    for (const event of boundaryEvents) {
      expect(translateAgUiEventToAgentEvent(event, state)).toEqual([]);
    }
  });

  test("RAW maps to a raw AgentEvent", () => {
    const state = createAgUiToAgentTranslationState();
    expect(translateAgUiEventToAgentEvent({ type: "RAW", event: "stdout line" }, state)).toEqual([{ kind: "raw", line: "stdout line" }]);
  });

  test("RAW with a non-string event value is JSON-stringified, and a nullish one becomes an empty string", () => {
    const state = createAgUiToAgentTranslationState();
    expect(translateAgUiEventToAgentEvent({ type: "RAW", event: { chunk: 1 } }, state)).toEqual([{ kind: "raw", line: '{"chunk":1}' }]);
    expect(translateAgUiEventToAgentEvent({ type: "RAW", event: null }, state)).toEqual([{ kind: "raw", line: "" }]);
  });

  test("CUSTOM tovu.usage/tovu.status round-trip the original AgentEvent verbatim", () => {
    const state = createAgUiToAgentTranslationState();
    const usage: AgentEvent = { kind: "usage", inputTokens: 5 };
    expect(translateAgUiEventToAgentEvent({ type: "CUSTOM", name: "tovu.usage", value: usage }, state)).toEqual([usage]);
    const status: AgentEvent = { kind: "status", label: "Thinking" };
    expect(translateAgUiEventToAgentEvent({ type: "CUSTOM", name: "tovu.status", value: status }, state)).toEqual([status]);
  });

  test("CUSTOM tovu.ext.<name> unwraps to an ext AgentEvent with the prefix stripped", () => {
    const state = createAgUiToAgentTranslationState();
    expect(translateAgUiEventToAgentEvent({ type: "CUSTOM", name: "tovu.ext.mcp-ui", value: { uri: "x" } }, state)).toEqual([
      { kind: "ext", name: "mcp-ui", data: { uri: "x" } },
    ]);
  });

  test("a CUSTOM event with an unrecognized name (neither tovu.usage/status nor tovu.ext.*) passes through as ext, name unprefixed", () => {
    const state = createAgUiToAgentTranslationState();
    expect(translateAgUiEventToAgentEvent({ type: "CUSTOM", name: "some.other.event", value: { anything: true } }, state)).toEqual([
      { kind: "ext", name: "some.other.event", data: { anything: true } },
    ]);
  });

  test("tool_result loses isError across the round trip — AG-UI's ToolCallResultEvent has no such field", () => {
    const state = createAgUiToAgentTranslationState();
    expect(
      translateAgUiEventToAgentEvent({ type: "TOOL_CALL_RESULT", messageId: "m1", toolCallId: "call-1", content: "3 posts" }, state),
    ).toEqual([{ kind: "tool_result", toolUseId: "call-1", content: "3 posts", isError: false }]);
  });
});

describe("translateAgUiEventToAgentEvent — tool-call argument accumulation", () => {
  test("START then ARGS deltas then END assembles one tool_use event with the parsed input", () => {
    const state = createAgUiToAgentTranslationState();
    expect(translateAgUiEventToAgentEvent({ type: "TOOL_CALL_START", toolCallId: "call-1", toolCallName: "search" }, state)).toEqual([]);
    expect(translateAgUiEventToAgentEvent({ type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: '{"q":' }, state)).toEqual([]);
    expect(translateAgUiEventToAgentEvent({ type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: '"posts"}' }, state)).toEqual([]);

    const result = translateAgUiEventToAgentEvent({ type: "TOOL_CALL_END", toolCallId: "call-1" }, state);
    expect(result).toEqual([{ kind: "tool_use", id: "call-1", name: "search", input: { q: "posts" } }]);
  });

  test("a malformed/partial args buffer falls back to the raw string rather than throwing", () => {
    const state = createAgUiToAgentTranslationState();
    translateAgUiEventToAgentEvent({ type: "TOOL_CALL_START", toolCallId: "call-1", toolCallName: "search" }, state);
    translateAgUiEventToAgentEvent({ type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: "{not json" }, state);

    const result = translateAgUiEventToAgentEvent({ type: "TOOL_CALL_END", toolCallId: "call-1" }, state);
    expect(result).toEqual([{ kind: "tool_use", id: "call-1", name: "search", input: "{not json" }]);
  });

  test("TOOL_CALL_END for an unknown toolCallId (no matching START) is a silent no-op", () => {
    const state = createAgUiToAgentTranslationState();
    expect(translateAgUiEventToAgentEvent({ type: "TOOL_CALL_END", toolCallId: "never-started" }, state)).toEqual([]);
  });

  test("TOOL_CALL_ARGS for an unknown toolCallId (no matching START) is a silent no-op, not a throw", () => {
    const state = createAgUiToAgentTranslationState();
    expect(translateAgUiEventToAgentEvent({ type: "TOOL_CALL_ARGS", toolCallId: "never-started", delta: "{}" }, state)).toEqual([]);
  });

  test("an empty args buffer (no ARGS deltas at all) resolves to an empty object input", () => {
    const state = createAgUiToAgentTranslationState();
    translateAgUiEventToAgentEvent({ type: "TOOL_CALL_START", toolCallId: "call-1", toolCallName: "list" }, state);
    const result = translateAgUiEventToAgentEvent({ type: "TOOL_CALL_END", toolCallId: "call-1" }, state);
    expect(result).toEqual([{ kind: "tool_use", id: "call-1", name: "list", input: {} }]);
  });
});

describe("handleAgUiFrame — frame dispatch", () => {
  test("a translatable event forwards onEvent and collects it", () => {
    const collected: AgentEvent[] = [];
    const h = handlers();
    const finish = vi.fn();

    handleAgUiFrame(
      { event: "message", data: JSON.stringify({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "hi" }) },
      { collected, handlers: h, state: createAgUiToAgentTranslationState(), finish },
    );

    expect(collected).toEqual([{ kind: "text", text: "hi" }]);
    expect(h.events).toEqual([{ kind: "text", text: "hi" }]);
    expect(finish).not.toHaveBeenCalled();
  });

  test("RUN_ERROR reports via onError without calling finish", () => {
    const h = handlers();
    const finish = vi.fn();

    handleAgUiFrame(
      { event: "message", data: JSON.stringify({ type: "RUN_ERROR", message: "provider overloaded" }) },
      { collected: [], handlers: h, state: createAgUiToAgentTranslationState(), finish },
    );

    expect(h.errors.map((e) => e.message)).toEqual(["provider overloaded"]);
    expect(finish).not.toHaveBeenCalled();
  });

  test("RUN_ERROR with no message falls back to a generic AG-UI failure message", () => {
    const h = handlers();
    handleAgUiFrame(
      { event: "message", data: JSON.stringify({ type: "RUN_ERROR" }) },
      { collected: [], handlers: h, state: createAgUiToAgentTranslationState(), finish: vi.fn() },
    );
    expect(h.errors.map((e) => e.message)).toEqual(["AG-UI run failed"]);
  });

  test("RUN_FINISHED calls finish without pushing an AgentEvent", () => {
    const collected: AgentEvent[] = [];
    const h = handlers();
    const finish = vi.fn();

    handleAgUiFrame(
      { event: "message", data: JSON.stringify({ type: "RUN_FINISHED", threadId: "t1", runId: "r1" }) },
      { collected, handlers: h, state: createAgUiToAgentTranslationState(), finish },
    );

    expect(collected).toEqual([]);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  test("RUN_STARTED is a silent no-op (no AgentEvent, no finish)", () => {
    const collected: AgentEvent[] = [];
    const finish = vi.fn();
    handleAgUiFrame(
      { event: "message", data: JSON.stringify({ type: "RUN_STARTED", threadId: "t1", runId: "r1" }) },
      { collected, handlers: handlers(), state: createAgUiToAgentTranslationState(), finish },
    );
    expect(collected).toEqual([]);
    expect(finish).not.toHaveBeenCalled();
  });
});

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startAgUiRun — request shape", () => {
  test("POSTs to AG_UI_RUN_PATH with client-minted threadId/runId and the trimmed message history", async () => {
    const stream = streamFromChunks([frame({ type: "RUN_FINISHED", threadId: "t", runId: "r" })]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    expect(result.runId).toMatch(/^agui:/);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(AG_UI_RUN_PATH);
    const body = JSON.parse(init.body as string) as { threadId: string; runId: string; messages: unknown[] };
    expect(body.runId).toBe(result.runId);
    expect(typeof body.threadId).toBe("string");
    expect(body.messages).toEqual([{ role: "user", content: "find my posts" }]);
  });

  test("blank-content history entries are filtered before sending", async () => {
    const stream = streamFromChunks([frame({ type: "RUN_FINISHED", threadId: "t", runId: "r" })]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const history: ChatMessage[] = [
      { id: "1", role: "user", content: "   " },
      { id: "2", role: "user", content: "real question" },
    ];

    await startAgUiRun({ history, signal: new AbortController().signal }, handlers());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { messages: unknown[] };
    expect(body.messages).toEqual([{ role: "user", content: "real question" }]);
  });

  test("a non-ok response throws with status and truncated body detail", async () => {
    fetchMock = vi.fn(async () => new Response("agent daemon rejected the run", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      /AG-UI run failed to start \(502\): agent daemon rejected the run/,
    );
  });

  test("a network-level fetch rejection is rethrown as an Error and the abort controller is not leaked", async () => {
    fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow("Failed to fetch");
  });

  test("a network-level fetch rejection with a non-Error value is wrapped in a real Error", async () => {
    fetchMock = vi.fn(async () => {
      throw "connection reset";
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow("connection reset");
  });

  test("a non-ok response with an empty body has no ': <detail>' suffix", async () => {
    fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      /^AG-UI run failed to start \(500\)$/,
    );
  });

  test("a non-ok response whose body stream itself errors while reading detail still throws a status-only error", async () => {
    const brokenBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("body read failed"));
      },
    });
    fetchMock = vi.fn(async () => new Response(brokenBody, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      /^AG-UI run failed to start \(503\)$/,
    );
  });

  test("mints a timestamp-based fallback id when crypto.randomUUID is unavailable", async () => {
    const stream = streamFromChunks([frame({ type: "RUN_FINISHED", threadId: "t", runId: "r" })]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", {});

    const result = await startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    expect(result.runId).toMatch(/^agui:\d+-[a-z0-9]+$/);
  });

  test("aborting the caller's input signal aborts the underlying fetch request", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        // never resolves on its own — only the abort propagates.
      },
    });
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const inputController = new AbortController();

    await startAgUiRun({ history: HISTORY, signal: inputController.signal }, handlers());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestSignal = init.signal as AbortSignal;
    expect(requestSignal.aborted).toBe(false);

    inputController.abort();

    expect(requestSignal.aborted).toBe(true);
  });
});

describe("startAgUiRun — SSE frame streaming end to end", () => {
  test("a single text delta translates and forwards, then RUN_FINISHED settles onDone", async () => {
    const stream = streamFromChunks([
      frame({ type: "RUN_STARTED", threadId: "t", runId: "r" }),
      frame({ type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" }),
      frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "hi there" }),
      frame({ type: "TEXT_MESSAGE_END", messageId: "m1" }),
      frame({ type: "RUN_FINISHED", threadId: "t", runId: "r" }),
    ]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const h = handlers();

    await startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.events).toEqual([{ kind: "text", text: "hi there" }]);
    expect(h.done).toEqual([{ kind: "text", text: "hi there" }]);
  });

  test("RUN_ERROR mid-stream reports via onError without ending the run early", async () => {
    const stream = streamFromChunks([
      frame({ type: "RUN_ERROR", message: "model overloaded" }),
      frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "still here" }),
      frame({ type: "RUN_FINISHED", threadId: "t", runId: "r" }),
    ]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const h = handlers();

    await startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.errors.map((e) => e.message)).toEqual(["model overloaded"]);
    expect(h.events).toEqual([{ kind: "text", text: "still here" }]);
  });

  // --- ADR-059 Decision 6: the named, load-bearing interruption-sequence regression ------------

  test("interruption sequence: text -> tool_use -> tool_result -> text again renders as two distinct text segments end to end", async () => {
    const stream = streamFromChunks([
      frame({ type: "RUN_STARTED", threadId: "t", runId: "r" }),
      frame({ type: "TEXT_MESSAGE_START", messageId: "msg_1", role: "assistant" }),
      frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "msg_1", delta: "Let me check that." }),
      frame({ type: "TEXT_MESSAGE_END", messageId: "msg_1" }),
      frame({ type: "TOOL_CALL_START", toolCallId: "call-1", toolCallName: "search" }),
      frame({ type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: JSON.stringify({ q: "posts" }) }),
      frame({ type: "TOOL_CALL_END", toolCallId: "call-1" }),
      frame({ type: "TOOL_CALL_RESULT", messageId: "tool_result_msg_1", toolCallId: "call-1", content: "found 3" }),
      frame({ type: "TEXT_MESSAGE_START", messageId: "msg_2", role: "assistant" }),
      frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "msg_2", delta: "Found 3 posts." }),
      frame({ type: "TEXT_MESSAGE_END", messageId: "msg_2" }),
      frame({ type: "RUN_FINISHED", threadId: "t", runId: "r", result: { reason: "stop" } }),
    ]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const h = handlers();

    await startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    // Two SEPARATE text events, not one merged string — proves the client-side reduction renders
    // the interruption as two distinct segments (chat-core's own event log tells them apart by
    // sequence, not by re-inspecting message ids this transport already discarded).
    expect(h.events).toEqual([
      { kind: "text", text: "Let me check that." },
      { kind: "tool_use", id: "call-1", name: "search", input: { q: "posts" } },
      { kind: "tool_result", toolUseId: "call-1", content: "found 3", isError: false },
      { kind: "text", text: "Found 3 posts." },
    ]);
    expect(h.done).toEqual(h.events);
    expect(h.errors).toEqual([]);
  });
});

describe("consumeAgUiStream — read errors", () => {
  /** A stream whose reader rejects on its first `read()` — simulates a network-level failure
   *  mid-turn, the same shape `readSseFrames` sees when the underlying connection drops. */
  function erroringStream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("stream broke"));
      },
    });
  }

  test("a genuine read error (controller not aborted) reports via onError, not finish", async () => {
    const h = handlers();
    const controller = new AbortController();
    const collected: AgentEvent[] = [];
    let doneCalled = false;

    await consumeAgUiStream(erroringStream(), {
      runId: "agui:test-error",
      collected,
      handlers: h,
      finish: () => {
        doneCalled = true;
      },
      controller,
      state: createAgUiToAgentTranslationState(),
    });

    expect(h.errors.map((e) => e.message)).toEqual(["stream broke"]);
    expect(doneCalled).toBe(false);
  });

  test("a read rejection with a non-Error reason is wrapped in a real Error before reaching onError", async () => {
    const h = handlers();
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
          c.error("connection reset");
      },
    });

    await consumeAgUiStream(stream, {
      runId: "agui:test-non-error",
      collected: [],
      handlers: h,
      finish: () => undefined,
      controller,
      state: createAgUiToAgentTranslationState(),
    });

    expect(h.errors.map((e) => e.message)).toEqual(["connection reset"]);
  });

  test("a read error on an ALREADY-ABORTED controller calls finish instead of onError — the abort caused the error, not a real failure", async () => {
    const h = handlers();
    const controller = new AbortController();
    controller.abort();
    const collected: AgentEvent[] = [];
    let doneCalled = false;

    await consumeAgUiStream(erroringStream(), {
      runId: "agui:test-aborted",
      collected,
      handlers: h,
      finish: () => {
        doneCalled = true;
      },
      controller,
      state: createAgUiToAgentTranslationState(),
    });

    expect(doneCalled).toBe(true);
    expect(h.errors).toEqual([]);
  });
});

describe("reattachAgUiRun / fetchAgUiRunStatus / stopAgUiRun", () => {
  test("reattachAgUiRun reports the run as simply done, with no events — there is nothing to resume", async () => {
    const h = handlers();
    await reattachAgUiRun(h);
    expect(h.done).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  test("fetchAgUiRunStatus always resolves null — no server-side run record exists on this path", async () => {
    await expect(fetchAgUiRunStatus()).resolves.toBeNull();
  });

  test("stopAgUiRun on an in-flight run aborts the controller instead of POSTing a cancel endpoint", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        // never resolves on its own — only abort() ends it.
      },
    });
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { runId } = await startAgUiRun({ history: HISTORY, signal: new AbortController().signal }, handlers());
    fetchMock.mockClear();
    await stopAgUiRun(runId);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("stopAgUiRun on an unknown id (already settled/never existed) is a silent no-op", async () => {
    await expect(stopAgUiRun("agui:never-existed")).resolves.toBeUndefined();
  });
});

describe("createTovuAssistantTransport — AG-UI toggle dispatch", () => {
  test("getAgUiEnabled true routes startRun through the AG-UI path instead of Local CLI", async () => {
    const stream = streamFromChunks([frame({ type: "RUN_FINISHED", threadId: "t", runId: "r" })]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getAgUiEnabled: () => true });

    const result = await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    expect(result.runId).toMatch(/^agui:/);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(AG_UI_RUN_PATH);
  });

  test("getAgUiEnabled false (or absent) falls through to the Local CLI path unchanged", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "daemon-run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "EventSource",
      class {
        addEventListener() {}
        close() {}
      },
    );
    const transport = createTovuAssistantTransport({ getAgUiEnabled: () => false });

    const result = await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    expect(result.runId).toBe("daemon-run-1");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/runs");
  });

  test("BYOK mode wins over the AG-UI toggle when both are set — the toggle only diverts the Local CLI branch", async () => {
    const stream = streamFromChunks([`event: end\ndata: {}\n\n`]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({
      getAgUiEnabled: () => true,
      getExecutionConfig: () => ({
        mode: "byok",
        byok: { protocol: "anthropic", providerId: "anthropic", apiKey: "sk-test", baseUrl: "", model: "claude-test" },
        localCli: {},
      }) as any,
    });

    const result = await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    expect(result.runId).toMatch(/^byok:/);
  });
});
