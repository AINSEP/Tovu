import { act, render, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useAdminAppearance, useSettingsAppearance } from "../use-admin-appearance.hooks";
import { useAdminAppearanceSnapshot } from "../use-admin-appearance-snapshot.hooks";
import { APPEARANCE_NAMESPACE, DEFAULT_APPEARANCE, DEFAULT_INTERFACE } from "../../lib/settings-tabs";
import { publishSettingsRefresh } from "../../lib/settings-refresh-bus";
import { applyAdminThemeToDocument } from "../../admin-themes/apply";
import { useAdminThemeDocument, useAdminThemePicker, useAdminThemeState } from "../../admin-themes/use-admin-theme.hooks";
import { adminThemeAccent } from "../../lib/settings-tabs";

const primary = () => document.documentElement.style.getPropertyValue("--jini-theme-light-primary");
afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-admin-accent");
});
afterEach(() => vi.unstubAllGlobals());

it.each(["light", "dark"] as const)("routes Classic's live %s primary ramp through the accent inputs and restores its defaults", (scheme) => {
  const root = document.documentElement;
  const originalAttributes = ["data-admin-theme", "data-theme", "data-color-scheme", "data-admin-accent"].map((name) => [name, root.getAttribute(name)] as const);
  const stylesheet = document.createElement("style");
  // Read the real theme: mocked palette declarations would miss Classic's fixed orange tokens.
  stylesheet.textContent = readFileSync(resolvePath(process.cwd(), "src/admin-themes/classic/admin.css"), "utf8");
  document.head.append(stylesheet);
  try {
    applyAdminThemeToDocument({ state: { themeId: "classic", scheme } }, { root });
    const tokens = ["--primary", "--primary-strong", "--primary-ink", "--primary-dim", "--primary-ring", "--link", "--link-ink", "--accent"];
    const defaults = tokens.map((token) => getComputedStyle(root).getPropertyValue(token));
    const { rerender } = renderHook(({ accentColor }) => useSettingsAppearance({ ready: true, accentColor }, { root }), {
      initialProps: { accentColor: adminThemeAccent({ appearance: { ...DEFAULT_APPEARANCE, accentColor: "#a855f7" }, themeId: "classic" }) },
    });
    expect(primary()).toBe("#a855f7");
    expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#a855f7");
    expect(root.style.getPropertyValue("--jini-theme-light-primary-ink")).toBe("#ffffff");
    rerender({ accentColor: "#ffba3e" });
    expect(root.style.getPropertyValue("--jini-theme-dark-primary-ink")).toBe("#111111");
    expect(root.getAttribute("data-admin-accent")).toBe("light");
    rerender({ accentColor: "#a855f7" });
    // JSDOM exposes custom-property expressions; the real aliases plus both live inputs are
    // asserted here. Browser colour resolution/contrast still needs rendered verification.
    const roles = ["--jini-primary", "--jini-accent-strong", "--jini-primary-ink", "--jini-accent-soft", "--jini-accent-ring", "--jini-link", "--jini-link-ink"];
    for (const [index, role] of roles.entries()) {
      expect(getComputedStyle(root).getPropertyValue(tokens[index]!)).toBe(`var(${role})`);
    }
    expect(getComputedStyle(root).getPropertyValue("--accent")).toBe(defaults.at(-1));
    rerender({ accentColor: adminThemeAccent({ appearance: DEFAULT_APPEARANCE, themeId: "classic" }) });
    expect(primary()).toBe("");
    expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("");
    expect(root.style.getPropertyValue("--jini-theme-light-primary-ink")).toBe("");
    expect(tokens.map((token) => getComputedStyle(root).getPropertyValue(token))).toEqual(defaults);
  } finally {
    stylesheet.remove();
    for (const [name, value] of originalAttributes) {
      if (value === null) root.removeAttribute(name);
      else root.setAttribute(name, value);
    }
  }
});

