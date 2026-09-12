// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@jini-ai/chat/core";

import { HttpError, type AssistantConversation } from "../../lib/assistant-chats";
import { createFakeAssistantChatsPort } from "../assistant-chats-dependencies.hooks";
import type { AssistantChatsPort } from "../assistant-chats-port.hooks";
import { useAssistantChats } from "../use-assistant-chats.hooks";

/**
 * @file Regression suite for the reattach investigation's Part B (2026-09-11): a non-terminal run's
 * `runId` durably recorded somewhere, not just held in the live tab that started it.
 *
 * Before this, `persistableMessages` (see `assistant-chats.ts`) never wrote a `queued`/`running`
 * assistant row at all — by design, to avoid a write per streamed token. That is still true for the
 * NORMAL settled-transcript writer, `flush`. What was missing is the one-time exception: the moment
 * a run's `runId` first appears on the pane's current assistant message, it is worth exactly one
 * extra durable write, because that id is the only thing a future reattach could ever resume. This
 * suite proves that write happens, happens at most once per run (not once per delta), and does not
 * interfere with the normal terminal-state write that follows it.
 */

const CONVERSATION: AssistantConversation = {
  id: "fake-seed",
  title: null,
  titleSource: "fallback",
  messageCount: 0,
  createdAt: 1,
  updatedAt: 1,
};

const userTurn = (id: string, content: string): ChatMessage => ({ id, role: "user", content });

/** Same helper `use-assistant-chats.unit.test.ts` and the durable-turn suite already use — the hook
 *  reads its conversation list on mount, and asserting before that settles reads a pre-refresh render. */
async function mountWith(port: AssistantChatsPort) {
  const rendered = renderHook(() => useAssistantChats(port));
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useAssistantChats — active-run stub write", () => {
  it("durably writes a non-terminal assistant message's runId the first time onMessagesChange sees it", async () => {
    const port = createFakeAssistantChatsPort({ conversations: [CONVERSATION] });
    const { result } = await mountWith(port);

    await act(async () => {
      result.current.select("fake-seed");
    });

    const running: ChatMessage = { id: "a1", role: "assistant", content: "", runId: "run-1", runStatus: "running" };
    await act(async () => {
      result.current.onMessagesChange([userTurn("u1", "hello"), running]);
    });

    await waitFor(() => {
      const saved = port.saved.get("fake-seed")?.map((m) => m.id) ?? [];
      expect(saved).toContain("a1");
    });
    expect(port.saved.get("fake-seed")?.find((m) => m.id === "a1")).toMatchObject({
      runId: "run-1",
      runStatus: "running",
    });
  });

  it("writes the stub exactly once across repeated deltas for the same run, not once per token", async () => {
    const port = createFakeAssistantChatsPort({ conversations: [CONVERSATION] });
    const { result } = await mountWith(port);

    await act(async () => {
      result.current.select("fake-seed");
    });

    const deltas = ["H", "He", "Hel", "Hell", "Hello"].map(
      (content): ChatMessage => ({ id: "a1", role: "assistant", content, runId: "run-1", runStatus: "running" }),
    );
    for (const assistantMessage of deltas) {
      await act(async () => {
        result.current.onMessagesChange([userTurn("u1", "hello"), assistantMessage]);
      });
    }

    await waitFor(() => expect(port.saved.get("fake-seed")?.some((m) => m.id === "a1")).toBe(true));
    const stubAttempts = port.attemptedIds().filter((id) => id === "a1").length;
    expect(stubAttempts, "the stub must not be re-sent on every delta").toBe(1);
  });

  it("lets the terminal write land afterward and overwrite the stub in place", async () => {
    const port = createFakeAssistantChatsPort({ conversations: [CONVERSATION] });
    const { result } = await mountWith(port);

    await act(async () => {
      result.current.select("fake-seed");
    });

    await act(async () => {
      result.current.onMessagesChange([
        userTurn("u1", "hello"),
        { id: "a1", role: "assistant", content: "wor", runId: "run-1", runStatus: "running" },
      ]);
    });
    await waitFor(() => expect(port.saved.get("fake-seed")?.some((m) => m.id === "a1")).toBe(true));

    await act(async () => {
      result.current.onMessagesChange([
        userTurn("u1", "hello"),
        { id: "a1", role: "assistant", content: "world", runId: "run-1", runStatus: "succeeded" },
      ]);
    });

    await waitFor(() => {
      const finalRow = port.saved.get("fake-seed")?.find((m) => m.id === "a1");
      expect(finalRow).toMatchObject({ content: "world", runStatus: "succeeded" });
    });
    // Still one row, not two — the id is the idempotency key both writers share.
    expect(port.saved.get("fake-seed")?.filter((m) => m.id === "a1")).toHaveLength(1);
  });

  it("adopts a conversation and writes the stub even when none is selected yet", async () => {
    // Turn 1 of a brand-new chat: nothing has been `select()`-ed. `onMessagesChange`'s lazy-adoption
    // branch must carry the same stub behavior as the already-active-conversation branch above.
    const port = createFakeAssistantChatsPort();
    const { result } = await mountWith(port);

    await act(async () => {
      result.current.onMessagesChange([
        userTurn("u1", "hello"),
        { id: "a1", role: "assistant", content: "", runId: "run-1", runStatus: "queued" },
      ]);
    });

    await waitFor(() => {
      const [, savedForFirstConversation] = [...port.saved.entries()][0] ?? [];
      expect(savedForFirstConversation?.some((m) => m.id === "a1")).toBe(true);
    });
  });

  it("a failed stub write is retried by the next delta rather than left permanently missing", async () => {
    let failuresLeft = 1;
    const port = createFakeAssistantChatsPort({
      conversations: [CONVERSATION],
      onSaveMessage: (_conversationId, message) => {
        if (message.id === "a1" && failuresLeft > 0) {
          failuresLeft -= 1;
          throw new HttpError(503, "Service Unavailable");
        }
      },
    });
    const { result } = await mountWith(port);

    await act(async () => {
      result.current.select("fake-seed");
    });

    await act(async () => {
      result.current.onMessagesChange([
        userTurn("u1", "hello"),
        { id: "a1", role: "assistant", content: "h", runId: "run-1", runStatus: "running" },
      ]);
    });
    // The first attempt threw; nothing durable yet.
    expect(port.saved.get("fake-seed")?.some((m) => m.id === "a1")).toBe(false);

    await act(async () => {
      result.current.onMessagesChange([
        userTurn("u1", "hello"),
        { id: "a1", role: "assistant", content: "he", runId: "run-1", runStatus: "running" },
      ]);
    });

    await waitFor(() => expect(port.saved.get("fake-seed")?.some((m) => m.id === "a1")).toBe(true));
  });
});
