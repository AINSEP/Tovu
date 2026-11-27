import { publishSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { assistantRuntimePreferencesPort } from "../assistant-runtime-preferences.adapter";
import { settingsApi } from "@/lib/admin-http/settings-api";
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, type AssistantRuntimePreferences } from "@jini-ai/admin/shell/components/AssistantDock/assistant-runtime-preferences";
import { CHAT_DISPLAY_NAMESPACE } from "@jini-ai/admin/shell/components/AssistantDock/chat-display-preferences";
import { useAssistantRuntimePreferences, type AssistantRuntimePreferencesPort } from "@jini-ai/admin/shell/components/AssistantDock/hooks/use-assistant-runtime-preferences.hooks";

/** The runtime hook's existing port: no HTTP or daemon process is involved. */
function fakePort() {
  let stored: AssistantRuntimePreferences = { ...DEFAULT_ASSISTANT_RUNTIME_PREFERENCES };
  const listeners = new Set<() => void>();
  const port: AssistantRuntimePreferencesPort = {
    load: vi.fn(async () => ({ ...stored })),
    save: vi.fn(async ({ next }) => { stored = { ...next }; }),
    subscribe: ({ listener }) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return { port, refresh: (patch: Partial<AssistantRuntimePreferences>) => {
    stored = { ...stored, ...patch };
    listeners.forEach(listener => listener());
  } };
}

describe("reply length through the runtime preferences hook", () => {
  it("defaults to Normal, loads stored Detailed, and applies and saves Short immediately", async () => {
    const { port, refresh } = fakePort();
    refresh({ replyLength: "detailed", preferSubagents: false });
    const { result } = renderHook(() => useAssistantRuntimePreferences({ port, namespace: CHAT_DISPLAY_NAMESPACE, defaults: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, useFetchQuery, useInvalidate }));
    expect(result.current.preferences.replyLength).toBe("normal");
    await waitFor(() => expect(result.current.preferences.replyLength).toBe("detailed"));
    const previous = result.current.preferences;
    act(() => result.current.update({ replyLength: "short" }));
    expect(result.current.preferences).toEqual({ ...previous, replyLength: "short" });
    expect(port.save).toHaveBeenCalledWith({ previous, next: { ...previous, replyLength: "short" } }, {});
  });

  it("keeps the optimistic reply until stored reply length agrees, then accepts external changes", async () => {
    vi.useFakeTimers();
    const { port, refresh } = fakePort();
    // Simulate a successful save whose effective read is briefly stale.
    port.save = vi.fn(async () => {});
    const { result, unmount } = renderHook(() => useAssistantRuntimePreferences({ port, namespace: CHAT_DISPLAY_NAMESPACE, defaults: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, useFetchQuery, useInvalidate }));
    // TanStack batches query notifications on timers. Empty act() calls can let the Detailed
    // refresh overtake the Short acknowledgement, so the hook never sees stored values agree.
    const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
    try {
      await flush();
      act(() => result.current.update({ replyLength: "short" }));
      await flush();
      act(() => refresh({ replyLength: "normal" }));
      await flush();
      expect(result.current.preferences.replyLength).toBe("short");
      act(() => refresh({ replyLength: "short" }));
      await flush();
      act(() => refresh({ replyLength: "detailed" }));
      await flush();
      expect(result.current.preferences.replyLength).toBe("detailed");
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("diffs a rapid Short-to-Normal reversal against the last requested value", async () => {
    const { port } = fakePort();
    const pending: (() => void)[] = [];
    port.save = vi.fn(() => new Promise<void>(resolve => pending.push(resolve)));
    const { result } = renderHook(() => useAssistantRuntimePreferences({ port, namespace: CHAT_DISPLAY_NAMESPACE, defaults: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, useFetchQuery, useInvalidate }));
    await act(async () => {});
    act(() => {
      result.current.update({ replyLength: "short" });
      result.current.update({ replyLength: "normal" });
    });
    const normal = DEFAULT_ASSISTANT_RUNTIME_PREFERENCES;
    const short = { ...normal, replyLength: "short" };
    expect(port.save).toHaveBeenNthCalledWith(1, { previous: normal, next: short }, {});
    expect(port.save).toHaveBeenNthCalledWith(2, { previous: short, next: normal }, {});
    await act(async () => pending.forEach(resolve => resolve()));
    expect(result.current.preferences.replyLength).toBe("normal");
  });

  it("keeps the chosen length for the session and reports save failures", async () => {
    const { port } = fakePort();
    port.save = vi.fn(async () => { throw new Error("write failed"); });
    const { result } = renderHook(() => useAssistantRuntimePreferences({ port, namespace: CHAT_DISPLAY_NAMESPACE, defaults: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, useFetchQuery, useInvalidate }));
    await act(async () => {});
    await act(async () => result.current.update({ replyLength: "short" }));
    expect(result.current.preferences.replyLength).toBe("short");
    expect(result.current.saveFailed).toBe(true);
  });
});

it("writes only changed runtime preferences at user scope and reads them back", async () => {
  const stored = new Map<string, unknown>([["replyLength", "detailed"], ["preferSubagents", false], ["useClaudeInChrome", false]]);
  const read = vi.spyOn(settingsApi, "getSettingsEffective").mockImplementation(async ({ namespace }) => {
    if (namespace !== "core.interface") throw new Error("unexpected namespace");
    return { data: [...stored].map(([key, value]) => ({ key, value, sourceLayer: "user" as const, defVersion: 1 })) };
  });
  const write = vi.spyOn(settingsApi, "setSetting").mockImplementation(async (input) => {
    if (input.namespace !== "core.interface" || input.scope !== "user") throw new Error("unexpected settings write");
    stored.set(input.key, input.valueJson);
    return {} as Awaited<ReturnType<typeof settingsApi.setSetting>>;
  });
  try {
    const previous = { replyLength: "detailed" as const, preferSubagents: false, useClaudeInChrome: false };
    await expect(assistantRuntimePreferencesPort.load()).resolves.toEqual(previous);
    await assistantRuntimePreferencesPort.save({ previous, next: { ...previous, replyLength: "short" } });
    expect(write).toHaveBeenCalledExactlyOnceWith({ namespace: "core.interface", scope: "user", key: "replyLength", valueJson: "short" });
    await expect(assistantRuntimePreferencesPort.load()).resolves.toEqual({
      replyLength: "short", preferSubagents: false, useClaudeInChrome: false,
    });
  } finally {
    write.mockRestore();
    read.mockRestore();
  }
});

it("refreshes runtime preferences only for their namespace or an unscoped event", () => {
  const listener = vi.fn();
  const dispose = assistantRuntimePreferencesPort.subscribe({ listener });
  try {
    publishSettingsRefresh(["core.language"]);
    expect(listener).not.toHaveBeenCalled();
    publishSettingsRefresh(["core.language", "core.interface"]);
    expect(listener.mock.calls).toEqual([[]]);
    publishSettingsRefresh();
    expect(listener.mock.calls).toEqual([[], []]);
  } finally {
    dispose();
  }
  publishSettingsRefresh(["core.interface"]);
  expect(listener).toHaveBeenCalledTimes(2);
});
