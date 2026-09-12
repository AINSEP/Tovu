import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers } from "@jini-ai/chat/react";

import {
  createTovuAssistantTransport,
  historyForTranscript,
  undeliveredUserPrompt,
} from "../assistant-transport";
import type { ExecutionConfig } from "@jini-ai/ui";

import { FakeEventSource, resetFakeEventSource, streamFromChunks } from "./assistant-transport.test-helpers";

/**
 * @file Regression suite for Defects 2 and 3 of the 2026-09-11 chat-lifecycle repair, both observed
 * in `sites/tovu-com/chat.db` conversation `9289701c-d56c-47f7-8e7a-f0a824c3ca23`.
 *
 * **Defect 2 — a failed run silently eats its user message.** Position 5's user text is in
 * `ai_chat_messages` and in NO agent-session transcript: the run at position 6 failed 140 ms after
 * start ("the agent process exited without answering", exit code none, signal none), so no CLI ever
 * read it. Every later turn then sent only the NEWEST user message — `resolveLocalCliPrompt`'s
 * optimization for an agent that carries its own memory — so position 5 was never conveyed to any
 * agent, ever. The text was durable and still lost, because nothing re-delivered it.
 *
 * **Defect 3 — a failed run's empty assistant row is reconstructed as if it were an answer.**
 * Positions 3 and 6 are `role='assistant'`, `run_status='failed'`, `length(content)=0`. Fed back
 * through `buildTranscript` they render as a `## assistant` turn with nothing under it — the agent
 * is told it replied, when what actually happened is that it died.
 *
 * Both fixes are read-side and client-side: the durable rows are left exactly as they are (they
 * carry the only surviving record of each failure — `events_json` holds the exit-code diagnostic
 * the pane renders on reload), and what changes is which of them a new run's prompt is built from.
 */

function handlers(): RunHandlers {
  return {
    onEvent: (_ev: AgentEvent) => undefined,
    onError: (_err: Error) => undefined,
    onDone: (_events: AgentEvent[]) => undefined,
  } as unknown as RunHandlers;
}

/** The conversation as it actually stood in `chat.db`, trimmed to the shape that matters: a user
 *  turn answered successfully, then a user turn whose run failed with an empty assistant row, then
 *  the turn being sent now. */
const HISTORY_WITH_A_FAILED_TURN: ChatMessage[] = [
  { id: "u1", role: "user", content: "we have the higgsfield plugin" },
  { id: "a1", role: "assistant", content: "Yes — it is installed.", runStatus: "succeeded" },
  { id: "u2", role: "user", content: "why are you talking all day" },
  { id: "a2", role: "assistant", content: "", runStatus: "failed" },
  { id: "u3", role: "user", content: "ok try again" },
];

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function stubRunsOk(): void {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
}

/** The prompt string the single `POST /api/runs` call actually put on the wire. */
function postedPrompt(): string {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const body = JSON.parse(init.body as string) as { contextRef: string };
  return (JSON.parse(body.contextRef) as { prompt: string }).prompt;
}

