import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, DEFAULT_INTERFACE, type AppearanceConfig, type InterfaceConfig } from "../../lib/settings-tabs";
import { ADMIN_THEME_STORAGE_KEY } from "../apply";
import { useAdminThemeDocument, useAdminThemePicker, type AdminThemeDocumentEnv, type AdminThemePort } from "../use-admin-theme.hooks";

/**
 * @file The admin theme hooks over a fake settings port and a detached <html> (no module mocks):
 * the shell paints only stored values and follows the OS on "system"; the page repaints on click,
 * saves through the ledger adapters, and restores the stored choice when a save fails.
 */

function fakePort(initial: { adminTheme?: string; theme?: AppearanceConfig["theme"] } = {}) {
  let iface: InterfaceConfig = { ...DEFAULT_INTERFACE, adminTheme: initial.adminTheme ?? "classic" };
  let appearance: AppearanceConfig = { ...DEFAULT_APPEARANCE, theme: initial.theme ?? "light" };
  const port: AdminThemePort = {
    loadInterface: vi.fn(() => Promise.resolve(iface)),
    loadAppearance: vi.fn(() => Promise.resolve(appearance)),
    saveInterface: vi.fn((next: InterfaceConfig) => {
      iface = next;
      return Promise.resolve(["adminTheme"]);
    }),
    saveAppearance: vi.fn((next: AppearanceConfig) => {
      appearance = next;
      return Promise.resolve(["theme"]);
    }),
  };
  return port;
}

function fakeEnv({ dark = false } = {}) {
  const listeners = new Set<() => void>();
  const media = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  const storage = { setItem: vi.fn() };
  const env = {
    root: document.createElement("html"),
    matchMedia: vi.fn(() => media),
    storage,
  } satisfies AdminThemeDocumentEnv;
  const flipOs = (next: boolean) => {
    media.matches = next;
    listeners.forEach((listener) => listener());
  };
  return { env, storage, flipOs, listenerCount: () => listeners.size };
}

describe("useAdminThemeDocument", () => {
  it("paints the stored theme and scheme once both settings load, and remembers them", async () => {
    const { env, storage } = fakeEnv();
    renderHook(() => useAdminThemeDocument({}, { port: fakePort({ adminTheme: "default", theme: "dark" }), env }));
    expect(env.root.hasAttribute("data-admin-theme")).toBe(false);
    await waitFor(() => expect(env.root.getAttribute("data-admin-theme")).toBe("default"));
    expect(env.root.getAttribute("data-color-scheme")).toBe("dark");
    expect(env.root.getAttribute("data-theme")).toBe("dark");
    expect(storage.setItem).toHaveBeenCalledWith(ADMIN_THEME_STORAGE_KEY, expect.stringContaining('"themeId":"default"'));
  });

  it("follows the OS while the scheme is system, and stops listening on unmount", async () => {
    const { env, flipOs, listenerCount } = fakeEnv({ dark: false });
    const { unmount } = renderHook(() => useAdminThemeDocument({}, { port: fakePort({ theme: "system" }), env }));
    await waitFor(() => expect(env.root.getAttribute("data-color-scheme")).toBe("light"));
    act(() => flipOs(true));
    expect(env.root.getAttribute("data-color-scheme")).toBe("dark");
    expect(env.root.getAttribute("data-theme")).toBe("dark");
    unmount();
    expect(listenerCount()).toBe(0);
  });
});

describe("useAdminThemePicker", () => {
  it("repaints at once and saves the theme id through the interface ledger", async () => {
    const port = fakePort();
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.selectTheme("default"));
    expect(env.root.getAttribute("data-admin-theme")).toBe("default");
    expect(result.current.themeId).toBe("default");
    expect(port.saveInterface).toHaveBeenCalledWith({ ...DEFAULT_INTERFACE, adminTheme: "default" }, DEFAULT_INTERFACE);
    await waitFor(() => expect(port.loadInterface).toHaveBeenCalledTimes(2));
    expect(result.current.themeId).toBe("default");
  });

  it("saves the scheme through Appearance's theme setting, leaving the accent alone", async () => {
    const port = fakePort({ adminTheme: "default" });
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.selectPreference("dark"));
    expect(env.root.getAttribute("data-color-scheme")).toBe("dark");
    expect(port.saveAppearance).toHaveBeenCalledWith({ ...DEFAULT_APPEARANCE, theme: "dark" }, DEFAULT_APPEARANCE);
    await waitFor(() => expect(result.current.preference).toBe("dark"));
  });

  it("restores the stored choice and reports the error when a save fails", async () => {
    const port = fakePort();
    port.saveInterface = vi.fn(() => Promise.reject(new Error("offline")));
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.selectTheme("default"));
    await waitFor(() => expect(result.current.error).toBe("offline"));
    expect(result.current.themeId).toBe("classic");
    expect(env.root.getAttribute("data-admin-theme")).toBe("classic");
  });

  it("ignores clicks before the settings load and re-selecting the current value", async () => {
    let release!: (value: InterfaceConfig) => void;
    const port = fakePort();
    port.loadInterface = vi.fn(() => new Promise<InterfaceConfig>((resolveLoad) => { release = resolveLoad; }));
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    act(() => result.current.selectTheme("default"));
    expect(port.saveInterface).not.toHaveBeenCalled();
    await waitFor(() => expect(port.loadInterface).toHaveBeenCalled());
    await act(async () => release(DEFAULT_INTERFACE));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.selectTheme("classic"));
    act(() => result.current.selectPreference("light"));
    expect(port.saveInterface).not.toHaveBeenCalled();
    expect(port.saveAppearance).not.toHaveBeenCalled();
    expect(env.root.hasAttribute("data-admin-theme")).toBe(false);
  });
});