it("keeps Classic's accent for parked Glass and ignores Glass's saved accent", async () => {
  const root = document.createElement("html");
  let appearance = { ...DEFAULT_APPEARANCE, accentColor: "#d97706", accentColors: {} as Record<string, string> };
  let refresh = () => {};
  const port = {
    loadAppearance: vi.fn(async () => appearance),
    subscribeToSettingsRefresh: (listener: () => void) => { refresh = listener; return () => {}; },
  };
  const accent = () => root.style.getPropertyValue("--jini-theme-light-primary");
  renderHook(() => useAdminAppearance({}, { root, port }));
  await waitFor(() => expect(accent()).toBe("#d97706"));
  act(() => applyAdminThemeToDocument({ state: { themeId: "glass", scheme: "dark" } }, { root }));
  await waitFor(() => expect(accent()).toBe("#d97706"));
  expect(root.hasAttribute("data-admin-accent")).toBe(true);
  expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#d97706");
  expect(port.loadAppearance).toHaveBeenCalledTimes(1);
  appearance = { ...appearance, accentColors: { ...appearance.accentColors, glass: "#2563eb" } };
  await act(async () => refresh());
  await waitFor(() => expect(port.loadAppearance).toHaveBeenCalledTimes(2));
  for (const themeId of ["classic", "glass"] as const) {
    act(() => applyAdminThemeToDocument({ state: { themeId, scheme: "light" } }, { root }));
    await waitFor(() => expect(accent()).toBe("#d97706"));
  }
});

