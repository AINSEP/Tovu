import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { InterfaceConfig } from "../../lib/settings-tabs";
import {
  resolveAdminLayoutClassName,
  useInterfacePreferences,
  type InterfacePreferencesPort,
} from "../use-interface-preferences.hooks";

/**
 * @file Settings → User Interface's preferences ("Hide the chat button while the chat is open",
 * "Wrap tabs instead of scrolling"), read live by the admin shell. Driven through a fake port (no
 * module mocks): the stored values, a refresh that re-reads them, and a failed read.
 */

const SHOW_FAB: InterfaceConfig = { hideChatFabWhileOpen: false, wrapTabs: false };
const HIDE_FAB: InterfaceConfig = { hideChatFabWhileOpen: true, wrapTabs: false };

function createFakePort(initial: InterfaceConfig | Error) {
  let stored = initial;
  const listeners = new Set<() => void>();
  const port: InterfacePreferencesPort = {
    loadInterface: () => (stored instanceof Error ? Promise.reject(stored) : Promise.resolve(stored)),
    subscribeToSettingsRefresh: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    store: (next: InterfaceConfig | Error) => {
      stored = next;
    },
    refresh: () => listeners.forEach((listener) => listener()),
    listenerCount: () => listeners.size,
  };
}

describe("useInterfacePreferences", () => {
  it("hides the FAB and scrolls tabs by default before the stored values arrive", () => {
    const fake = createFakePort({ hideChatFabWhileOpen: false, wrapTabs: true });
    const { result } = renderHook(() => useInterfacePreferences(fake.port));
    expect(result.current).toEqual({ hideChatFabWhileOpen: true, wrapTabs: false });
  });

  it("follows the stored values once loaded", async () => {
    const fake = createFakePort({ hideChatFabWhileOpen: false, wrapTabs: true });
    const { result } = renderHook(() => useInterfacePreferences(fake.port));
    await waitFor(() => expect(result.current).toEqual({ hideChatFabWhileOpen: false, wrapTabs: true }));
  });

  it("re-reads on a settings refresh, so flipping a toggle needs no reload", async () => {
    const fake = createFakePort(HIDE_FAB);
    const { result } = renderHook(() => useInterfacePreferences(fake.port));
    await waitFor(() => expect(result.current).toEqual(HIDE_FAB));
    fake.store({ hideChatFabWhileOpen: true, wrapTabs: true });
    act(() => fake.refresh());
    await waitFor(() => expect(result.current).toEqual({ hideChatFabWhileOpen: true, wrapTabs: true }));
  });

  it("keeps the last values when a read fails", async () => {
    const fake = createFakePort(SHOW_FAB);
    const { result } = renderHook(() => useInterfacePreferences(fake.port));
    await waitFor(() => expect(result.current).toEqual(SHOW_FAB));
    fake.store(new Error("HTTP 503"));
    act(() => fake.refresh());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toEqual(SHOW_FAB);
  });

  it("unsubscribes on unmount", async () => {
    const fake = createFakePort(HIDE_FAB);
    const { unmount } = renderHook(() => useInterfacePreferences(fake.port));
    expect(fake.listenerCount()).toBe(1);
    unmount();
    expect(fake.listenerCount()).toBe(0);
  });
});

describe("resolveAdminLayoutClassName", () => {
  it("adds the class the hide-while-open CSS rules are gated on only while the setting is on", () => {
    expect(resolveAdminLayoutClassName(HIDE_FAB)).toBe("admin-layout hides-fab-while-open");
    expect(resolveAdminLayoutClassName(SHOW_FAB)).toBe("admin-layout");
  });

  it("adds the class the tab-wrapping CSS rules are gated on only while that setting is on", () => {
    expect(resolveAdminLayoutClassName({ hideChatFabWhileOpen: false, wrapTabs: true })).toBe("admin-layout wraps-tabs");
    expect(resolveAdminLayoutClassName({ hideChatFabWhileOpen: true, wrapTabs: true })).toBe(
      "admin-layout hides-fab-while-open wraps-tabs",
    );
  });
});
