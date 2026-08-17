import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers, StartRunInput } from "@jini-ai/chat/react";
import type { ExecutionConfig } from "@jini-ai/ui";

import { buildLocalCliContextRef, createTovuAssistantTransport } from "../assistant-transport";
import { FakeEventSource, resetFakeEventSource } from "./assistant-transport.test-helpers";

/**
 * @file The local-CLI run path (`@jini-ai/http`'s `/api/runs*` surface) — `startRun`'s default
 * branch (no BYOK `getExecutionConfig`, or BYOK selected with no key), `subscribeToRun`'s
 * `EventSource` frame handling, and the daemon branches of `reattachRun`/`fetchRunStatus`/`stopRun`.
 *
 * Per the coverage audit's risk ranking, `readSseFrames` and the SSE-consumer arrow are BYOK-path
 * only (`assistant-transport.byok.unit.test.ts` covers those); this file is the daemon path's
 * `EventSource`-based equivalent — `subscribeToRun`.
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

const HISTORY: ChatMessage[] = [{ id: "1", role: "user", content: "list my posts" }];

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  resetFakeEventSource();
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * `buildLocalCliContextRef` — the local-CLI `contextRef` assembly pulled out of `startRun`
 * (2026-08-06, complexity pass, second pass): three independent optional fields, each included only
 * when present. `startRun — guard and request shape` below still asserts the end-to-end POST body
 * these produce; these tests pin each field's own inclusion rule directly, with no `fetch` involved.
 */
describe("buildLocalCliContextRef", () => {
  function input(overrides: Partial<StartRunInput> = {}): StartRunInput {
    return { history: HISTORY, signal: new AbortController().signal, ...overrides } as StartRunInput;
  }

  test("always includes prompt, with no optional fields when context/attachments are absent", () => {
    expect(buildLocalCliContextRef(input(), "the prompt")).toEqual({ prompt: "the prompt" });
  });

  test("includes frontendBindToken only when it is a non-empty string", () => {
    expect(buildLocalCliContextRef(input({ context: { frontendBindToken: "tab-1" } }), "p")).toEqual({
      prompt: "p",
      frontendBindToken: "tab-1",
    });
    expect(buildLocalCliContextRef(input({ context: { frontendBindToken: "" } }), "p")).toEqual({ prompt: "p" });
    expect(buildLocalCliContextRef(input({ context: { frontendBindToken: 42 } }), "p")).toEqual({ prompt: "p" });
  });

  test("includes model only when it is a non-empty string", () => {
    expect(buildLocalCliContextRef(input({ context: { model: "claude-opus-5" } }), "p")).toEqual({
      prompt: "p",
      model: "claude-opus-5",
    });
    expect(buildLocalCliContextRef(input({ context: { model: "" } }), "p")).toEqual({ prompt: "p" });
  });

  test("includes attachmentIds (mapped to their opaque path) only when attachments is non-empty", () => {
    expect(
      buildLocalCliContextRef(
        input({ attachments: [{ path: "attachment:1" }, { path: "attachment:2" }] as StartRunInput["attachments"] }),
        "p",
      ),
    ).toEqual({ prompt: "p", attachmentIds: ["attachment:1", "attachment:2"] });
    expect(buildLocalCliContextRef(input({ attachments: [] as StartRunInput["attachments"] }), "p")).toEqual({ prompt: "p" });
  });

  test("does not let a spread of context shadow the reserved keys — reads frontendBindToken/model by name only", () => {
    expect(
      buildLocalCliContextRef(input({ context: { frontendBindToken: "tab-1", principalId: "should-not-appear" } }), "p"),
    ).toEqual({ prompt: "p", frontendBindToken: "tab-1" });
  });
});