it("keeps Classic's inline accent for parked Glass while the shell read is pending", async () => {
  const root = document.createElement("html");
  root.style.setProperty("--jini-theme-light-primary", "#d97706");
  root.style.setProperty("--jini-theme-dark-primary", "#d97706");
  let resolve!: (value: typeof DEFAULT_APPEARANCE) => void;
  const port = {
    loadAppearance: () => new Promise<typeof DEFAULT_APPEARANCE>((done) => { resolve = done; }),
    subscribeToSettingsRefresh: () => () => {},
  };
  renderHook(() => useAdminAppearance({}, { root, port }));
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  act(() => applyAdminThemeToDocument({ state: { themeId: "glass", scheme: "light" } }, { root }));
  await waitFor(() => expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#d97706"));
  expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#d97706");
  await act(async () => resolve({ ...DEFAULT_APPEARANCE, accentColor: "#d97706" }));
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#d97706");
});

it("keeps a pending read behind Classic's draft when parked Glass falls back", async () => {
  const root = document.createElement("html");
  let resolve!: (value: typeof DEFAULT_APPEARANCE) => void;
  const port = {
    loadAppearance: () => new Promise<typeof DEFAULT_APPEARANCE>((done) => { resolve = done; }),
    subscribeToSettingsRefresh: () => () => {},
  };
  const draft = { ...DEFAULT_APPEARANCE, accentColor: "#e11d48" };
  const { result, rerender } = renderHook(({ ready }) => {
    const { themeId } = useAdminThemeState({}, { root });
    useAdminAppearance({}, { root, port });
    useSettingsAppearance({ ready, accentColor: adminThemeAccent({ appearance: draft, themeId }) }, { root });
    return useAdminAppearanceSnapshot({ port }, { root });
  }, { initialProps: { ready: false } });
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  rerender({ ready: true });
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#e11d48");
  act(() => applyAdminThemeToDocument({ state: { themeId: "glass", scheme: "dark" } }, { root }));
  await waitFor(() => expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#e11d48"));
  await act(async () => resolve({ ...DEFAULT_APPEARANCE, accentColor: "#d97706" }));
  await waitFor(() => expect(result.current.data?.appearance.accentColor).toBe("#d97706"));
  expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#e11d48");
  act(() => applyAdminThemeToDocument({ state: { themeId: "classic", scheme: "dark" } }, { root }));
  await waitFor(() => expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#e11d48"));
});

it.each(["#123456", "#d97706"])("retires Classic's old draft after accepting %s and keeps its newer draft for parked Glass", async (refreshedAccent) => {
  const root = document.createElement("html");
  const accent = () => root.style.getPropertyValue("--jini-theme-light-primary");
  let saved = { ...DEFAULT_APPEARANCE, accentColor: "#d97706" };
  let refresh = () => {};
  const port = {
    loadAppearance: vi.fn(async () => saved),
    subscribeToSettingsRefresh: (listener: () => void) => { refresh = listener; return () => {}; },
    loadInterface: async () => DEFAULT_INTERFACE,
    saveInterface: vi.fn(async () => []),
    saveAppearance: vi.fn(async () => []),
  };
  const env = { root };
  // App mounts both readers; the picker adds another observer while its page is open.
  // All three must use versioned snapshots even when TanStack selects a different loader.
  function AppearancePreview({ accentColor }: { accentColor: string }) {
    useAdminThemePicker({}, { port, env });
    useSettingsAppearance({ ready: true, accentColor }, { root });
    return null;
  }
  function Shell({ accentColor }: { accentColor?: string }) {
    useAdminAppearance({}, { root, port });
    useAdminThemeDocument({}, { port, env });
    return accentColor === undefined ? null : createElement(AppearancePreview, { accentColor });
  }
  const { rerender } = render(createElement(Shell));
  await waitFor(() => expect(accent()).toBe("#d97706"));
  rerender(createElement(Shell, { accentColor: "#e11d48" }));
  expect(accent()).toBe("#e11d48");
  rerender(createElement(Shell));
  saved = { ...saved, accentColor: refreshedAccent };
  await act(async () => refresh());
  await waitFor(() => expect(accent()).toBe(refreshedAccent));
  expect(port.loadAppearance).toHaveBeenCalledTimes(2);
  act(() => applyAdminThemeToDocument({ state: { themeId: "glass", scheme: "dark" } }, { root }));
  await waitFor(() => expect(accent()).toBe(refreshedAccent));
  rerender(createElement(Shell, { accentColor: "#059669" }));
  expect(accent()).toBe("#059669");
  rerender(createElement(Shell));
  act(() => applyAdminThemeToDocument({ state: { themeId: "classic", scheme: "light" } }, { root }));
  await waitFor(() => expect(accent()).toBe("#059669"));
  expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#059669");
});

it("applies the saved accent on load and follows settings refreshes", async () => {
  let accentColor = "#a855f7";
  let refresh = () => {};
  const port = {
    loadAppearance: async () => ({ ...DEFAULT_APPEARANCE, accentColor }),
    subscribeToSettingsRefresh: (listener: () => void) => {
      refresh = listener;
      return () => { refresh = () => {}; };
    },
  };
  const { unmount } = renderHook(() => useAdminAppearance({}, { port }));
  await waitFor(() => expect(primary()).toBe("#a855f7"));
  expect(document.documentElement.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#a855f7");
  accentColor = "#123456";
  await act(async () => refresh());
  await waitFor(() => expect(primary()).toBe("#123456"));
  unmount();
});

it("the unchosen ledger default leaves the stylesheet's brand mapping in charge, in any case", async () => {
  let accentColor = "#a855f7";
  let refresh = () => {};
  const port = {
    loadAppearance: async () => ({ ...DEFAULT_APPEARANCE, accentColor }),
    subscribeToSettingsRefresh: (listener: () => void) => { refresh = listener; return () => {}; },
  };
  renderHook(() => useAdminAppearance({}, { port }));
  await waitFor(() => expect(primary()).toBe("#a855f7"));
  accentColor = DEFAULT_APPEARANCE.accentColor.toUpperCase();
  await act(async () => refresh());
  await waitFor(() => expect(primary()).toBe(""));
  expect(document.documentElement.style.getPropertyValue("--jini-theme-dark-primary")).toBe("");
});

it("previews edits immediately and skips unloaded values", async () => {
  const { rerender } = renderHook(({ accentColor, ready }) => useSettingsAppearance({ accentColor, ready }, {}), {
    initialProps: { accentColor: "#2563eb", ready: false },
  });
  expect(primary()).toBe("");
  rerender({ accentColor: "#e11d48", ready: true });
  expect(primary()).toBe("#e11d48");
  rerender({ accentColor: "#123456", ready: true });
  expect(primary()).toBe("#123456");
});

it("rejects an older settings read after a newer refresh and ignores unmounted reads", async () => {
  const pending: Array<(value: typeof DEFAULT_APPEARANCE) => void> = [];
  let refresh = () => {};
  const port = {
    loadAppearance: () => new Promise<typeof DEFAULT_APPEARANCE>((resolve) => pending.push(resolve)),
    subscribeToSettingsRefresh: (listener: () => void) => { refresh = listener; return () => {}; },
  };
  const { unmount } = renderHook(() => useAdminAppearance({}, { port }));
  await waitFor(() => expect(pending).toHaveLength(1));
  act(() => refresh());
  await waitFor(() => expect(pending).toHaveLength(2));
  await act(async () => pending[1]({ ...DEFAULT_APPEARANCE, accentColor: "#123456" }));
  await waitFor(() => expect(primary()).toBe("#123456"));
  await act(async () => pending[0]({ ...DEFAULT_APPEARANCE, accentColor: "#ffffff" }));
  expect(primary()).toBe("#123456");
  act(() => refresh());
  await waitFor(() => expect(pending).toHaveLength(3));
  unmount();
  await act(async () => pending[2]({ ...DEFAULT_APPEARANCE, accentColor: "#ffffff" }));
  expect(primary()).toBe("#123456");
});

it("a pending shell read cannot repaint an accent the operator has just previewed", async () => {
  let resolve!: (value: typeof DEFAULT_APPEARANCE) => void;
  const port = {
    loadAppearance: () => new Promise<typeof DEFAULT_APPEARANCE>((done) => { resolve = done; }),
    subscribeToSettingsRefresh: () => () => {},
  };
  const { result, rerender } = renderHook(({ ready }) => {
    useAdminAppearance({}, { port });
    useSettingsAppearance({ ready, accentColor: "#e11d48" }, {});
    // Observe the same read reaching React before asserting that the preview survived it.
    return useAdminAppearanceSnapshot({ port });
  }, { initialProps: { ready: false } });
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  rerender({ ready: true });
  expect(primary()).toBe("#e11d48");
  await act(async () => resolve({ ...DEFAULT_APPEARANCE, accentColor: "#2563eb" }));
  await waitFor(() => expect(result.current.data?.appearance.accentColor).toBe("#2563eb"));
  expect(primary()).toBe("#e11d48");
});

it("the live port follows appearance and unscoped refreshes and ignores unrelated namespaces", async () => {
  let accentColor = "#a855f7";
  const fetch = vi.fn(async (url: string) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/settings/effective?namespace=core.appearance");
    return new Response(JSON.stringify({ data: [{ key: "accentColor", value: accentColor }] }));
  });
  vi.stubGlobal("fetch", fetch);
  const { unmount } = renderHook(() => useAdminAppearance({}));
  await waitFor(() => expect(primary()).toBe("#a855f7"));
  expect(fetch).toHaveBeenCalledTimes(1);
  accentColor = "#123456";
  await act(async () => publishSettingsRefresh(["core.execution"]));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(primary()).toBe("#a855f7");
  await act(async () => publishSettingsRefresh([APPEARANCE_NAMESPACE]));
  await waitFor(() => expect(primary()).toBe("#123456"));
  accentColor = "#e11d48";
  await act(async () => publishSettingsRefresh());
  await waitFor(() => expect(primary()).toBe("#e11d48"));
  expect(fetch).toHaveBeenCalledTimes(3);
  unmount();
  await act(async () => publishSettingsRefresh([APPEARANCE_NAMESPACE]));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("settings previews use the document root when options are omitted", () => {
  const { rerender } = renderHook(({ accentColor }) => useSettingsAppearance({ accentColor, ready: true }), {
    initialProps: { accentColor: "#a855f7" },
  });
  expect(primary()).toBe("#a855f7");
  rerender({ accentColor: "#123456" });
  expect(primary()).toBe("#123456");
});

it("loaded accents and draft previews apply to the supplied root", async () => {
  const root = document.createElement("main");
  const port = {
    loadAppearance: async () => ({ ...DEFAULT_APPEARANCE, accentColor: "#a855f7" }),
    subscribeToSettingsRefresh: () => () => {},
  };
  renderHook(() => useAdminAppearance({}, { port, root }));
  await waitFor(() => expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#a855f7"));
  renderHook(() => useSettingsAppearance({ accentColor: "#123456", ready: true }, { root }));
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#123456");
  expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#123456");
  expect(primary()).toBe("");
});
