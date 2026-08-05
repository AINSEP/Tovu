import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@jini-ai/chat/core";

import {
  createConversation,
  deleteConversation,
  HttpError,
  listConversations,
  loadMessages,
  persistableMessages,
  renameConversation,
  saveMessage,
} from "../assistant-chats";

/**
 * @file `assistant-chats.ts` — the browser client for `/api/assistant/chats` (durable transcripts).
 * 70% before this pass.
 */

function jsonResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), { status, statusText, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpError", () => {
  it("carries the status code separately from the rendered message", () => {
    const error = new HttpError(503, "Service Unavailable");
    expect(error.status).toBe(503);
    expect(error.message).toBe("503 Service Unavailable");
    expect(error.name).toBe("HttpError");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("listConversations", () => {
  it("returns the parsed conversations list on success", async () => {
    const conversations = [{ id: "c1", title: "Chat one", titleSource: "generated" as const, messageCount: 3, createdAt: 1, updatedAt: 2 }];
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ conversations }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listConversations()).resolves.toEqual(conversations);
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/chats", { credentials: "same-origin" });
  });

  it("coerces a missing/non-array conversations field to [] rather than propagating undefined", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listConversations()).resolves.toEqual([]);
  });

  it("throws HttpError with the response's status/statusText on a non-ok response", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500, "Internal Server Error"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listConversations()).rejects.toMatchObject({ status: 500, message: "500 Internal Server Error" });
  });
});

describe("createConversation", () => {
  it("posts an empty body when no firstMessage is given", async () => {
    const conversation = { id: "c1", title: null, titleSource: "fallback" as const, messageCount: 0, createdAt: 1, updatedAt: 1 };
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ conversation }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createConversation()).resolves.toEqual(conversation);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("posts { firstMessage } when given, to seed the local title heuristic", async () => {
    const conversation = { id: "c1", title: null, titleSource: "fallback" as const, messageCount: 0, createdAt: 1, updatedAt: 1 };
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ conversation }));
    vi.stubGlobal("fetch", fetchMock);

    await createConversation("hello there");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/assistant/chats");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ firstMessage: "hello there" });
  });
});

describe("renameConversation", () => {
  it("PATCHes the title to the conversation's own URL, id encoded", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await renameConversation("c/1", "New title");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/assistant/chats/c%2F1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "New title" });
  });

  it("throws HttpError on a non-ok response", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404, "Not Found"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(renameConversation("c1", "x")).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteConversation", () => {
  it("DELETEs the conversation's own URL, id encoded", async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, statusText: "No Content" }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteConversation("c/1");

    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/chats/c%2F1", { method: "DELETE", credentials: "same-origin" });
  });

  it("throws HttpError on a non-ok response", async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: "Forbidden" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteConversation("c1")).rejects.toMatchObject({ status: 403, message: "403 Forbidden" });
  });
});

describe("loadMessages", () => {
  it("returns the parsed messages on success", async () => {
    const messages: ChatMessage[] = [{ id: "m1", role: "user", content: "hi" }];
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ messages }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMessages("c1")).resolves.toEqual(messages);
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/chats/c1/messages", { credentials: "same-origin" });
  });

  it("coerces a missing/non-array messages field to [] rather than propagating undefined", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMessages("c1")).resolves.toEqual([]);
  });
});

describe("saveMessage", () => {
  it("PUTs the message to its own URL, both conversation id and message id encoded", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const message: ChatMessage = { id: "m/1", role: "assistant", content: "hello", runStatus: "succeeded" };

    await saveMessage("c/1", message);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/assistant/chats/c%2F1/messages/m%2F1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(message);
  });

  it("throws HttpError on a non-ok response", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 409, "Conflict"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveMessage("c1", { id: "m1", role: "user", content: "x" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("persistableMessages", () => {
  it("keeps every user message regardless of runStatus", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "user", content: "still typing", runStatus: "running" },
    ];
    expect(persistableMessages(messages)).toEqual(messages);
  });

  it("keeps assistant messages only once their run has reached a terminal status", () => {
    const running: ChatMessage = { id: "1", role: "assistant", content: "...", runStatus: "running" };
    const queued: ChatMessage = { id: "2", role: "assistant", content: "", runStatus: "queued" };
    const noStatus: ChatMessage = { id: "3", role: "assistant", content: "old message, no runId" };
    const succeeded: ChatMessage = { id: "4", role: "assistant", content: "done", runStatus: "succeeded" };
    const failed: ChatMessage = { id: "5", role: "assistant", content: "sorry", runStatus: "failed" };
    const canceled: ChatMessage = { id: "6", role: "assistant", content: "", runStatus: "canceled" };

    expect(persistableMessages([running, queued, noStatus, succeeded, failed, canceled])).toEqual([succeeded, failed, canceled]);
  });
});
