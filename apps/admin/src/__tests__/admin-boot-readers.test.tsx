import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ChatMessage } from "@jini-ai/chat/core";
import { FetchQueryProvider } from "./fetch-query-provider.test-helper";
import { AdminBootScopeContext } from "../lib/admin-boot-scope";
import { useAdminLocale } from "../hooks/use-admin-locale.hooks";
import { createFakeAdminLocalePort } from "../hooks/admin-locale-dependencies.hooks";
import { useMessagesChangeHandler } from "../components/AssistantDock/hooks/AssistantDock.hooks";
import { subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";
import { subscribeToContentRefresh } from "../lib/content-refresh-bus";

afterEach(cleanup);

it("defers boot settings, retains completed reads across remounts, and isolates another principal", async () => {
  const ownerA = createFakeAdminLocalePort({ initialLocale: "fr" });
  const ownerB = createFakeAdminLocalePort({ initialLocale: "de" });
  const readA = vi.fn(ownerA.loadLanguage);
  const readB = vi.fn(ownerB.loadLanguage);
  const portA = { ...ownerA, loadLanguage: readA };
  const portB = { ...ownerB, loadLanguage: readB };
  function Reader({ principal }: { principal: string }) {
    const locale = useAdminLocale(principal === "a" ? portA : portB);
    return <span>{locale}</span>;
  }
  function Tree({ principal, checking = false, show = true }: { principal: string; checking?: boolean; show?: boolean }) {
    return <FetchQueryProvider><AdminBootScopeContext.Provider value={{ principalId: principal, checking }}>
      {show ? <Reader key={principal} principal={principal} /> : null}
    </AdminBootScopeContext.Provider></FetchQueryProvider>;
  }
  const { rerender } = render(<Tree principal="a" checking />);
  expect(readA).not.toHaveBeenCalled();
  rerender(<Tree principal="a" />);
  await screen.findByText("fr");
  expect(readA).toHaveBeenCalledTimes(1);
  rerender(<Tree principal="a" show={false} />);
  rerender(<Tree principal="a" />);
  await screen.findByText("fr");
  expect(readA).toHaveBeenCalledTimes(1);
  rerender(<Tree principal="b" />);
  expect(screen.queryByText("fr")).not.toBeInTheDocument();
  await screen.findByText("de");
  expect(readB).toHaveBeenCalledTimes(1);
  act(() => ownerB.publishLocaleChange("es"));
  await screen.findByText("es");
  expect(readB).toHaveBeenCalledTimes(2);
});

it("ignores restored history and conversation switches, but announces live runs and retries", async () => {
  const settings = vi.fn();
  const content = vi.fn();
  const stopSettings = subscribeToSettingsRefresh(settings);
  const stopContent = subscribeToContentRefresh(content);
  const history: ChatMessage[] = [{ id: "old", role: "assistant", content: "Saved reply", runStatus: "succeeded", events: [
    { kind: "tool_result", toolUseId: "saved-tool", content: "ok", isError: false },
  ] }];
  const onMessagesChange = vi.fn();
  try {
    const { result, rerender } = renderHook(({ paneKey, initialMessages }) => useMessagesChangeHandler({ chats: {
      paneKey, initialMessages, onMessagesChange,
    } }), { initialProps: { paneKey: "saved", initialMessages: history } });
    act(() => result.current(history));
    expect(onMessagesChange).toHaveBeenCalledWith(history);
    expect(settings).not.toHaveBeenCalled();
    expect(content).not.toHaveBeenCalled();
    const next: ChatMessage[] = [...history, { id: "new", role: "assistant", content: "New reply", runStatus: "succeeded" }];
    act(() => result.current(next));
    await waitFor(() => expect(settings).toHaveBeenCalledTimes(1));
    expect(content).toHaveBeenCalledTimes(1);
    rerender({ paneKey: "another", initialMessages: history });
    act(() => result.current(history));
    expect(settings).toHaveBeenCalledTimes(1);
    expect(content).toHaveBeenCalledTimes(1);
    act(() => result.current([{ ...history[0]!, runStatus: "running", events: [] }]));
    act(() => result.current(history));
    expect(settings).toHaveBeenCalledTimes(2);
    expect(content).toHaveBeenCalledTimes(2);
  } finally { stopSettings(); stopContent(); }
});
