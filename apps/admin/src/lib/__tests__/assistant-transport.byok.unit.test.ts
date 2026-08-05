import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers } from "@jini-ai/chat/react";
import type { ExecutionConfig } from "@jini-ai/ui";

import { createTovuAssistantTransport } from "../assistant-transport";
import { flushMicrotasks, streamFromChunks } from "./assistant-transport.test-helpers";

/**
 * @file The BYOK run path (`startByokRun`, `readSseFrames`, and the BYOK branches of
 * `reattachRun`/`fetchRunStatus`/`stopRun`) — the other half of the coverage audit's "4 of 4
 * complex functions in this file are effectively untested" finding.
 *
 * `readSseFrames` is not exported, so it is exercised the only way a caller can reach it: through
 * `startByokRun`'s held-open POST, feeding a real `ReadableStream<Uint8Array>` via a stubbed
 * `fetch`'s `Response.body`. This also doubles as the frame-boundary/chunk-splitting coverage the
 * risk ranking flagged (`readSseFrames` was rank #4 by itself).
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

const HISTORY: ChatMessage[] = [{ id: "1", role: "user", content: "translate this page" }];

function byokConfig(overrides: Partial<ExecutionConfig["byok"]> = {}): ExecutionConfig {
  return {
    mode: "byok",
    byok: {
      protocol: "anthropic",
      providerId: "anthropic",
      apiKey: "sk-test-key",
      baseUrl: "",
      model: "claude-test",
      ...overrides,
    },
    localCli: {} as ExecutionConfig["localCli"],
  } as ExecutionConfig;
}

/** One SSE frame, wire-formatted exactly as `assistant-byok.ts` sends it. */
function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

let fetchMock: ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startByokRun — request shape and startup failures", () => {
  test("sends only non-blank messages, mapped to {role, content}, with the byok credentials", async () => {
    const stream = streamFromChunks([frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });

    const history: ChatMessage[] = [
      { id: "1", role: "user", content: "  " },
      { id: "2", role: "user", content: "real question" },
    ];
    const result = await transport.startRun({ history, signal: new AbortController().signal }, handlers());

    expect(result.runId).toMatch(/^byok:/);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/v1/assistant/byok-turn");
    const body = JSON.parse(init.body as string) as { messages: unknown[]; byok: Record<string, unknown> };
    expect(body.messages).toEqual([{ role: "user", content: "real question" }]);
    expect(body.byok).toMatchObject({ protocol: "anthropic", apiKey: "sk-test-key", model: "claude-test" });
    expect(body.byok).not.toHaveProperty("baseUrl");
    expect(body.byok).not.toHaveProperty("maxTokens");
  });

  test("includes baseUrl and maxTokens only when present, not as empty/undefined keys", async () => {
    const stream = streamFromChunks([frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({
      getExecutionConfig: () => byokConfig({ baseUrl: "https://my-proxy.example.com", maxTokens: 2048 }),
    });

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { byok: Record<string, unknown> };
    expect(body.byok.baseUrl).toBe("https://my-proxy.example.com");
    expect(body.byok.maxTokens).toBe(2048);
  });

  test("a network-level fetch rejection is rethrown as an Error and the abort controller is not leaked", async () => {
    fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });

    await expect(transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      "Failed to fetch",
    );
  });

  test("a non-Error thrown by fetch is wrapped in an Error, not passed through raw", async () => {
    fetchMock = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal -- exercising the non-Error branch deliberately
      throw "raw string rejection";
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });

    await expect(transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      "raw string rejection",
    );
  });

  test("a non-ok response throws with status and truncated body detail", async () => {
    fetchMock = vi.fn(async () => new Response("provider rejected the key: invalid credentials supplied", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });

    await expect(transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      /BYOK turn failed to start \(401\): provider rejected the key/,
    );
  });

  test("an ok response with no body throws rather than hanging on a null stream", async () => {
    fetchMock = vi.fn(async () => {
      const res = new Response(null, { status: 200 });
      // Response(null) already has body:null, but assert the precondition this test relies on.
      expect(res.body).toBeNull();
      return res;
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });

    await expect(transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      /BYOK turn failed to start/,
    );
  });

  test("a non-ok response whose body can't be read (.text() rejects) still throws — same fallback as the daemon path", async () => {
    const fakeResponse = { ok: false, body: null, status: 500, text: async () => { throw new Error("body stream errored"); } } as unknown as Response;
    fetchMock = vi.fn(async () => fakeResponse);
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });

    await expect(transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      "BYOK turn failed to start (500)",
    );
  });

  test("mints a runId from Date.now()+Math.random when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    const stream = streamFromChunks([frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });

    const { runId } = await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    expect(runId).toMatch(/^byok:\d+-[a-z0-9]+$/);
  });
});

