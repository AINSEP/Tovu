import { describe, expect, test } from "vitest";

import type { ChatMessage } from "@jini-ai/chat/core";

import type { AssistantConversation } from "../../lib/assistant-chats";
import { createAssistantLastConversationStore, createFakeAssistantChatsPort, upsertMessage, withDerivedTitle } from "../assistant-chats-dependencies.hooks";

/**
 * @file `upsertMessage` — pulled out of `createFakeAssistantChatsPort`'s `saveMessage`
 * (2026-08-06, complexity pass, second pass): that method needed the identical "find by id, then
 * splice-in-place or append" ternary twice (once for the durable `messages` map, once for the
 * `saved` map tests read back), and extracting it here removes the duplication instead of just
 * relocating it. `use-assistant-chats.unit.test.ts`'s many `saveMessage`-driven scenarios already
 * exercise this indirectly through the fake port; these tests pin the upsert's own ordering
 * contract directly, with no port, no conversation state, involved.
 */

const message = (id: string, content: string): ChatMessage => ({
  id,
  role: "user" as const,
  content,
  createdAt: 1,
});

describe("upsertMessage", () => {
  test("appends a new id to an empty list", () => {
    expect(upsertMessage([], message("m1", "hi"))).toEqual([message("m1", "hi")]);
  });

  test("appends a new id after existing entries, in order", () => {
    const list = [message("m1", "first")];
    expect(upsertMessage(list, message("m2", "second"))).toEqual([message("m1", "first"), message("m2", "second")]);
  });

  test("replaces an existing id IN PLACE — updated content, same position, not moved to the end", () => {
    const list = [message("m1", "first"), message("m2", "second"), message("m3", "third")];
    const updated = upsertMessage(list, message("m2", "second (edited)"));
    expect(updated).toEqual([message("m1", "first"), message("m2", "second (edited)"), message("m3", "third")]);
  });

  test("does not mutate the input list", () => {
    const list = [message("m1", "first")];
    const snapshot = [...list];
    upsertMessage(list, message("m2", "second"));
    expect(list).toEqual(snapshot);
  });
});

/**
 * @file `withDerivedTitle` — pulled out of `createFakeAssistantChatsPort`'s `saveMessage`
 * (2026-08-06, complexity pass, third pass) so its `message.role === "user" && !conversation.title`
 * / nested `if (derived)` pair collapses into one unconditional call at the site.
 */
