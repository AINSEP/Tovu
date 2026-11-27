import { lookupOwnedConversation, useConversationLinkBuilder } from "../use-conversation-deep-link";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useApplyConversationDeepLink, CONVERSATION_GONE_KEY } from "@jini-ai/admin/shell/hooks/use-conversation-deep-link";

/**
 * @file The dock's `?conversation=` link: it may only SELECT an existing, owner-visible conversation.
 * Fakes are the ports (list lookup, select, URL rewrite, notice, dock open); the hook is the real one.
 */
function setup({ search = "conversation=c-1&tab=chat", found = true as boolean | Error, principalId = "owner" } = {}) {
  const chats = { select: vi.fn() };
  const ports = {
    lookupConversation: vi.fn(async () => { if (found instanceof Error) throw found; return found; }),
    replaceQuery: vi.fn(), notify: vi.fn(), openDock: vi.fn(),
  };
  const props = (query: string | null, principal = principalId) => ({ query: query === null ? null : new URLSearchParams(query), chats, principalId: principal, ...ports });
  const view = renderHook((p: ReturnType<typeof props>) => useApplyConversationDeepLink(p), { initialProps: props(search) });
  return { chats, ports, props, ...view };
}

describe("useApplyConversationDeepLink", () => {
  it("conversation deep link selects it without starting a run", async () => {
    const { chats, ports } = setup();
    await waitFor(() => expect(chats.select).toHaveBeenCalledTimes(1));
    expect(chats.select).toHaveBeenCalledWith({ id: "c-1" }, {});
    expect(ports.openDock).toHaveBeenCalledTimes(1);
    expect(ports.notify).not.toHaveBeenCalled();
    expect(ports.replaceQuery).not.toHaveBeenCalled();
  });

  it("deep link after reload selects the authorized conversation", async () => {
    const first = setup();
    await waitFor(() => expect(first.chats.select).toHaveBeenCalledTimes(1));
    first.unmount();
    const reloaded = setup();
    await waitFor(() => expect(reloaded.chats.select).toHaveBeenCalledWith({ id: "c-1" }, {}));
    expect(reloaded.ports.lookupConversation).toHaveBeenCalledWith({ id: "c-1" });
  });

  it("missing or inaccessible conversation shows a notice and launches nothing", async () => {
    const { chats, ports } = setup({ found: false });
    await waitFor(() => expect(ports.notify).toHaveBeenCalledWith({ key: CONVERSATION_GONE_KEY }));
    expect(chats.select).not.toHaveBeenCalled();
    expect(ports.openDock).not.toHaveBeenCalled();
    const next = (ports.replaceQuery.mock.calls[0] as unknown as [{ query: URLSearchParams }])[0].query;
    expect(next.has("conversation")).toBe(false);
    expect(next.get("tab")).toBe("chat");
  });

  it("a transient fetch error is not treated as absence", async () => {
    const { chats, ports } = setup({ found: new Error("offline") });
    await waitFor(() => expect(ports.lookupConversation).toHaveBeenCalled());
    await Promise.resolve();
    expect(ports.notify).not.toHaveBeenCalled();
    expect(ports.replaceQuery).not.toHaveBeenCalled();
    expect(chats.select).not.toHaveBeenCalled();
  });

  it("ignores unrelated query keys, a null query and a missing principal", async () => {
    const unrelated = setup({ search: "tab=chat&other=1" });
    const none = setup({ search: "" });
    const noPrincipal = setup({ principalId: "" });
    await Promise.resolve();
    for (const run of [unrelated, none, noPrincipal]) expect(run.ports.lookupConversation).not.toHaveBeenCalled();
  });

  it("a lookup that resolves after the link changed is discarded", async () => {
    const chats = { select: vi.fn() };
    let release: (value: boolean) => void = () => undefined;
    const lookupConversation = vi.fn(({ id }: { id: string }) => (id === "c-1" ? new Promise<boolean>((resolve) => { release = resolve; }) : Promise.resolve(true)));
    const base = { chats, principalId: "owner", lookupConversation, replaceQuery: vi.fn(), notify: vi.fn(), openDock: vi.fn() };
    const view = renderHook((p: typeof base & { query: URLSearchParams }) => useApplyConversationDeepLink(p), { initialProps: { ...base, query: new URLSearchParams("conversation=c-1") } });
    view.rerender({ ...base, query: new URLSearchParams("conversation=c-2") });
    await waitFor(() => expect(chats.select).toHaveBeenCalledWith({ id: "c-2" }, {}));
    release(true);
    await Promise.resolve();
    expect(chats.select).toHaveBeenCalledTimes(1);
  });
});

it("encodes a conversation id as a single query value in the assistant link", () => {
  const { result } = renderHook(() => useConversationLinkBuilder());
  const href = result.current.hrefFor({ conversationId: "work/7?x=1&tab=chat" });
  expect(href).toBe("/ai-assistant?conversation=work%2F7%3Fx%3D1%26tab%3Dchat");
});

it("admits only ids present in the signed-in conversation list", async () => {
  const list = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== "/api/assistant/chats" || init?.method !== "GET") {
      return Response.json({ error: "Unexpected conversation request" }, { status: 404 });
    }
    return Response.json({ conversations: [{ id: "work-17-archive" }, { id: "work-22" }] });
  });
  vi.stubGlobal("fetch", list);
  try {
    await expect(lookupOwnedConversation({ id: "work-22" })).resolves.toBe(true);
    await expect(lookupOwnedConversation({ id: "work-17" })).resolves.toBe(false);
    expect(list).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