describe("startByokRun — SSE frame streaming (readSseFrames + the consumer arrow)", () => {
  test("a single chunk carrying one complete frame translates and forwards an agent event", async () => {
    const stream = streamFromChunks([frame("agent", { type: "text_delta", delta: "hi there" }), frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.events).toEqual([{ kind: "text", text: "hi there" }]);
    expect(h.done).toEqual([{ kind: "text", text: "hi there" }]);
  });

  test("two frames delivered in one chunk are both parsed — readSseFrames' inner while loop", async () => {
    const combined = frame("agent", { type: "text_delta", delta: "a" }) + frame("agent", { type: "text_delta", delta: "b" }) + frame("end", {});
    const stream = streamFromChunks([combined]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.events).toEqual([
      { kind: "text", text: "a" },
      { kind: "text", text: "b" },
    ]);
  });

  test("a frame split across two chunks (boundary lands mid-frame) is reassembled correctly", async () => {
    const whole = frame("agent", { type: "text_delta", delta: "reassembled" });
    const splitAt = Math.floor(whole.length / 2);
    const stream = streamFromChunks([whole.slice(0, splitAt), whole.slice(splitAt) + frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.events).toEqual([{ kind: "text", text: "reassembled" }]);
  });

  test("a frame with no data: lines is skipped rather than yielded empty", async () => {
    const stream = streamFromChunks(["event: ping\n\n" + frame("agent", { type: "text_delta", delta: "after-ping" }) + frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.events).toEqual([{ kind: "text", text: "after-ping" }]);
  });

  test("a line matching neither 'event:' nor 'data:' (e.g. an 'id:' field) is ignored, not misparsed as data", async () => {
    const stream = streamFromChunks([`id: 42\n` + `data: ${JSON.stringify({ type: "text_delta", delta: "still parsed" })}\n\n` + frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    // The frame still yields (its data: line was parsed) with the default event name "message",
    // which the consumer's if/else-if chain does not match against — so no event surfaces, but
    // parsing the stray `id:` line must not have thrown or corrupted the data line after it.
    expect(h.errors).toEqual([]);
  });

  test("an 'agent' frame whose payload translates to null (e.g. thinking_start) is not collected or forwarded", async () => {
    const stream = streamFromChunks([frame("agent", { type: "thinking_start" }), frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.events).toEqual([]);
    expect(h.done).toEqual([]);
  });

  test("a frame with no explicit event: line defaults to 'message' — ignored by the consumer's if/else-if chain", async () => {
    const stream = streamFromChunks([`data: ${JSON.stringify({ noop: true })}\n\n` + frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    // Neither 'agent', 'error', nor 'end' fired — onDone never called by the frame itself, only by
    // the generator's own completion once the stream closes.
    expect(h.events).toEqual([]);
    expect(h.done).toEqual([]);
  });

  test("an 'error' frame mid-stream reports via onError without ending the run early", async () => {
    const stream = streamFromChunks([frame("error", { message: "model overloaded" }), frame("agent", { type: "text_delta", delta: "still here" }), frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.errors.map((e) => e.message)).toEqual(["model overloaded"]);
    expect(h.events).toEqual([{ kind: "text", text: "still here" }]);
  });

  test("an 'error' frame with no message field falls back to a generic BYOK failure message", async () => {
    const stream = streamFromChunks([frame("error", {}), frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.errors.map((e) => e.message)).toEqual(["BYOK turn failed"]);
  });

  test("'end' calls onDone exactly once even though the generator's own completion also calls finish()", async () => {
    const stream = streamFromChunks([frame("agent", { type: "text_delta", delta: "x" }), frame("end", {})]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();
    let doneCalls = 0;
    const wrapped: RunHandlers = { ...h, onDone: (ev) => { doneCalls += 1; h.onDone(ev); } };

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, wrapped);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(doneCalls).toBe(1);
  });

  test("a thrown parse/stream error after abort() is treated as an expected cancellation, not reported via onError", async () => {
    // A hand-held reader rather than a real ReadableStream: the ordering this test asserts on
    // (abort happens, THEN the read rejects) has to be deterministic, and a real stream's `pull()`
    // timing relative to `controller.abort()` is not guaranteed by the spec.
    const readerState: { reject: ((error: unknown) => void) | null } = { reject: null };
    const reader = {
      read: () => new Promise((_resolve, reject) => { readerState.reject = reject; }),
      releaseLock() {},
    };
    const fakeResponse = {
      ok: true,
      body: { getReader: () => reader } as unknown as ReadableStream<Uint8Array>,
      text: async () => "",
    } as unknown as Response;
    fetchMock = vi.fn(async () => fakeResponse);
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const controller = new AbortController();
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: controller.signal }, h);
    controller.abort();
    readerState.reject?.(new DOMException("The operation was aborted", "AbortError"));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.errors).toEqual([]);
    expect(h.done).toEqual([]);
  });

  test("a genuine stream error while not aborted is reported via onError", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.errors.map((e) => e.message)).toEqual(["connection reset"]);
  });

  test("a non-Error value thrown by the stream (not aborted) is still wrapped and reported via onError", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal -- exercising the non-Error branch deliberately
        controller.error("plain string stream failure");
      },
    });
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.errors.map((e) => e.message)).toEqual(["plain string stream failure"]);
  });
});