const conversation = (overrides: Partial<AssistantConversation> = {}): AssistantConversation => ({
  id: "c1",
  title: null,
  titleSource: "fallback",
  messageCount: 0,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("withDerivedTitle", () => {
  test("derives a title from the first user message when currently untitled", () => {
    const result = withDerivedTitle(conversation(), message("m1", "translate this page for me"));
    expect(result.title).toBe("Translate this page for me");
    expect(result.titleSource).toBe("fallback");
  });

  test("leaves an already-titled conversation unchanged, even for a user message", () => {
    const titled = conversation({ title: "Existing title", titleSource: "manual" });
    expect(withDerivedTitle(titled, message("m1", "new content"))).toBe(titled);
  });

  test("leaves an untitled conversation unchanged for a non-user message", () => {
    const untitled = conversation();
    const assistantMessage = { ...message("m1", "a reply"), role: "assistant" as const };
    expect(withDerivedTitle(untitled, assistantMessage)).toBe(untitled);
  });

  test("leaves the conversation unchanged when derivation produces no usable title", () => {
    const untitled = conversation();
    expect(withDerivedTitle(untitled, message("m1", "   "))).toBe(untitled);
  });
});

describe("fake chat persistence", () => {
  test("creation derives a title from a supplied first message", async () => {
    const port = createFakeAssistantChatsPort();
    const created = await port.createConversation('Write a page called "Getting Started"');
    expect(created.title).toBe("Page: Getting Started");
    expect((await port.listConversations()).find(row => row.id === created.id)).toEqual(created);
  });

  test("a nonempty first message with no meaningful title stays untitled", async () => {
    const port = createFakeAssistantChatsPort();
    expect((await port.createConversation("   ")).title).toBeNull();
  });

  test("renaming a missing conversation does not change existing conversations", async () => {
    const existing = conversation();
    const port = createFakeAssistantChatsPort({ conversations: [existing] });
    await port.renameConversation("missing", "New title");
    expect(await port.listConversations()).toEqual([existing]);
  });

  test("deleting an orphan transcript removes its messages without removing another conversation", async () => {
    const existing = conversation();
    const port = createFakeAssistantChatsPort({ conversations: [existing], messages: { orphan: [message("m1", "orphan")] } });
    expect(await port.loadMessages("orphan")).toEqual([message("m1", "orphan")]);
    await port.deleteConversation("orphan");
    expect(await port.loadMessages("orphan")).toEqual([]);
    expect(await port.listConversations()).toEqual([existing]);
  });
});

// L13 Stryker: `findIndex(m => m.id === message.id)` and the messageCount bump-vs-replace survived.
describe("fake chat persistence — L13 count and missing-row gaps", () => {
  test("re-saving the same message id replaces it in place and does not bump messageCount", async () => {
    const port = createFakeAssistantChatsPort();
    const { id } = await port.createConversation();
    await port.saveMessage(id, message("m1", "first"));
    await port.saveMessage(id, message("m2", "second"));
    await port.saveMessage(id, message("m1", "first, edited"));
    const row = (await port.listConversations()).find(c => c.id === id)!;
    expect(row.messageCount).toBe(2);
    expect(row.updatedAt).toBe(row.createdAt + 3);
    expect(await port.loadMessages(id)).toEqual([message("m1", "first, edited"), message("m2", "second")]);
    expect(port.saved.get(id)).toEqual([message("m1", "first, edited"), message("m2", "second")]);
    expect(port.saveAttempts()).toBe(3);
    expect(port.attemptedIds()).toEqual(["m1", "m2", "m1"]);
  });

  test("writing to a missing conversation is a 404 and records nothing durable", async () => {
    const seen: string[] = [];
    const port = createFakeAssistantChatsPort({ onSaveMessage: (cid) => seen.push(cid) });
    await expect(port.saveMessage("gone", message("m1", "x"))).rejects.toMatchObject({ status: 404 });
    expect(seen).toEqual([]);
    expect(port.saved.size).toBe(0);
    expect(await port.loadMessages("gone")).toEqual([]);
    expect(port.saveAttempts()).toBe(1);
  });

  test("a throwing save hook leaves durable state untouched", async () => {
    const port = createFakeAssistantChatsPort({ onSaveMessage: (_cid, _m, attempt) => { if (attempt === 1) throw new Error("503"); } });
    const { id } = await port.createConversation();
    await expect(port.saveMessage(id, message("m1", "x"))).rejects.toThrow("503");
    expect(await port.loadMessages(id)).toEqual([]);
    expect((await port.listConversations())[0]!.messageCount).toBe(0);
    await port.saveMessage(id, message("m1", "x"));
    expect((await port.listConversations())[0]!.messageCount).toBe(1);
  });

  test("rename marks the title manual on the right conversation only; ids follow creation order", async () => {
    const port = createFakeAssistantChatsPort();
    const a = await port.createConversation();
    const b = await port.createConversation();
    expect([a.id, b.id]).toEqual(["fake-1", "fake-2"]);
    await port.renameConversation("fake-1", "Renamed");
    const rows = await port.listConversations();
    expect(rows.find(c => c.id === "fake-1")).toMatchObject({ title: "Renamed", titleSource: "manual" });
    expect(rows.find(c => c.id === "fake-2")).toMatchObject({ title: null, titleSource: "fallback" });
    await port.deleteConversation("fake-1");
    expect((await port.listConversations()).map(c => c.id)).toEqual(["fake-2"]);
  });
});

describe("createAssistantLastConversationStore", () => {
  test("is scoped per workspace and principal, so another admin on this browser never reopens it", () => {
    window.localStorage.clear();
    const a = createAssistantLastConversationStore({ principalId: "admin-a" });
    const b = createAssistantLastConversationStore({ principalId: "admin-b" });
    a.write("conv-a");
    expect(a.read()).toBe("conv-a");
    expect(b.read()).toBeNull();
    expect(window.localStorage.getItem("jini.chat.last-conversation.v1.workspace-local%3Aadmin-a")).toBe(JSON.stringify({ v: 1, id: "conv-a" }));
    a.clear();
    expect(a.read()).toBeNull();
  });
});
