// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@jini-ai/chat/core";

import { HttpError, type AssistantConversation } from "../../lib/assistant-chats";
import { createFakeAssistantChatsPort } from "../assistant-chats-dependencies.hooks";
import type { AssistantChatsPort } from "../assistant-chats-port.hooks";
import { useAssistantChats } from "../use-assistant-chats.hooks";

/**
 * @file Regression suite for Defect 2 of the 2026-09-11 chat-lifecycle repair: a user message that
 * a failed run ate.
 *
 * Before this, the ONLY thing that wrote a user turn was `flush`, driven asynchronously off
 * `onMessagesChange` deltas — a `Promise.all` with no ordering relationship whatsoever to
 * `assistant-transport.ts`'s `POST /api/runs`. The two are not atomic and never were: a browser or
 * daemon death in the window between them leaves a dispatched run whose prompt is on disk nowhere.
 *
 * `persistUserTurn` is the durable-before-dispatch half, awaited by `startRun`. Its contract has
 * two halves that are easy to get half-right: the write must actually happen, and it must not
 * double-write the same message once `flush` sees it a moment later in a delta.
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

/** Renders against `port` and waits out the mount refresh — the same helper shape
 *  `use-assistant-chats.unit.test.ts` uses next door, for the same reason: the hook reads its
 *  conversation list on mount, and asserting before that settles reads a pre-refresh render. */
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

describe("useAssistantChats.persistUserTurn", () => {
  it("writes the message through the port, awaited, before anything else touches it", async () => {
    const port = createFakeAssistantChatsPort({ conversations: [CONVERSATION] });
    const { result } = await mountWith(port);

    await act(async () => {
      await result.current.persistUserTurn("fake-seed", userTurn("u1", "save this before you dispatch"));
    });

    expect(port.saved.get("fake-seed")?.map((m) => m.id)).toEqual(["u1"]);
  });

  it("does NOT write the same message a second time when the delta-driven flush sees it", async () => {
    /*
     * The idempotency half. `saveMessage` PUTs to `/messages/<id>`, so a second write would not
     * corrupt anything — but it would be a duplicate request per message for the rest of the
     * session, on the hottest path in the feature. `persistUserTurn` marks the id written for the
     * same reason `flush` marks before its own request resolves.
     */
    const port = createFakeAssistantChatsPort({ conversations: [CONVERSATION] });
    const { result } = await mountWith(port);

    const message = userTurn("u1", "hello");
    await act(async () => {
      result.current.select("fake-seed");
    });
    await act(async () => {
      await result.current.persistUserTurn("fake-seed", message);
    });
    await act(async () => {
      result.current.onMessagesChange([message]);
    });

    expect(port.attemptedIds(), "the message was written twice — persistUserTurn and flush both sent it").toEqual(["u1"]);
  });

  it("releases the id for a later retry when the write fails permanently", async () => {
    // A 400 is never worth re-attempting inside `saveWithRetry`, but the id must still go back in
    // the queue: `flush` is the fallback path, and a turn whose durable write failed outright is
    // exactly the one that must not be silently marked as stored.
    const seen: string[] = [];
    const port = createFakeAssistantChatsPort({
      conversations: [CONVERSATION],
      onSaveMessage: (_conversationId, message) => {
        seen.push(message.id);
        if (seen.length === 1) throw new HttpError(400, "Bad Request");
      },
    });
    const { result } = await mountWith(port);

    const message = userTurn("u1", "hello");
    await act(async () => {
      result.current.select("fake-seed");
    });
    await act(async () => {
      await result.current.persistUserTurn("fake-seed", message);
    });
    await act(async () => {
      result.current.onMessagesChange([message]);
    });

    await waitFor(() => expect(port.saved.get("fake-seed")?.map((m) => m.id)).toEqual(["u1"]));
    expect(seen, "the permanently-failed id was marked written and never retried").toEqual(["u1", "u1"]);
  });

  it("never rejects — a lost durable copy must not cost the user the turn", async () => {
    const port = createFakeAssistantChatsPort({
      conversations: [CONVERSATION],
      onSaveMessage: () => {
        throw new HttpError(400, "Bad Request");
      },
    });
    const { result } = await mountWith(port);

    await act(async () => {
      await expect(result.current.persistUserTurn("fake-seed", userTurn("u1", "hello"))).resolves.toBeUndefined();
    });
  });
});