beforeEach(() => {
  resetFakeEventSource();
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("undeliveredUserPrompt — Defect 2: what a resume-capable agent is actually sent", () => {
  test("is just the newest turn when the previous turn was answered — the common case is unchanged", () => {
    expect(
      undeliveredUserPrompt([
        { id: "u1", role: "user", content: "first" },
        { id: "a1", role: "assistant", content: "answered", runStatus: "succeeded" },
        { id: "u2", role: "user", content: "second" },
      ]),
    ).toBe("second");
  });

  test("carries the user turn a failed run never delivered, alongside the newest one", () => {
    const prompt = undeliveredUserPrompt(HISTORY_WITH_A_FAILED_TURN);
    expect(prompt, "the message the failed run ate is still missing — it will never reach any agent").toContain(
      "why are you talking all day",
    );
    expect(prompt).toContain("ok try again");
    expect(prompt, "a turn the agent already answered was re-sent, duplicating it inside the CLI session").not.toContain(
      "we have the higgsfield plugin",
    );
  });

  test("re-delivered turns are marked, so the agent is not told the user said it all just now", () => {
    expect(undeliveredUserPrompt(HISTORY_WITH_A_FAILED_TURN)).toMatch(/never reached/i);
  });

  test("does not mark anything when there is only one turn to send", () => {
    // The note must be reserved for the case it explains. Stamping it on every ordinary turn would
    // put a standing lie in the prompt of every message in every conversation.
    expect(undeliveredUserPrompt([{ id: "u1", role: "user", content: "hello" }])).toBe("hello");
  });

  test("a canceled run's turn counts as undelivered too", () => {
    // Cancel can land after the CLI read the prompt or before; re-sending costs a duplicate the
    // agent can reconcile, where dropping it costs the user a message with no trace.
    const prompt = undeliveredUserPrompt([
      { id: "u1", role: "user", content: "do the thing" },
      { id: "a1", role: "assistant", content: "", runStatus: "canceled" },
      { id: "u2", role: "user", content: "actually do this instead" },
    ]);
    expect(prompt).toContain("do the thing");
    expect(prompt).toContain("actually do this instead");
  });

  test("an assistant turn still running does not count as a delivery boundary", () => {
    // Nothing has confirmed that run reached the CLI, and a `running` row is exactly what a run
    // killed by a daemon respawn leaves behind — it never reaches a terminal status at all.
    const prompt = undeliveredUserPrompt([
      { id: "u1", role: "user", content: "first" },
      { id: "a1", role: "assistant", content: "partial…", runStatus: "running" },
      { id: "u2", role: "user", content: "second" },
    ]);
    expect(prompt).toContain("first");
    expect(prompt).toContain("second");
  });

  test("an old assistant row with no runStatus at all counts as delivered — pre-runStatus transcripts", () => {
    // Rows written before `run_status` existed carry `undefined`. Treating those as undelivered
    // would re-send the entire history of every legacy conversation on its next turn.
    expect(
      undeliveredUserPrompt([
        { id: "u1", role: "user", content: "first" },
        { id: "a1", role: "assistant", content: "answered long ago" },
        { id: "u2", role: "user", content: "second" },
      ]),
    ).toBe("second");
  });
});

describe("historyForTranscript — Defect 3: a failed run is not an assistant turn", () => {
  test("drops an empty failed assistant row", () => {
    const kept = historyForTranscript(HISTORY_WITH_A_FAILED_TURN);
    expect(kept.map((m) => m.id)).toEqual(["u1", "a1", "u2", "u3"]);
  });

  test("drops a failed assistant row even when it captured partial output", () => {
    // Partial output stays in the stored row (the pane renders it), but it is not the agent's
    // answer and must not be replayed to the next run as one.
    const kept = historyForTranscript([
      { id: "u1", role: "user", content: "hi" },
      { id: "a1", role: "assistant", content: "I was about to say", runStatus: "failed" },
    ]);
    expect(kept.map((m) => m.id)).toEqual(["u1"]);
  });

  test("keeps every user turn, including one whose run failed", () => {
    const kept = historyForTranscript(HISTORY_WITH_A_FAILED_TURN);
    expect(kept.filter((m) => m.role === "user").map((m) => m.content)).toEqual([
      "we have the higgsfield plugin",
      "why are you talking all day",
      "ok try again",
    ]);
  });

  test("keeps succeeded assistant turns and legacy rows with no runStatus", () => {
    const kept = historyForTranscript([
      { id: "a1", role: "assistant", content: "done", runStatus: "succeeded" },
      { id: "a2", role: "assistant", content: "old", },
    ]);
    expect(kept.map((m) => m.id)).toEqual(["a1", "a2"]);
  });
});

describe("startRun — the prompt that actually reaches the wire", () => {
  test("a non-resume-capable agent's transcript contains no failed assistant turn", async () => {
    stubRunsOk();
    const transport = createTovuAssistantTransport({ getResumeCapableAgentIds: () => new Set<string>() });

    await transport.startRun(
      { history: HISTORY_WITH_A_FAILED_TURN, agentId: "stateless-agent", context: { conversationId: "c1" }, signal: new AbortController().signal },
      handlers(),
    );

    const prompt = postedPrompt();
    // Two `## assistant` blocks would mean the empty failed row was rendered as a turn of its own.
    expect((prompt.match(/^## assistant$/gm) ?? []).length, "a failed run was replayed as an assistant turn").toBe(1);
    expect(prompt).toContain("Yes — it is installed.");
  });

  test("a resume-capable agent is sent the undelivered turns, not only the newest one", async () => {
    stubRunsOk();
    const transport = createTovuAssistantTransport({ getResumeCapableAgentIds: () => new Set(["claude"]) });

    await transport.startRun(
      { history: HISTORY_WITH_A_FAILED_TURN, agentId: "claude", context: { conversationId: "c1" }, signal: new AbortController().signal },
      handlers(),
    );

    const prompt = postedPrompt();
    expect(prompt).toContain("why are you talking all day");
    expect(prompt).toContain("ok try again");
    // Still the resume optimization, not a full transcript: the CLI session already holds the
    // answered part of the conversation, and re-sending it is what the optimization exists to avoid.
    expect(prompt).not.toContain("## assistant");
    expect(prompt).not.toContain("we have the higgsfield plugin");
  });
});

describe("startRun — Defect 2: the user turn is made durable before the run is dispatched", () => {
  test("persistUserTurn is awaited BEFORE POST /api/runs", async () => {
    stubRunsOk();
    const order: string[] = [];
    const fetchOrdered = vi.fn(async () => {
      order.push("dispatch");
      return new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchOrdered);
    const persistUserTurn = vi.fn(async () => {
      await Promise.resolve();
      order.push("persist");
    });

    const transport = createTovuAssistantTransport({ persistUserTurn });
    await transport.startRun(
      { history: HISTORY_WITH_A_FAILED_TURN, agentId: "claude", context: { conversationId: "c1" }, signal: new AbortController().signal },
      handlers(),
    );

    expect(order, "the run was dispatched before the user's message was durable").toEqual(["persist", "dispatch"]);
  });

  test("persistUserTurn receives the conversation id and the exact ChatMessage being sent", async () => {
    stubRunsOk();
    const persistUserTurn = vi.fn(async () => undefined);
    const transport = createTovuAssistantTransport({ persistUserTurn });

    await transport.startRun(
      { history: HISTORY_WITH_A_FAILED_TURN, agentId: "claude", context: { conversationId: "c1" }, signal: new AbortController().signal },
      handlers(),
    );

    // The message id is the idempotency key: `saveMessage` PUTs to
    // `/messages/<id>`, so the same message written twice is one row, not two.
    expect(persistUserTurn).toHaveBeenCalledTimes(1);
    expect(persistUserTurn).toHaveBeenCalledWith("c1", expect.objectContaining({ id: "u3", role: "user", content: "ok try again" }));
  });

  test("a failed durable write does not cost the user the turn", async () => {
    stubRunsOk();
    const persistUserTurn = vi.fn(async () => {
      throw new Error("PUT /messages 503");
    });
    const transport = createTovuAssistantTransport({ persistUserTurn });

    const result = await transport.startRun(
      { history: HISTORY_WITH_A_FAILED_TURN, agentId: "claude", context: { conversationId: "c1" }, signal: new AbortController().signal },
      handlers(),
    );

    expect(result).toEqual({ runId: "run-1" });
  });

  test("is not called when there is no conversation to write into", async () => {
    stubRunsOk();
    const persistUserTurn = vi.fn(async () => undefined);
    const transport = createTovuAssistantTransport({ persistUserTurn });

    await transport.startRun(
      { history: HISTORY_WITH_A_FAILED_TURN, agentId: "claude", signal: new AbortController().signal },
      handlers(),
    );

    expect(persistUserTurn).not.toHaveBeenCalled();
  });

  test("a transport built without the option still dispatches — every existing consumer keeps working", async () => {
    stubRunsOk();
    const transport = createTovuAssistantTransport();

    const result = await transport.startRun(
      { history: HISTORY_WITH_A_FAILED_TURN, agentId: "claude", context: { conversationId: "c1" }, signal: new AbortController().signal },
      handlers(),
    );

    expect(result).toEqual({ runId: "run-1" });
  });
});

describe("startByokRun — Defect 3 on the second route", () => {
  test("a failed run's partial output is not sent to the provider as an assistant message", async () => {
    // The empty-content filter already hid a run that produced nothing; a run that emitted a few
    // tokens before dying was still sent as if it were the assistant's answer.
    const stream = streamFromChunks(["event: end\ndata: {}\n\n"]);
    const byokFetch = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", byokFetch);
    const byokConfig = {
      mode: "byok",
      byok: { protocol: "anthropic", providerId: "anthropic", apiKey: "sk-test", baseUrl: "", model: "m" },
      localCli: {} as ExecutionConfig["localCli"],
    } as ExecutionConfig;
    const transport = createTovuAssistantTransport({ getExecutionConfig: () => byokConfig });

    await transport.startRun(
      {
        history: [
          { id: "u1", role: "user", content: "hi" },
          { id: "a1", role: "assistant", content: "I was about to say", runStatus: "failed" },
          { id: "u2", role: "user", content: "again" },
        ],
        signal: new AbortController().signal,
      },
      handlers(),
    );

    const [, init] = byokFetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { messages: { role: string; content: string }[] };
    expect(body.messages.map((m) => m.content)).toEqual(["hi", "again"]);
  });
});