describe("startRun — guard and request shape", () => {
  test("rejects a history with no user turn before making any request", async () => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await expect(
      transport.startRun(
        { history: [{ id: "1", role: "assistant", content: "hi" }], signal: new AbortController().signal },
        handlers(),
      ),
    ).rejects.toThrow("no user message to send");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("posts contextRef/agentId to /api/runs and opens an EventSource on the returned run id", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    const result = await transport.startRun({ history: HISTORY, agentId: "agent-a", signal: new AbortController().signal }, handlers());

    expect(result).toEqual({ runId: "run-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/runs");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { agentId: string; contextRef: string };
    expect(body.agentId).toBe("agent-a");
    expect(JSON.parse(body.contextRef).prompt).toMatch(/list my posts/);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe("/api/runs/run-1/events");
  });

  test("carries frontendBindToken through context when present as a non-empty string", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      { history: HISTORY, context: { frontendBindToken: "tab-42" }, signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect(JSON.parse(body.contextRef).frontendBindToken).toBe("tab-42");
  });

  test("omits frontendBindToken entirely when absent — not sent as an empty or undefined key", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect("frontendBindToken" in JSON.parse(body.contextRef)).toBe(false);
  });

  test("a non-string frontendBindToken (identity field shape mismatch) is not forwarded", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      { history: HISTORY, context: { frontendBindToken: 42 }, signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect("frontendBindToken" in JSON.parse(body.contextRef)).toBe(false);
  });

  test("carries the model through context when present as a non-empty string", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      { history: HISTORY, context: { model: "claude-sonnet-5" }, signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect(JSON.parse(body.contextRef).model).toBe("claude-sonnet-5");
  });

  test("omits model entirely when absent — not sent as an empty or undefined key", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect("model" in JSON.parse(body.contextRef)).toBe(false);
  });

  test("a non-string model (shape mismatch) is not forwarded", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      { history: HISTORY, context: { model: 42 }, signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect("model" in JSON.parse(body.contextRef)).toBe(false);
  });

  test("attachment capability ids are forwarded as attachmentIds, not the attachment objects themselves", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      {
        history: HISTORY,
        attachments: [{ path: "attachment:abc", name: "screenshot.png", kind: "image" }],
        signal: new AbortController().signal,
      },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect(JSON.parse(body.contextRef).attachmentIds).toEqual(["attachment:abc"]);
  });

  test("an empty attachments array omits attachmentIds — the common case carries no dead key", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun({ history: HISTORY, attachments: [], signal: new AbortController().signal }, handlers());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect("attachmentIds" in JSON.parse(body.contextRef)).toBe(false);
  });

  test("a getExecutionConfig that is present but not in byok mode still takes the local-CLI path", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({
      getExecutionConfig: () => ({ mode: "local-cli" }) as unknown as ExecutionConfig,
    });

    const result = await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    expect(result).toEqual({ runId: "run-1" });
    expect(fetchMock).toHaveBeenCalledWith("/api/runs", expect.anything());
  });

  /**
   * 2026-08-05: this used to fall through to the local-CLI path — that was the regression this
   * test now pins the FIX for, not the contract. Once the admin's own BYOK credential moved
   * server-side and write-only (`execution-settings.ts`'s `loadExecutionConfig`), `byok.apiKey` is
   * empty on every fresh load even when a credential IS stored, so gating dispatch on it made BYOK
   * mode permanently unable to reach the server for exactly the case the store exists to support.
   * `assistant-byok.ts`'s route already resolves a blank/omitted key by falling back to this
   * admin's own stored row — dispatch has to trust that instead of second-guessing it locally.
   */
  test("byok mode with a blank (whitespace-only) apiKey still dispatches to the BYOK route — the server resolves the stored credential", async () => {
    fetchMock = vi.fn(
      async () =>
        new Response("data: {}\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({
      getExecutionConfig: () =>
        ({
          mode: "byok",
          byok: { apiKey: "   ", protocol: "anthropic", providerId: null, baseUrl: "", model: "" },
        }) as unknown as ExecutionConfig,
    });

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/v1/assistant/byok-turn", expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith("/api/runs", expect.anything());
  });

  test("a non-ok response surfaces status and truncated body detail in the thrown error", async () => {
    fetchMock = vi.fn(async () => new Response("boom: something went wrong on the server here", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await expect(transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      /agent run failed to start \(500\): boom/,
    );
  });

  test("a non-ok response whose body can't be read (.text() rejects) still throws, with no detail suffix", async () => {
    // `.text().catch(() => "")` exists for exactly this: a response whose body stream errors out
    // (e.g. a dropped connection) must not turn "the server rejected the request" into "the client
    // crashed reading the rejection".
    const fakeResponse = { ok: false, status: 503, text: async () => { throw new Error("body stream errored"); } } as unknown as Response;
    fetchMock = vi.fn(async () => fakeResponse);
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await expect(transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers())).rejects.toThrow(
      "agent run failed to start (503)",
    );
  });
});

