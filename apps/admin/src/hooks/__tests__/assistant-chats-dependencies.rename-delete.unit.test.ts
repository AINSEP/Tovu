import { afterEach, expect, it, vi } from "vitest";
import type { ChatMessage } from "@jini-ai/chat/core";
import { createFakeAssistantChatsPort, defaultAssistantChatsPort } from "../assistant-chats-dependencies.hooks";

afterEach(() => vi.unstubAllGlobals());

const message = (id: string): ChatMessage => ({ id, role: "user", content: "hi" }) as ChatMessage;

function recordFetch() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}

it("the real port renames and deletes the named conversation with PATCH and DELETE", async () => {
  const calls = recordFetch();
  await defaultAssistantChatsPort.renameConversation({ id: "c/1", title: "New title" });
  await defaultAssistantChatsPort.deleteConversation({ id: "c/1" });
  expect(calls).toHaveLength(2);
  expect(calls[0]!.method).toMatch(/PATCH|PUT/);
  expect(calls[0]!.url).toContain("c%2F1");
  expect(JSON.stringify(calls[0]!.body)).toContain("New title");
  expect(calls[1]!.method).toBe("DELETE");
  expect(calls[1]!.url).toContain("c%2F1");
});

it("the fake refuses a write whose conversation disappears while the save hook runs, leaving nothing persisted", async () => {
  let port!: ReturnType<typeof createFakeAssistantChatsPort>;
  port = createFakeAssistantChatsPort({
    conversations: [{ id: "c1", title: "t", titleSource: "manual", messageCount: 0, createdAt: 1, updatedAt: 1 }],
    onSaveMessage: (conversationId) => { void port.deleteConversation({ id: conversationId }); },
  });
  await expect(port.saveMessage({ conversationId: "c1", message: message("m1") })).rejects.toMatchObject({ status: 404 });
  expect(port.saved.get("c1")).toBeUndefined();
  expect(port.attemptedIds()).toEqual(["m1"]);
});

it("the real port creates with the first message, loads a transcript and saves a message for the named conversation", async () => {
  const calls = recordFetch();
  await defaultAssistantChatsPort.createConversation({}, { firstMessage: "Plan my launch" });
  await defaultAssistantChatsPort.loadMessages({ conversationId: "c/1" });
  await defaultAssistantChatsPort.saveMessage({ conversationId: "c/1", message: message("m1") });
  expect(calls).toHaveLength(3);
  expect(calls[0]!.method).toBe("POST");
  expect(JSON.stringify(calls[0]!.body)).toContain("Plan my launch");
  expect(calls[1]!.method).toBe("GET");
  expect(calls[1]!.url).toContain("c%2F1");
  expect(calls[2]!.method).toMatch(/PUT|POST/);
  expect(calls[2]!.url).toContain("c%2F1");
  expect(JSON.stringify(calls[2]!.body)).toContain("m1");
});
