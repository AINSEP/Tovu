// @vitest-environment jsdom
/**
 * @file The host's one locale hook, end to end through its real bindings (P12 #6.T): the live port
 * (settings read + namespace-filtered refresh bus), the boot scope, the admin fetch-query provider
 * and the English fallback. Named mutations: `drop-english-fallback` (host binding),
 * `drop-settings-event-forward` (`lib/settings-events.ts`), `skip-language-invalidation` (Jini hook).
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminBootScopeContext } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import { resetSettingsRefreshBus } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { dropInFlightSettingsReads } from "@jini-ai/admin/shell/lib/settings-effective-reads";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useHostAdminLocale } from "../admin-locale-dependencies.hooks";
import { subscribeToSettingsChanges } from "../../lib/settings-events";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSettingsRefreshBus();
  dropInFlightSettingsReads({ namespaces: null });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <FetchQueryProvider>
    <AdminBootScopeContext.Provider value={{ principalId: "owner", checking: false }}>{children}</AdminBootScopeContext.Provider>
  </FetchQueryProvider>
);

const localeBody = (locale: string) => new Response(JSON.stringify({ data: [{ key: "locale", value: locale }] }), {
  status: 200, headers: { "content-type": "application/json" },
});

/** Each language read waits for the test to answer it; reads are recorded by URL. */
function scriptedFetch() {
  const answers: Array<(response: Response) => void> = [];
  const urls: string[] = [];
  const fetchMock = vi.fn((url: string) => {
    urls.push(String(url));
    return new Promise<Response>((resolve) => answers.push(resolve));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, answers, urls };
}

/** A minimal EventSource installed as the global, as the settings feed's own suite does. */
function fakeEventSource() {
  const listeners = new Map<string, Array<(event: { data?: string; lastEventId?: string }) => void>>();
  const source = {
    emit: (type: string, data: string) => { for (const handler of listeners.get(type) ?? []) handler({ data, lastEventId: "" }); },
  };
  class FakeEventSource {
    static CLOSED = 2;
    readyState = 1;
    addEventListener(type: string, handler: (event: { data?: string }) => void): void {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    }
    close(): void {}
  }
  vi.stubGlobal("EventSource", FakeEventSource);
  return source;
}

describe("useHostAdminLocale", () => {
  it("English fallback: a rejected initial read renders 'en' through the host hook", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "forbidden", code: "FORBIDDEN" }), {
      status: 403, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useHostAdminLocale({}, {}), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    // drop-english-fallback: the host binding's fallback would not render here.
    expect(result.current).toBe("en");
  });

  it("SSE refresh: an unrelated namespace frame reads nothing; a core.language frame changes the locale", async () => {
    const { fetchMock, answers } = scriptedFetch();
    const source = fakeEventSource();
    const stop = subscribeToSettingsChanges({ workspaceId: "ws" });
    const { result } = renderHook(() => useHostAdminLocale({}, {}), { wrapper });
    const languageReads = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("core.language")).length;
    await waitFor(() => expect(languageReads()).toBe(1));
    await act(async () => { answers.shift()?.(localeBody("en")); });
    await waitFor(() => expect(result.current).toBe("en"));

    act(() => source.emit("settings-changed", JSON.stringify({ namespaces: ["seo"] })));
    await act(async () => {});
    expect(languageReads()).toBe(1);

    // drop-settings-event-forward: without the feed's republish no second read starts.
    act(() => source.emit("settings-changed", JSON.stringify({ namespaces: ["core.language"] })));
    await waitFor(() => expect(languageReads()).toBe(2));
    await act(async () => { answers.shift()?.(localeBody("fr")); });
    await waitFor(() => expect(result.current).toBe("fr"));
    stop();
  });

  it("reverse-order refresh: the second refresh's read wins when the first settles last", async () => {
    const { answers, urls } = scriptedFetch();
    const source = fakeEventSource();
    const stop = subscribeToSettingsChanges({ workspaceId: "ws" });
    const { result } = renderHook(() => useHostAdminLocale({}, {}), { wrapper });
    await waitFor(() => expect(urls).toHaveLength(1));
    await act(async () => { answers[0]?.(localeBody("en")); });
    await waitFor(() => expect(result.current).toBe("en"));

    // skip-language-invalidation: neither refresh would start a read.
    act(() => source.emit("settings-changed", JSON.stringify({ namespaces: ["core.language"] })));
    await waitFor(() => expect(urls).toHaveLength(2));
    act(() => source.emit("settings-changed", JSON.stringify({ namespaces: ["core.language"] })));
    await waitFor(() => expect(urls).toHaveLength(3));
    await act(async () => { answers[2]?.(localeBody("ja")); });
    await act(async () => { answers[1]?.(localeBody("fr")); });
    await waitFor(() => expect(result.current).toBe("ja"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(result.current).toBe("ja");
    stop();
  });
});
