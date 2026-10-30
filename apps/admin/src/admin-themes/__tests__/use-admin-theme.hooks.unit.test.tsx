import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, DEFAULT_INTERFACE, type AppearanceConfig, type InterfaceConfig } from "../../lib/settings-tabs";
import { ADMIN_THEME_STORAGE_KEY, applyAdminThemeToDocument } from "../apply";
import { useAdminThemeBoundary, useAdminThemeState, useAdminThemeDocument, useAdminThemePicker, type AdminThemeDocumentEnv, type AdminThemePort } from "../use-admin-theme.hooks";

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

describe("resolved screen boundary", () => {
  it("follows optimistic document paints and scheme changes without any settings reads", async () => {
    const root = document.createElement("html");
    const { result, unmount } = renderHook(() => ({
      state: useAdminThemeState({}, { root }),
      props: useAdminThemeBoundary({}, { root }),
    }));
    expect(result.current.state).toEqual({ themeId: "classic", scheme: "light" });
    expect(result.current.props).toEqual({ "data-theme": "light" });
    for (const [themeId, scheme] of [["classic", "dark"], ["glass", "dark"], ["glass", "light"], ["classic", "light"]] as const) {
      act(() => applyAdminThemeToDocument({ state: { themeId, scheme } }, { root }));
      await waitFor(() => expect(result.current.state).toEqual({ themeId: "classic", scheme }));
      expect(result.current.props).toEqual({ "data-theme": "light" });
    }
    unmount();
    root.setAttribute("data-color-scheme", "dark");
    expect(result.current.state).toEqual({ themeId: "classic", scheme: "light" });
  });

  it("recognizes the pre-paint document and legacy dark attribute, falling back for missing themes", () => {
    const root = document.createElement("html");
    root.setAttribute("data-admin-theme", "removed");
    root.setAttribute("data-theme", "dark");
    const { result } = renderHook(() => useAdminThemeState({}, { root }));
    expect(result.current).toEqual({ themeId: "classic", scheme: "dark" });
  });
});

