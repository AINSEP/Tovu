// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { LastConversationStore } from "@jini-ai/chat/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssistantConversation } from "../../lib/assistant-chats";
import { createFakeAssistantChatsPort } from "../assistant-chats-dependencies.hooks";
import type { AssistantChatsPort } from "../assistant-chats-port.hooks";
import { useAssistantChats, useWiredAssistantChats } from "../use-assistant-chats.hooks";

/**
 * @file Owner ask (2026-10-06): reloading the admin, or leaving and coming back, reopens the chat the
 * operator was last on — not an empty new chat. The remembered id is a `LastConversationStore`
 * (`@jini-ai/chat/react`), injected here as an in-memory fake.
 */

const conversation = (id: string, updatedAt: number): AssistantConversation => ({
  id,
  title: id,
  titleSource: "manual",
  messageCount: 1,
  createdAt: updatedAt,
  updatedAt,
});

const message = (id: string, content: string) => ({ id, role: "user" as const, content, createdAt: 1 });

/** An in-memory {@link LastConversationStore} that records every write and clear, in order. */
function fakeLastConversation(initial: string | null): LastConversationStore & { readonly current: () => string | null; readonly log: string[] } {
  let id = initial;
  const log: string[] = [];
  return {
    current: () => id,
    log,
    read: () => id,
    write: (next) => {
      id = next;
      log.push(`write:${next}`);
    },
    clear: () => {
      id = null;
      log.push("clear");
    },
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useAssistantChats reopens the last conversation", () => {
  it("lands on the remembered conversation, even when it is not the newest", async () => {
    const port = createFakeAssistantChatsPort({
      conversations: [conversation("c1", 2), conversation("c2", 1)],
      messages: { c2: [message("m1", "older chat")] },
    });
    const lastConversation = fakeLastConversation("c2");

    const { result } = renderHook(() => useAssistantChats(port, { lastConversation }));
    await waitFor(() => expect(result.current.activeId).toBe("c2"));

    expect(result.current.paneKey).toBe("c2");
    expect(result.current.initialMessages).toEqual([message("m1", "older chat")]);
    expect(lastConversation.current()).toBe("c2");
  });

  it("falls back to a new chat and forgets the id when the remembered conversation is gone", async () => {
    const port = createFakeAssistantChatsPort({ conversations: [conversation("c1", 2)] });
    const lastConversation = fakeLastConversation("deleted-elsewhere");

    const { result } = renderHook(() => useAssistantChats(port, { lastConversation }));
    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual(["c1"]));
    await settle();

    expect(result.current.activeId).toBeNull();
    expect(result.current.paneKey).toBe("new");
    expect(lastConversation.log).toEqual(["clear"]);
    expect(lastConversation.current()).toBeNull();
  });

  it("keeps the remembered id when the list itself fails to load — a network blip is not a deletion", async () => {
    const base = createFakeAssistantChatsPort({ conversations: [conversation("c2", 1)] });
    const port: AssistantChatsPort = { ...base, listConversations: () => Promise.reject(new TypeError("Failed to fetch")) };
    const lastConversation = fakeLastConversation("c2");

    const { result } = renderHook(() => useAssistantChats(port, { lastConversation }));
    await settle();
    await settle();

    expect(result.current.activeId).toBeNull();
    expect(result.current.paneKey).toBe("new");
    expect(lastConversation.log).toEqual([]);
    expect(lastConversation.current()).toBe("c2");
  });

  it("does not yank the operator away when they started a chat before the restore landed", async () => {
    let releaseList!: () => void;
    const listGate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    const base = createFakeAssistantChatsPort({ conversations: [conversation("c2", 1)] });
    const port: AssistantChatsPort = {
      ...base,
      listConversations: async () => {
        await listGate;
        return base.listConversations();
      },
    };
    const lastConversation = fakeLastConversation("c2");

    const { result } = renderHook(() => useAssistantChats(port, { lastConversation }));
    await act(async () => {
      await result.current.create();
    });
    expect(result.current.activeId).toBe("fake-1");

    await act(async () => {
      releaseList();
      await listGate;
    });
    await settle();

    expect(result.current.activeId).toBe("fake-1");
    expect(result.current.paneKey).toBe("fake-1");
    expect(lastConversation.current()).toBe("fake-1");
  });

  it("remembers every switch, new chat and lazily adopted chat; forgets when the last chat is deleted", async () => {
    const port = createFakeAssistantChatsPort({ conversations: [conversation("c1", 2), conversation("c2", 1)] });
    const lastConversation = fakeLastConversation(null);

    const { result } = renderHook(() => useAssistantChats(port, { lastConversation }));
    await settle();
    expect(lastConversation.log).toEqual([]);

    act(() => result.current.select("c2"));
    await waitFor(() => expect(result.current.activeId).toBe("c2"));
    await act(async () => {
      await result.current.create();
    });
    expect(lastConversation.log).toEqual(["write:c2", "write:fake-1"]);

    await act(async () => {
      await result.current.remove("fake-1");
    });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    await act(async () => {
      await result.current.remove("c2");
      await result.current.remove("c1");
    });
    await waitFor(() => expect(result.current.activeId).toBeNull());
    expect(lastConversation.log).toEqual(["write:c2", "write:fake-1", "write:c1", "clear"]);

    await act(async () => {
      await result.current.ensureConversationId();
    });
    expect(result.current.activeId).toBe("fake-2");
    expect(lastConversation.current()).toBe("fake-2");
  });

  it("without a store, a reload still opens an empty new chat (unchanged behaviour)", async () => {
    const port = createFakeAssistantChatsPort({ conversations: [conversation("c1", 2)] });
    const { result } = renderHook(() => useAssistantChats(port));
    await settle();
    expect(result.current.activeId).toBeNull();
    expect(result.current.paneKey).toBe("new");
  });
});

describe("useWiredAssistantChats scopes the memory to workspace + signed-in user", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = String(url).endsWith("/messages")
          ? { messages: [] }
          : { conversations: [conversation("c1", 2), conversation("c2", 1)] };
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("reopens this user's remembered chat and ignores another user's", async () => {
    localStorage.setItem("jini.chat.last-conversation.v1.workspace-local%3Auser-1", JSON.stringify({ v: 1, id: "c2" }));

    const mine = renderHook(() => useWiredAssistantChats({ principalId: "user-1" }));
    await waitFor(() => expect(mine.result.current.activeId).toBe("c2"));

    const theirs = renderHook(() => useWiredAssistantChats({ principalId: "user-2" }));
    await waitFor(() => expect(theirs.result.current.conversations).toHaveLength(2));
    await settle();
    expect(theirs.result.current.activeId).toBeNull();
  });

  it("switching chats rewrites this user's entry", async () => {
    const { result } = renderHook(() => useWiredAssistantChats({ principalId: "user-1" }));
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));
    act(() => result.current.select("c1"));
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    expect(localStorage.getItem("jini.chat.last-conversation.v1.workspace-local%3Auser-1")).toBe('{"v":1,"id":"c1"}');
  });
});
