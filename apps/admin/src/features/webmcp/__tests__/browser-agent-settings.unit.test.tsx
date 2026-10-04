import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserAgentSettingsPanel } from "../BrowserAgentSettingsPanel";
import { WEBMCP_PREFERENCE_KEY, useBrowserAgentSettings, setBrowserAgentEnabled, type BrowserAgentSettingsPort } from "../browser-agent-settings.hooks";
import { WEBMCP_DICT, WEBMCP_KEYS } from "../webmcp-i18n";
import { ADMIN_LOCALES } from "../../../lib/settings-tabs";

afterEach(() => { act(() => setBrowserAgentEnabled({ enabled: true })); localStorage.clear(); });

describe("browser-agent opt-out", () => {
  it("can be driven through an injected preference port", () => {
    let enabled = false;
    const listeners = new Set<() => void>();
    const port: BrowserAgentSettingsPort = {
      getEnabled: () => enabled,
      setEnabled: (required) => { enabled = required.enabled; for (const listener of listeners) listener(); },
      subscribe: ({ listener }) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    const view = renderHook(() => useBrowserAgentSettings({ port }));
    expect(view.result.current.enabled).toBe(false);
    act(() => view.result.current.setEnabled({ enabled: true }));
    expect(view.result.current.enabled).toBe(true);
    view.unmount();
    expect(listeners.size).toBe(0);
  });

  it("defaults on, updates all mounts immediately and persists across remount", () => {
    localStorage.clear();
    const first = renderHook(() => useBrowserAgentSettings());
    const second = renderHook(() => useBrowserAgentSettings());
    expect(first.result.current.enabled).toBe(true);
    act(() => first.result.current.setEnabled({ enabled: false }));
    expect(second.result.current.enabled).toBe(false);
    expect(localStorage.getItem(WEBMCP_PREFERENCE_KEY)).toBe("false");
    first.unmount(); second.unmount();
    const again = renderHook(() => useBrowserAgentSettings());
    expect(again.result.current.enabled).toBe(false);
  });

  it("responds to another tab opting out and to storage being cleared", () => {
    const view = renderHook(() => useBrowserAgentSettings());
    act(() => {
      localStorage.setItem(WEBMCP_PREFERENCE_KEY, "false");
      window.dispatchEvent(new StorageEvent("storage", { key: WEBMCP_PREFERENCE_KEY }));
    });
    expect(view.result.current.enabled).toBe(false);
    act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent("storage", { key: null })); });
    expect(view.result.current.enabled).toBe(true);
  });

  it("renders a working human-only opt-out with honest browser scope", async () => {
    render(<BrowserAgentSettingsPanel locale="en" />);
    const toggle = screen.getByRole("checkbox", { name: "Browser-agent access (WebMCP)" });
    expect(toggle).toBeChecked();
    expect(toggle).not.toHaveAttribute("data-agent-element");
    expect(screen.getByText(/this browser/)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem(WEBMCP_PREFERENCE_KEY)).toBe("false");
  });

  it("retains a session-only opt-out when browser storage is blocked", () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      const view = renderHook(() => useBrowserAgentSettings());
      expect(view.result.current.enabled).toBe(true);
      act(() => view.result.current.setEnabled({ enabled: false }));
      expect(view.result.current.enabled).toBe(false);
    } finally { read.mockRestore(); write.mockRestore(); }
  });

  it("supplies all new UI and confirmation strings in every admin locale", () => {
    for (const { code } of ADMIN_LOCALES) {
      for (const key of WEBMCP_KEYS) expect(WEBMCP_DICT[code]?.[key], `${code}: ${key}`).toBeTruthy();
    }
  });
});
