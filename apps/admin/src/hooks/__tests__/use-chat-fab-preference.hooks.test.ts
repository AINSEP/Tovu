import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  resolveAdminLayoutClassName,
  useChatFabHideWhileOpen,
  type ChatFabPreferencePort,
} from "../use-chat-fab-preference.hooks";

/**
 * @file Settings → User Interface's "Hide the chat button while the chat is open", read live by the
 * admin shell. Driven through a fake port (no module mocks): the stored value, a refresh that
 * re-reads it, and a failed read.
 */

function createFakePort(initial: boolean | Error) {
  let stored = initial;
  const listeners = new Set<() => void>();
  const port: ChatFabPreferencePort = {
    loadHideChatFabWhileOpen: () => (stored instanceof Error ? Promise.reject(stored) : Promise.resolve(stored)),
    subscribeToSettingsRefresh: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    store: (next: boolean | Error) => {
      stored = next;
    },
    refresh: () => listeners.forEach((listener) => listener()),
    listenerCount: () => listeners.size,
  };
}

describe("useChatFabHideWhileOpen", () => {
  it("hides by default before the stored value arrives", () => {
    const fake = createFakePort(false);
    const { result } = renderHook(() => useChatFabHideWhileOpen(fake.port));
    expect(result.current).toBe(true);
  });

  it("follows the stored value once loaded", async () => {
    const fake = createFakePort(false);
    const { result } = renderHook(() => useChatFabHideWhileOpen(fake.port));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("re-reads on a settings refresh, so flipping the toggle needs no reload", async () => {
    const fake = createFakePort(true);
    const { result } = renderHook(() => useChatFabHideWhileOpen(fake.port));
    await waitFor(() => expect(result.current).toBe(true));
    fake.store(false);
    act(() => fake.refresh());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("keeps the last value when a read fails", async () => {
    const fake = createFakePort(false);
    const { result } = renderHook(() => useChatFabHideWhileOpen(fake.port));
    await waitFor(() => expect(result.current).toBe(false));
    fake.store(new Error("HTTP 503"));
    act(() => fake.refresh());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBe(false);
  });

  it("unsubscribes on unmount", async () => {
    const fake = createFakePort(true);
    const { unmount } = renderHook(() => useChatFabHideWhileOpen(fake.port));
    expect(fake.listenerCount()).toBe(1);
    unmount();
    expect(fake.listenerCount()).toBe(0);
  });
});

describe("resolveAdminLayoutClassName", () => {
  it("adds the class the hide-while-open CSS rules are gated on only while the setting is on", () => {
    expect(resolveAdminLayoutClassName(true)).toBe("admin-layout hides-fab-while-open");
    expect(resolveAdminLayoutClassName(false)).toBe("admin-layout");
  });
});