describe("subscribeToRun — EventSource frame handling", () => {
  async function openRun() {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();
    const h = handlers();
    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, h);
    const source = FakeEventSource.instances[0]!;
    return { h, source };
  }

  test("an 'agent' frame is translated and forwarded to onEvent, then collected for onDone", async () => {
    const { h, source } = await openRun();

    source.emit("agent", JSON.stringify({ runId: "run-1", kind: "agent", payload: { type: "text_delta", delta: "hi" } }));
    source.emit("end", "");

    expect(h.events).toEqual([{ kind: "text", text: "hi" }]);
    expect(h.done).toEqual([{ kind: "text", text: "hi" }]);
    expect(source.closed).toBe(true);
  });

  test("an 'agent' frame that translates to null (thinking_start) is not forwarded", async () => {
    const { h, source } = await openRun();

    source.emit("agent", JSON.stringify({ runId: "run-1", kind: "agent", payload: { type: "thinking_start" } }));
    source.emit("end", "");

    expect(h.events).toEqual([]);
    expect(h.done).toEqual([]);
  });

  test("a 'stdout' frame becomes a raw AgentEvent from its chunk field", async () => {
    const { h, source } = await openRun();

    source.emit("stdout", JSON.stringify({ runId: "run-1", kind: "stdout", payload: { chunk: "building..." } }));
    source.emit("end", "");

    expect(h.events).toEqual([{ kind: "raw", line: "building..." }]);
  });

  test("an 'error' frame with a data payload reports the wire message via onError", async () => {
    const { h, source } = await openRun();

    source.emit("error", JSON.stringify({ runId: "run-1", kind: "error", payload: { message: "agent crashed" } }));

    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]?.message).toBe("agent crashed");
  });

  test("a bare connection error (no data) reports a generic connection-error message", async () => {
    const { h, source } = await openRun();

    source.emit("error", "");

    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]?.message).toBe("assistant stream connection error");
  });

  test("'end' only calls onDone once even if fired twice — settled guard", async () => {
    const { h, source } = await openRun();

    source.emit("end", "");
    source.emit("end", "");

    expect(h.done).toEqual([]);
  });

  test("aborting the signal AFTER 'end' has already settled the run is a no-op — not a double onDone", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();
    const controller = new AbortController();
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: controller.signal }, h);
    const source = FakeEventSource.instances[0]!;
    source.emit("end", "");
    const closedAtEnd = source.closed;
    controller.abort();

    expect(closedAtEnd).toBe(true);
    expect(h.done).toEqual([]); // unchanged by the post-settlement abort
  });

  test("an 'error' frame with an empty message field falls back to the generic 'agent run failed' message", async () => {
    const { h, source } = await openRun();

    source.emit("error", JSON.stringify({ runId: "run-1", kind: "error", payload: { message: "" } }));

    expect(h.errors.map((e) => e.message)).toEqual(["agent run failed"]);
  });

  test("aborting the signal before 'end' closes the source without ever calling onDone", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();
    const controller = new AbortController();
    const h = handlers();

    await transport.startRun({ history: HISTORY, signal: controller.signal }, h);
    const source = FakeEventSource.instances[0]!;
    controller.abort();

    expect(source.closed).toBe(true);
    expect(h.done).toBeNull();
  });
});

describe("reattachRun — daemon path", () => {
  test("re-subscribes to the same EventSource URL for a daemon run id", async () => {
    const transport = createTovuAssistantTransport();
    const h = handlers();

    await transport.reattachRun("run-9", h);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe("/api/runs/run-9/events");
  });
});

describe("fetchRunStatus — daemon path", () => {
  test.each([
    ["pending", "queued"],
    ["running", "running"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["cancelled", "canceled"],
  ] as const)("maps daemon state %s to chat-core status %s (toChatCoreRunStatus)", async (daemonState, chatCoreStatus) => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { state: daemonState } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await expect(transport.fetchRunStatus("run-1")).resolves.toBe(chatCoreStatus);
  });

  test("an unmapped state (no daemon->chat-core spelling) resolves to null, not the raw string", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { state: "some-unknown-state" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await expect(transport.fetchRunStatus("run-1")).resolves.toBeNull();
  });

  test("a non-ok response resolves to null rather than throwing", async () => {
    fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await expect(transport.fetchRunStatus("run-1")).resolves.toBeNull();
  });
});

describe("stopRun — daemon path", () => {
  test("posts to the run's cancel endpoint with the runId in the body", async () => {
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.stopRun("run-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runs/run-1/cancel",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ runId: "run-1" }) }),
    );
  });
});
