import { act, cleanup, render, renderHook, screen, waitFor } from "@/__tests__/render-with-jini-kits";
import { afterEach, expect, it, vi } from "vitest";
import type { ChatMessage } from "@jini-ai/chat/core";
import { FetchQueryProvider } from "./fetch-query-provider.test-helper";
import { AdminBootScopeContext } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import { useAdminLocale as useBareAdminLocale } from "@jini-ai/admin/shell/hooks/use-admin-locale.hooks";
import type { AdminLocalePort } from "@jini-ai/admin/shell/hooks/admin-locale-port.hooks";
import { useAdminBootScope } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { createFakeAdminLocalePort } from "../hooks/admin-locale-dependencies.hooks";
import { useMessagesChangeHandler } from "../components/AssistantDock/hooks/messages-change.hooks";
import { subscribeToSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { subscribeToContentRefresh } from "@jini-ai/admin/shell/lib/content-refresh-bus";

afterEach(cleanup);

/** The bare Jini hook with an explicit port and the host's binding shape (key prefix, fallback). */
function useAdminLocale(port: AdminLocalePort): string {
  return useBareAdminLocale({ port, useBootScope: useAdminBootScope, useFetchQuery, useInvalidate, queryPrefix: ["settings", "core.language"], fallbackLocale: "en" });
}

it("scope switch: principal B's locale stays visible when A's slower read settles after B's", async () => {
  // One port captured at mount (as the hook does); each read waits for the test, in call order.
  const reads: Array<(locale: string) => void> = [];
  const port: AdminLocalePort = {
    loadLanguage: () => new Promise<string>((resolve) => { reads.push(resolve); }),
    subscribeToSettingsRefresh: () => () => {},
  };
  function Reader() {
    return <span>{useAdminLocale(port)}</span>;
  }
  // One reader that survives the principal switch, as a shell does: only the scope changes.
  function Tree({ principal }: { principal: string }) {
    return <FetchQueryProvider><AdminBootScopeContext.Provider value={{ principalId: principal, checking: false }}>
      <Reader />
    </AdminBootScopeContext.Provider></FetchQueryProvider>;
  }
  const { rerender } = render(<Tree principal="a" />);
  await waitFor(() => expect(reads).toHaveLength(1));
  rerender(<Tree principal="b" />);
  // omit-query-scope: one shared key would not start B's read.
  await waitFor(() => expect(reads).toHaveLength(2));
  await act(async () => { reads[1]!("de"); });
  await act(async () => { reads[0]!("fr"); });
  await waitFor(() => expect(screen.getByText("de")).toBeTruthy());
  expect(screen.queryByText("fr")).toBeNull();
});

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
  act(() => ownerB.publishLocaleChange({ next: "es" }));
  await screen.findByText("es");
  expect(readB).toHaveBeenCalledTimes(2);
});

it("ignores restored history and conversation switches, but announces live runs and retries", async () => {
  const settings = vi.fn();
  const content = vi.fn();
  const stopSettings = subscribeToSettingsRefresh(settings);
  const stopContent = subscribeToContentRefresh({ listener: content });
  const history: ChatMessage[] = [{ id: "old", role: "assistant", content: "Saved reply", runStatus: "succeeded", events: [
    { kind: "tool_result", toolUseId: "saved-tool", content: "ok", isError: false },
  ] }];
  const onMessagesChange = vi.fn();
  try {
    const { result, rerender } = renderHook(({ paneKey, initialMessages }) => useMessagesChangeHandler({ chats: {
      paneKey, initialMessages, onMessagesChange,
    } }), { initialProps: { paneKey: "saved", initialMessages: history } });
    act(() => result.current(history));
    expect(onMessagesChange).toHaveBeenCalledWith({ messages: history });
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
