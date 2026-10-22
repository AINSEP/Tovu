import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, type AssistantRuntimePreferences } from "../assistant-runtime-preferences";
import { useAssistantRuntimePreferences, type AssistantRuntimePreferencesPort } from "../hooks/use-assistant-runtime-preferences.hooks";

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
    const { result } = renderHook(() => useAssistantRuntimePreferences({ port }));
    expect(result.current.preferences.replyLength).toBe("normal");
    await waitFor(() => expect(result.current.preferences.replyLength).toBe("detailed"));
    const previous = result.current.preferences;
    act(() => result.current.update({ replyLength: "short" }));
    expect(result.current.preferences).toEqual({ ...previous, replyLength: "short" });
    expect(port.save).toHaveBeenCalledWith({ previous, next: { ...previous, replyLength: "short" } }, {});
  });

  it("keeps the optimistic reply until stored reply length agrees, then accepts external changes", async () => {
    const { port, refresh } = fakePort();
    // Simulate a successful save whose effective read is briefly stale.
    port.save = vi.fn(async () => {});
    const { result } = renderHook(() => useAssistantRuntimePreferences({ port }));
    await act(async () => {});
    await act(async () => result.current.update({ replyLength: "short" }));
    await act(async () => refresh({ replyLength: "normal" }));
    expect(result.current.preferences.replyLength).toBe("short");
    await act(async () => refresh({ replyLength: "short" }));
    await act(async () => {});
    act(() => refresh({ replyLength: "detailed" }));
    await waitFor(() => expect(result.current.preferences.replyLength).toBe("detailed"));
  });

  it("diffs a rapid Short-to-Normal reversal against the last requested value", async () => {
    const { port } = fakePort();
    const pending: (() => void)[] = [];
    port.save = vi.fn(() => new Promise<void>(resolve => pending.push(resolve)));
    const { result } = renderHook(() => useAssistantRuntimePreferences({ port }));
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
    const { result } = renderHook(() => useAssistantRuntimePreferences({ port }));
    await act(async () => {});
    await act(async () => result.current.update({ replyLength: "short" }));
    expect(result.current.preferences.replyLength).toBe("short");
    expect(result.current.saveFailed).toBe(true);
  });
});
