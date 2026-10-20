import { afterEach, describe, expect, test, vi } from "vitest";

import type { ChatMessage, ChatTransport, RunHandlers } from "@jini-ai/chat/core";
import type { ExecutionConfig } from "@jini-ai/ui";

import { createTovuAssistantTransport } from "../assistant-transport";
import { createStreamActivity } from "../stream-activity";
import { flushMicrotasks } from "./assistant-transport.test-helpers";

/**
 * @file Pins how `createTovuAssistantTransport` hands the dock's host callbacks to Jini's transport
 * factory, and the module-level ports Jini calls back into (`acceptRun`'s pending-turn cancel and
 * `projectInput`'s selected-skill guidance).
 *
 * Jini invokes each host port as `port({}, {})`. Tovu's callbacks are zero-argument (or, for
 * `persistUserTurn`, positional), so the adapter must call them with exactly the arguments their own
 * signatures declare, and must re-read the option on every call rather than capture it once.
 */

type CreateTransport = NonNullable<NonNullable<Parameters<typeof createTovuAssistantTransport>[1]>["createTransport"]>;
type JiniHostOptions = NonNullable<Parameters<CreateTransport>[0]["options"]>;

const STUB_TRANSPORT: ChatTransport = {
  startRun: async () => ({ runId: "stub" }),
  reattachRun: async () => {},
  fetchRunStatus: async () => null,
  stopRun: async () => {},
};

/** Builds the transport with a capturing factory and returns the host options Jini received. */
function jiniOptionsFor(options: Parameters<typeof createTovuAssistantTransport>[0]): JiniHostOptions {
  let captured: JiniHostOptions | undefined;
  const createTransport: CreateTransport = ({ options: received }) => {
    captured = received;
    return STUB_TRANSPORT;
  };
  createTovuAssistantTransport(options, { createTransport, activity: createStreamActivity({}) });
  return captured!;
}

const NO_OP_HANDLERS: RunHandlers = { onEvent: () => {}, onError: () => {}, onDone: () => {} };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("host callback forwarding", () => {
  test("forwards no callback at all when the dock wires none", () => {
    expect(jiniOptionsFor({})).toStrictEqual({
      getExecutionConfig: undefined,
      getAgUiEnabled: undefined,
      getResumeCapableAgentIds: undefined,
      ensureConversationId: undefined,
      persistUserTurn: undefined,
    });
  });

  test("getExecutionConfig is called with no arguments and its value returned", () => {
    const config = { mode: "local-cli" } as ExecutionConfig;
    const getExecutionConfig = vi.fn((..._args: unknown[]) => config);
    expect(jiniOptionsFor({ getExecutionConfig }).getExecutionConfig!({}, {})).toBe(config);
    expect(getExecutionConfig).toHaveBeenCalledWith();
  });

  test("getAgUiEnabled is called with no arguments and its value returned", () => {
    const getAgUiEnabled = vi.fn((..._args: unknown[]) => true);
    expect(jiniOptionsFor({ getAgUiEnabled }).getAgUiEnabled!({}, {})).toBe(true);
    expect(getAgUiEnabled).toHaveBeenCalledWith();
  });

  test("getResumeCapableAgentIds is called with no arguments and its value returned", () => {
    const ids = new Set(["claude"]);
    const getResumeCapableAgentIds = vi.fn((..._args: unknown[]) => ids);
    expect(jiniOptionsFor({ getResumeCapableAgentIds }).getResumeCapableAgentIds!({}, {})).toBe(ids);
    expect(getResumeCapableAgentIds).toHaveBeenCalledWith();
  });

  test("ensureConversationId is called with no arguments and its promise returned", async () => {
    const ensureConversationId = vi.fn(async (..._args: unknown[]) => "conv-1");
    await expect(jiniOptionsFor({ ensureConversationId }).ensureConversationId!({}, {})).resolves.toBe("conv-1");
    expect(ensureConversationId).toHaveBeenCalledWith();
  });

  test("persistUserTurn receives Jini's object argument as positional (conversationId, message)", async () => {
    const message: ChatMessage = { id: "u1", role: "user", content: "hello" };
    const persistUserTurn = vi.fn(async (..._args: unknown[]) => {});
    await jiniOptionsFor({ persistUserTurn }).persistUserTurn!({ conversationId: "conv-1", message }, {});
    expect(persistUserTurn).toHaveBeenCalledWith("conv-1", message);
  });

  test("each forwarded callback re-reads the option on every call instead of capturing it once", () => {
    const options = { getAgUiEnabled: () => false };
    const forwarded = jiniOptionsFor(options);
    options.getAgUiEnabled = () => true;
    expect(forwarded.getAgUiEnabled!({}, {})).toBe(true);
  });
});

describe("pending-turn cancel port", () => {
  test("a Stop before acceptance posts the turn's identity to /api/runs/pending/cancel", async () => {
    let acceptRun: (() => void) | undefined;
    const fetchMock = vi.fn((url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      if (url === "/api/runs") return new Promise((resolve) => { acceptRun = () => resolve(Response.json({ run: { id: "run-1" } })); });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const cancel = new AbortController();
    const started = createTovuAssistantTransport().startRun({
      history: [{ id: "u1", role: "user", content: "hi" }],
      agentId: "claude",
      context: { conversationId: "conv-1" },
      signal: new AbortController().signal,
      cancelSignal: cancel.signal,
    }, NO_OP_HANDLERS);
    await flushMicrotasks();
    cancel.abort();
    acceptRun!();
    await started.catch(() => undefined);

    const accepted = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { idempotencyKey: string };
    const cancelCall = fetchMock.mock.calls.find(([url]) => url === "/api/runs/pending/cancel")!;
    expect(cancelCall[1]).toStrictEqual({
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: accepted.idempotencyKey, conversationId: "conv-1" }),
    });
  });
});

describe("selected-skill guidance projection (BYOK dispatch)", () => {
  const BYOK: ExecutionConfig = {
    mode: "byok",
    byok: { protocol: "anthropic", providerId: "anthropic", apiKey: "sk-test-key", baseUrl: "", model: "m" },
    localCli: {} as ExecutionConfig["localCli"],
  } as ExecutionConfig;
  const SKILLS = { selectedSkills: [{ toolId: "skill_x", name: "x", guidance: "GUIDE " }] };

  /** Runs one BYOK turn and returns the `messages` the browser posted to the BYOK endpoint. */
  async function postedMessages(history: ChatMessage[]): Promise<Array<{ role: string; content: string }>> {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await createTovuAssistantTransport({ getExecutionConfig: () => BYOK })
      .startRun({ history, context: SKILLS, signal: new AbortController().signal }, NO_OP_HANDLERS)
      .catch(() => undefined);
    return (JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { messages: Array<{ role: string; content: string }> }).messages;
  }

  test("prefixes the guidance to the newest user message only", async () => {
    const messages = await postedMessages([
      { id: "u1", role: "user", content: "first" },
      { id: "a1", role: "assistant", content: "answer" },
      { id: "u2", role: "user", content: "second" },
      { id: "a2", role: "assistant", content: "later" },
    ]);
    expect(messages.map((message) => message.content)).toStrictEqual(["first", "answer", "GUIDE second", "later"]);
  });
});