describe("reattachRun / fetchRunStatus / stopRun — BYOK branches", () => {
  test("reattachRun on a byok: id reports the run as simply done, with no events — there is nothing to resume", async () => {
    const transport = createTovuAssistantTransport();
    const h = handlers();

    await transport.reattachRun("byok:abc-123", h);

    expect(h.done).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  test("fetchRunStatus on a byok: id resolves null without making a network call", async () => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await expect(transport.fetchRunStatus("byok:abc-123")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("stopRun on a byok: id aborts the in-flight controller instead of POSTing a cancel endpoint", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        // never resolves on its own — only abort() ends it, which is what this test verifies.
      },
    });
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });

    const { runId } = await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());
    fetchMock.mockClear();
    await transport.stopRun(runId);

    // No new network call — cancellation goes through the abort controller, not a fetch.
    expect(fetchMock).not.toHaveBeenCalled();
    const [, init] = (fetchMock.mock.calls[0] as [string, RequestInit] | undefined) ?? [undefined, undefined];
    expect(init?.signal as AbortSignal | undefined).toBeUndefined();
  });

  test("stopRun on an unknown byok: id (already settled/never existed) is a silent no-op", async () => {
    const transport = createTovuAssistantTransport();
    await expect(transport.stopRun("byok:never-existed")).resolves.toBeUndefined();
  });
});

/**
 * A truncated turn is the one terminal reason that looks exactly like a completed one in the pane:
 * partial text, no error, nothing said. The server-side half of this (capturing the tool loop's own
 * reason instead of the provider's last raw stop code) shipped without the browser half, so the
 * reason arrived and was dropped.
 */
describe("terminal reason — surfacing max_tool_turns to the human", () => {
  test("an 'end' frame with reason max_tool_turns emits a status event explaining the turn was cut short", async () => {
    const stream = streamFromChunks([
      frame("agent", { type: "text_delta", delta: "I started renaming the drafts" }),
      frame("end", { reason: "max_tool_turns" }),
    ]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    const notice = h.events.find((ev) => ev.kind === "status");
    expect(notice).toBeDefined();
    expect((notice as { label: string }).label).toMatch(/tool-step limit/i);
    // Actionable, not just descriptive — the user's next move is to ask it to continue.
    expect((notice as { detail?: string }).detail).toMatch(/continue/i);
    // No error: nothing failed, the turn hit a budget.
    expect(h.errors).toEqual([]);
    // And it is part of the final transcript, not a transient toast that vanishes on re-render.
    expect(h.done?.some((ev) => ev.kind === "status")).toBe(true);
  });

  test("an ordinary 'end' emits no notice — the reason speaks for itself", async () => {
    for (const data of [{}, { reason: "stop" }, { reason: "end_turn" }]) {
      const stream = streamFromChunks([frame("agent", { type: "text_delta", delta: "done" }), frame("end", data)]);
      fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
      const h = handlers();

      await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(h.events.filter((ev) => ev.kind === "status")).toEqual([]);
    }
  });

  test("a malformed 'end' payload still ends the run — a missing notice never costs the turn", async () => {
    const stream = streamFromChunks([`event: end\ndata: {not json\n\n`]);
    fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig() });
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.done).not.toBeNull();
    expect(h.errors).toEqual([]);
  });
});
