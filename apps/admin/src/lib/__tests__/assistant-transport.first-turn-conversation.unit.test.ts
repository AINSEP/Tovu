import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers } from "@jini-ai/chat/react";

import { createTovuAssistantTransport } from "../assistant-transport";
import { FakeEventSource, resetFakeEventSource } from "./assistant-transport.test-helpers";

/**
 * @file Regression suite for the turn-1 amnesia defect (2026-09-09): the admin chat pane lost the
 * ENTIRE conversation between turn 1 and turn 2, and turn 2's agent answered as if it were the
 * first message.
 *
 * The mechanism, end to end:
 *  1. `useChatsSeam` adopts a conversation LAZILY — nothing selects one on mount, so `activeId` is
 *     `null` until the first delta reaches `onMessagesChange`, which is inside `sendMessage`.
 *  2. `@jini-ai/chat`'s `useChatPane.sendPrompt` freezes `options.runContext(...)` into a plain
 *     `context` object BEFORE it calls `conversation.sendMessage(...)`. Adoption has therefore not
 *     even STARTED when the run's context is captured, let alone resolved (it is an HTTP POST).
 *  3. So turn 1's `contextRef` carries no `conversationId` at all.
 *  4. `agent-daemon-server.ts`'s `onStarted` gates its ENTIRE session-capture subscription on
 *     `if (conversationId !== undefined)`. With no id, nothing ever calls
 *     `AgentSessionStore.setSessionId` — silently, since nothing was attempted there is no
 *     "failed to persist" log line either.
 *  5. Turn 2 finds nothing stored, starts a cold CLI session, and — because
 *     `agentCarriesOwnMemory('claude')` is true — was sent ONLY the bare latest user message.
 *     Total amnesia.
 *
 * The fix belongs here, at the last point before the run is dispatched that can still `await`:
 * `startRun` resolves a conversation id when the caller's context has none, so every run carries
 * the identity its session id must be filed under.
 */

function handlers(): RunHandlers {
  return {
    onEvent: (_ev: AgentEvent) => undefined,
    onError: (_err: Error) => undefined,
    onDone: (_events: AgentEvent[]) => undefined,
  } as unknown as RunHandlers;
}

const HISTORY: ChatMessage[] = [{ id: "1", role: "user", content: "can you save this media put" }];

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function stubRunsOk(): void {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
}

/** The `conversationId` the single `POST /api/runs` call actually put on the wire. */
function postedConversationId(): unknown {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const body = JSON.parse(init.body as string) as { contextRef: string };
  return (JSON.parse(body.contextRef) as { conversationId?: unknown }).conversationId;
}

beforeEach(() => {
  resetFakeEventSource();
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startRun — turn 1 must carry a conversation id", () => {
  test("resolves one via ensureConversationId when the caller's context has none", async () => {
    stubRunsOk();
    const ensureConversationId = vi.fn(async () => "conv-adopted");
    const transport = createTovuAssistantTransport({ ensureConversationId });

    await transport.startRun({ history: HISTORY, agentId: "claude", signal: new AbortController().signal }, handlers());

    expect(ensureConversationId).toHaveBeenCalledTimes(1);
    expect(postedConversationId()).toBe("conv-adopted");
  });

  test("does not adopt when the context already names a conversation — turn 2 onward", async () => {
    stubRunsOk();
    const ensureConversationId = vi.fn(async () => "conv-adopted");
    const transport = createTovuAssistantTransport({ ensureConversationId });

    await transport.startRun(
      { history: HISTORY, agentId: "claude", context: { conversationId: "conv-existing" }, signal: new AbortController().signal },
      handlers(),
    );

    expect(ensureConversationId).not.toHaveBeenCalled();
    expect(postedConversationId()).toBe("conv-existing");
  });

  test("still starts the run when adoption fails — a lost session id must not cost the user the turn", async () => {
    stubRunsOk();
    const ensureConversationId = vi.fn(async () => {
      throw new Error("POST /conversations 500");
    });
    const transport = createTovuAssistantTransport({ ensureConversationId });

    const result = await transport.startRun(
      { history: HISTORY, agentId: "claude", signal: new AbortController().signal },
      handlers(),
    );

    expect(result).toEqual({ runId: "run-1" });
    expect(postedConversationId()).toBeUndefined();
  });

  test("omits the key entirely when no resolver is wired at all", async () => {
    stubRunsOk();
    const transport = createTovuAssistantTransport();

    await transport.startRun({ history: HISTORY, agentId: "claude", signal: new AbortController().signal }, handlers());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { contextRef: string };
    expect("conversationId" in JSON.parse(body.contextRef)).toBe(false);
  });
});
