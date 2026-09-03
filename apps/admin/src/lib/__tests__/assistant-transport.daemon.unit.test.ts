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

const MULTI_TURN_HISTORY: ChatMessage[] = [
  { id: "1", role: "user", content: "search my posts for slow mornings" },
  { id: "2", role: "assistant", content: "One post matched: Slow Mornings." },
  { id: "3", role: "user", content: "open it in the editor" },
];

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

  test("includes pluginRefIds (filtered to non-empty strings) only when at least one survives", () => {
    expect(buildLocalCliContextRef(input({ context: { pluginRefIds: ["ui-ux-design"] } }), "p")).toEqual({
      prompt: "p",
      pluginRefIds: ["ui-ux-design"],
    });
    // Same filtering posture as `attachmentIds`'s own decode side (`run-start-context.ts`'s
    // `parseRunStartContextRef`) — a non-string or empty-string entry is dropped, not forwarded.
    expect(buildLocalCliContextRef(input({ context: { pluginRefIds: ["ui-ux-design", "", 42, "second"] } }), "p")).toEqual({
      prompt: "p",
      pluginRefIds: ["ui-ux-design", "second"],
    });
    expect(buildLocalCliContextRef(input({ context: { pluginRefIds: [] } }), "p")).toEqual({ prompt: "p" });
    expect(buildLocalCliContextRef(input({ context: { pluginRefIds: "not-an-array" } }), "p")).toEqual({ prompt: "p" });
  });

  test("includes conversationId only when it is a non-empty string", () => {
    expect(buildLocalCliContextRef(input({ context: { conversationId: "c1" } }), "p")).toEqual({
      prompt: "p",
      conversationId: "c1",
    });
    expect(buildLocalCliContextRef(input({ context: { conversationId: "" } }), "p")).toEqual({ prompt: "p" });
    expect(buildLocalCliContextRef(input({ context: { conversationId: 42 } }), "p")).toEqual({ prompt: "p" });
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

  // `reasoning` rides the same envelope on the same terms as `model` above; if it stops being
  // encoded the Execution tab's effort pick becomes a stored value that never reaches argv, with
  // nothing to say so.
  test("carries the reasoning effort through context when present as a non-empty string", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      { history: HISTORY, context: { model: "claude-opus-5", reasoning: "max" }, signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const decoded = JSON.parse(JSON.parse((init.body as string) as string).contextRef) as Record<string, unknown>;
    expect(decoded.reasoning).toBe("max");
    expect(decoded.model).toBe("claude-opus-5");
  });

  test("omits reasoning entirely when absent, empty, or a shape mismatch", async () => {
    for (const context of [undefined, { reasoning: "" }, { reasoning: 3 }]) {
      fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const transport = createTovuAssistantTransport();

      await transport.startRun(
        { history: HISTORY, ...(context ? { context } : {}), signal: new AbortController().signal },
        handlers(),
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect("reasoning" in JSON.parse(JSON.parse(init.body as string).contextRef)).toBe(false);
    }
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

/**
 * @file The transcript-duplication regression: `@jini-ai/agent-runtime`'s `resumesSessionViaCli`/
 * `resumesSessionViaAcpLoad` doc (`types.ts`) says a caller "should skip resending the rendered
 * transcript on follow-up turns and send just the latest user message" for a def whose own CLI/ACP
 * session already carries multi-turn memory across spawns. `startRun`'s Local CLI branch used to call
 * `runPrompt` (the full `buildTranscript` output) unconditionally, regardless of `input.agentId` —
 * duplicating history for a def the daemon already resumes via `--resume`/`session/load`
 * (`agent-session-resume.ts`), on top of whatever the CLI itself remembers. `getResumeCapableAgentIds`
 * is the gate: an agentId in that set gets just the latest message; anything else (including every
 * agentId when the option is entirely unwired) keeps the pre-existing full-transcript behavior.
 */
describe("startRun — resume-capable agents skip resending the transcript", () => {
  test("a resume-capable agentId sends only the latest user message, not the full rendered transcript", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getResumeCapableAgentIds: () => new Set(["claude"]) });

    await transport.startRun(
      { history: MULTI_TURN_HISTORY, agentId: "claude", signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { contextRef: string };
    const prompt = JSON.parse(body.contextRef).prompt as string;
    expect(prompt, "expected exactly the newest user message, nothing more").toBe("open it in the editor");
    expect(prompt, "must not carry the transcript's role-delimiter headers").not.toMatch(/## user/);
    expect(prompt, "must not carry a prior turn's content — the CLI already remembers it").not.toMatch(/slow mornings/i);
  });

  test("a non-resume-capable agentId still gets the full rendered transcript", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getResumeCapableAgentIds: () => new Set(["claude"]) });

    await transport.startRun(
      { history: MULTI_TURN_HISTORY, agentId: "qwen", signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { contextRef: string };
    const prompt = JSON.parse(body.contextRef).prompt as string;
    expect(prompt, "a stateless def has no memory of its own — it still needs the prior turn").toMatch(/slow mornings/i);
    expect(prompt, "the current turn must still be present").toMatch(/open it in the editor/);
  });

  test("an unwired caller (no getResumeCapableAgentIds option) keeps today's full-transcript behavior for every agentId", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      { history: MULTI_TURN_HISTORY, agentId: "claude", signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { contextRef: string };
    const prompt = JSON.parse(body.contextRef).prompt as string;
    expect(prompt, "fails open to the full transcript when the capability set is not wired up").toMatch(/slow mornings/i);
  });

  test("a resume-capable agentId with no agentId at all on the request still gets the full transcript — nothing to look up", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport({ getResumeCapableAgentIds: () => new Set(["claude"]) });

    await transport.startRun({ history: MULTI_TURN_HISTORY, signal: new AbortController().signal }, handlers());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { contextRef: string };
    const prompt = JSON.parse(body.contextRef).prompt as string;
    expect(prompt, "no agentId means no capability to check — must not guess").toMatch(/slow mornings/i);
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

  /**
   * `useRunStream.reattach()` (Jini `@jini-ai/chat-react`) creates an `AbortController`, stores it,
   * and aborts it on unmount/reset/supersession, then hands it to `transport.reattachRun` as
   * `options.signal` — exactly the seam `ChatTransport.reattachRun`'s third parameter exists for
   * (`packages/chat/src/core/transport.ts`'s `ReattachRunOptions`, added 2026-07-29 specifically to
   * close this resource leak). If this transport drops that third argument, the hook's own abort
   * does nothing here: the EventSource this call opens has no way to ever be told to close, and
   * outlives the component that reattached it — the same "recurring/long-lived thing with no
   * cancellation wired through" shape as today's settings-events/AssistantDock-poll fixes.
   */
  test("honors options.signal — aborting it closes the reattached EventSource", async () => {
    const transport = createTovuAssistantTransport();
    const h = handlers();
    const controller = new AbortController();

    await transport.reattachRun("run-9", h, { signal: controller.signal });
    const source = FakeEventSource.instances[0]!;
    expect(source.closed).toBe(false);

    controller.abort();

    expect(source.closed).toBe(true);
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