describe("useAdminThemeDocument", () => {
  it.each(["default", "glass", "removed-theme"])("paints stored %s as Classic once both settings load, and remembers it", async (adminTheme) => {
    const consoleError = vi.spyOn(console, "error");
    try {
      const { env, storage } = fakeEnv();
      renderHook(() => useAdminThemeDocument({}, { port: fakePort({ adminTheme, theme: "dark" }), env }));
      expect(env.root.hasAttribute("data-admin-theme")).toBe(false);
      await waitFor(() => expect(env.root.getAttribute("data-admin-theme")).toBe("classic"));
      expect(env.root.getAttribute("data-color-scheme")).toBe("dark");
      expect(env.root.getAttribute("data-theme")).toBe("dark");
      expect(storage.setItem).toHaveBeenCalledWith(ADMIN_THEME_STORAGE_KEY, expect.stringContaining('"themeId":"classic"'));
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("follows the OS while the scheme is system, and stops listening on unmount", async () => {
    const { env, flipOs, listenerCount } = fakeEnv({ dark: false });
    const { unmount } = renderHook(() => useAdminThemeDocument({}, { port: fakePort({ theme: "system" }), env }));
    await waitFor(() => expect(env.root.getAttribute("data-color-scheme")).toBe("light"));
    expect(listenerCount()).toBe(1);
    act(() => flipOs(true));
    expect(env.root.getAttribute("data-color-scheme")).toBe("dark");
    expect(env.root.getAttribute("data-theme")).toBe("dark");
    unmount();
    expect(listenerCount()).toBe(0);
    act(() => flipOs(false));
    expect(env.root.getAttribute("data-color-scheme")).toBe("dark");
    expect(env.root.getAttribute("data-theme")).toBe("dark");
  });

  it("releases the previous document's listener when the environment changes", async () => {
    const previous = fakeEnv();
    const next = fakeEnv({ dark: true });
    const port = fakePort({ theme: "system" });
    const { rerender, unmount } = renderHook(({ env }) => useAdminThemeDocument({}, { port, env }), {
      initialProps: { env: previous.env },
    });
    await waitFor(() => expect(previous.listenerCount()).toBe(1));
    rerender({ env: next.env });
    await waitFor(() => expect(next.listenerCount()).toBe(1));
    expect(previous.listenerCount()).toBe(0);
    act(() => previous.flipOs(true));
    expect(previous.env.root.getAttribute("data-color-scheme")).toBe("light");
    unmount();
    expect(next.listenerCount()).toBe(0);
  });

  it("paints system once without registering a listener that cannot be removed", async () => {
    const addEventListener = vi.fn();
    const env: AdminThemeDocumentEnv = {
      root: document.createElement("html"),
      matchMedia: () => ({ matches: true, addEventListener }),
    };
    const port = fakePort({ theme: "system" });
    const { unmount } = renderHook(() => useAdminThemeDocument({}, { port, env }));
    await waitFor(() => expect(env.root.getAttribute("data-color-scheme")).toBe("dark"));
    expect(addEventListener).not.toHaveBeenCalled();
    unmount();
    expect(addEventListener).not.toHaveBeenCalled();
  });
});

describe("useAdminThemePicker", () => {
  it.each(["interface", "appearance"] as const)("keeps values undefined until loaded and stays unready with only %s loaded", async (first) => {
    let releaseInterface!: (value: InterfaceConfig) => void;
    let releaseAppearance!: (value: AppearanceConfig) => void;
    const port = fakePort();
    port.loadInterface = vi.fn(() => new Promise<InterfaceConfig>((resolve) => { releaseInterface = resolve; }));
    port.loadAppearance = vi.fn(() => new Promise<AppearanceConfig>((resolve) => { releaseAppearance = resolve; }));
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    expect(result.current).toMatchObject({ ready: false, themeId: undefined, preference: undefined });
    await waitFor(() => {
      expect(port.loadInterface).toHaveBeenCalled();
      expect(port.loadAppearance).toHaveBeenCalled();
    });
    await act(async () => {
      if (first === "interface") releaseInterface(DEFAULT_INTERFACE);
      else releaseAppearance(DEFAULT_APPEARANCE);
    });
    await waitFor(() => expect(result.current).toMatchObject({
      ready: false,
      themeId: first === "interface" ? DEFAULT_INTERFACE.adminTheme : undefined,
      preference: first === "appearance" ? DEFAULT_APPEARANCE.theme : undefined,
    }));
    act(() => {
      result.current.selectTheme("different-theme");
      result.current.selectPreference("dark");
    });
    expect(port.saveInterface).not.toHaveBeenCalled();
    expect(port.saveAppearance).not.toHaveBeenCalled();
    await act(async () => {
      if (first === "interface") releaseAppearance(DEFAULT_APPEARANCE);
      else releaseInterface(DEFAULT_INTERFACE);
    });
    await waitFor(() => expect(result.current).toMatchObject({
      ready: true, themeId: DEFAULT_INTERFACE.adminTheme, preference: DEFAULT_APPEARANCE.theme,
    }));
  });

  it("prefers each pending value independently, including an empty theme id, until saves settle", async () => {
    let releaseInterface!: () => void;
    let releaseAppearance!: () => void;
    const port = fakePort();
    port.saveInterface = vi.fn(() => new Promise<readonly string[]>((resolve) => { releaseInterface = () => resolve([]); }));
    port.saveAppearance = vi.fn(() => new Promise<readonly string[]>((resolve) => { releaseAppearance = () => resolve([]); }));
    const { env } = fakeEnv();
    const { result, rerender } = renderHook(() => useAdminThemePicker({}, { port, env }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.selectTheme(""));
    expect(result.current).toMatchObject({ ready: true, themeId: "", preference: "light" });
    act(() => result.current.selectPreference("dark"));
    expect(result.current).toMatchObject({ ready: true, themeId: "", preference: "dark" });
    rerender();
    expect(result.current).toMatchObject({ ready: true, themeId: "", preference: "dark" });
    await act(async () => {
      releaseInterface();
      releaseAppearance();
    });
    await waitFor(() => {
      expect(port.loadInterface).toHaveBeenCalledTimes(2);
      expect(port.loadAppearance).toHaveBeenCalledTimes(2);
    });
    expect(result.current).toMatchObject({ ready: true, themeId: "", preference: "dark" });
  });

  it("repaints at once and saves the theme id through the interface ledger", async () => {
    const port = fakePort({ adminTheme: "default" });
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.selectTheme("classic"));
    expect(env.root.getAttribute("data-admin-theme")).toBe("classic");
    expect(result.current.themeId).toBe("classic");
    expect(port.saveInterface).toHaveBeenCalledWith(DEFAULT_INTERFACE, { ...DEFAULT_INTERFACE, adminTheme: "default" });
    await waitFor(() => expect(port.loadInterface).toHaveBeenCalledTimes(2));
    expect(result.current.themeId).toBe("classic");
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
    const port = fakePort({ adminTheme: "default" });
    port.saveInterface = vi.fn(() => Promise.reject(new Error("offline")));
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.selectTheme("classic"));
    await waitFor(() => expect(result.current.error).toBe("offline"));
    expect(result.current.themeId).toBe("default");
    expect(env.root.getAttribute("data-admin-theme")).toBe("classic");
  });

  it("ignores clicks before the settings load and re-selecting the current value", async () => {
    let release!: (value: InterfaceConfig) => void;
    const port = fakePort();
    port.loadInterface = vi.fn(() => new Promise<InterfaceConfig>((resolveLoad) => { release = resolveLoad; }));
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    act(() => result.current.selectTheme("classic"));
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

describe("useAdminThemeState — server render", () => {
  it("reports Classic light before any document exists to observe", async () => {
    const { renderToString } = await import("react-dom/server");
    function Probe() {
      const state = useAdminThemeState({}, { root: document.createElement("html") });
      return <output>{`${state.themeId}/${state.scheme}`}</output>;
    }
    expect(renderToString(<Probe />)).toContain("classic/light");
  });
});

describe("useAdminThemeDocument — browser defaults", () => {
  it("still paints the real document when the browser refuses localStorage access", async () => {
    const root = document.documentElement;
    const refused = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("storage disabled", "SecurityError");
    });
    try {
      renderHook(() => useAdminThemeDocument({}, { port: fakePort({ adminTheme: "classic", theme: "dark" }) }));
      await waitFor(() => expect(root.getAttribute("data-color-scheme")).toBe("dark"));
      expect(root.getAttribute("data-admin-theme")).toBe("classic");
      expect(refused).toHaveBeenCalled();
    } finally {
      refused.mockRestore();
      for (const name of ["data-admin-theme", "data-color-scheme", "data-theme"]) root.removeAttribute(name);
    }
  });
});

describe("useAdminThemePicker — browser defaults and odd rejections", () => {
  it("paints the real document when no env is injected", async () => {
    const root = document.documentElement;
    const port = fakePort({ adminTheme: "default", theme: "light" });
    try {
      const { result } = renderHook(() => useAdminThemePicker({}, { port }));
      await waitFor(() => expect(result.current.ready).toBe(true));
      act(() => result.current.selectPreference("dark"));
      expect(root.getAttribute("data-color-scheme")).toBe("dark");
      await waitFor(() => expect(port.saveAppearance).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }), expect.anything()));
    } finally {
      for (const name of ["data-admin-theme", "data-color-scheme", "data-theme"]) root.removeAttribute(name);
    }
  });

  it("reports a non-Error rejection by its string form and restores the stored scheme", async () => {
    const port = fakePort({ theme: "light" });
    port.saveAppearance = vi.fn(() => Promise.reject("ledger busy"));
    const { env } = fakeEnv();
    const { result } = renderHook(() => useAdminThemePicker({}, { port, env }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.selectPreference("dark"));
    expect(env.root.getAttribute("data-color-scheme")).toBe("dark");
    await waitFor(() => expect(result.current.error).toBe("ledger busy"));
    expect(result.current.preference).toBe("light");
    expect(env.root.getAttribute("data-color-scheme")).toBe("light");
  });
});

describe("useAdminThemeDocument — a browser without matchMedia", () => {
  it("paints \"system\" as light and does not try to follow the OS", async () => {
    const root = document.documentElement;
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { value: undefined, writable: true, configurable: true });
    try {
      renderHook(() => useAdminThemeDocument({}, { port: fakePort({ theme: "system" }) }));
      await waitFor(() => expect(root.getAttribute("data-color-scheme")).toBe("light"));
      expect(root.hasAttribute("data-theme")).toBe(false);
    } finally {
      Object.defineProperty(window, "matchMedia", { value: original, writable: true, configurable: true });
      for (const name of ["data-admin-theme", "data-color-scheme", "data-theme"]) root.removeAttribute(name);
    }
  });
});
