import { act, fireEvent, render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ACCENT_COLOR } from "@jini-ai/ui";
import { AdminAppearance } from "../AdminAppearance";
import { adminThemeAccent, DEFAULT_APPEARANCE, DEFAULT_INTERFACE, type AppearanceConfig, type InterfaceConfig } from "../../../lib/settings-tabs";
import type { AdminThemeDocumentEnv, AdminThemePort } from "../../../admin-themes/use-admin-theme.hooks";
import type { useAdminAppearanceSettings } from "../hooks/use-admin-appearance-settings.hooks";
import { applyAdminThemeToDocument } from "../../../admin-themes/apply";
import { findAdminTheme } from "../../../admin-themes/registry";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";

const persistence = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../../../hooks/use-admin-locale.hooks", () => ({ useAdminLocale: vi.fn(() => "en") }));
vi.mock("../../../lib/settings-tabs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../lib/settings-tabs")>(),
  loadAppearance: () => persistence.load(),
  saveAppearance: (...args: unknown[]) => persistence.save(...args),
}));

const rootStyle = document.documentElement.getAttribute("style");
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(useAdminLocale).mockReturnValue("en");
  if (rootStyle === null) document.documentElement.removeAttribute("style");
  else document.documentElement.setAttribute("style", rootStyle);
});

function slice(overrides: Partial<ReturnType<typeof useAdminAppearanceSettings>> = {}): ReturnType<typeof useAdminAppearanceSettings> {
  return {
    value: { ...DEFAULT_APPEARANCE, accentColor: "#a855f7" },
    onChange: vi.fn(),
    loadError: null,
    saveState: { status: "idle" },
    refresh: vi.fn(),
    ...overrides,
  };
}

function themePicker({ theme = "light" as AppearanceConfig["theme"] } = {}) {
  let appearance: AppearanceConfig = { ...DEFAULT_APPEARANCE, theme, accentColor: "#a855f7" };
  const port: AdminThemePort = {
    loadInterface: () => Promise.resolve(DEFAULT_INTERFACE),
    loadAppearance: vi.fn(() => Promise.resolve(appearance)),
    saveInterface: vi.fn((_: InterfaceConfig) => Promise.resolve([])),
    saveAppearance: vi.fn((next: AppearanceConfig) => { appearance = next; return Promise.resolve(["theme"]); }),
  };
  const env: AdminThemeDocumentEnv = { root: document.createElement("html"), storage: { setItem: vi.fn() } };
  return { port, env };
}

describe("Appearance moved to Admin UI", () => {
  it.each([
    ["es", "Cargando apariencia…"],
    ["id", "Memuat tampilan…"],
    ["de", "Erscheinungsbild wird geladen…"],
    ["zh-CN", "正在加载外观…"],
    ["zh-TW", "正在載入外觀…"],
    ["pt-BR", "Carregando aparência…"],
    ["ru", "Загрузка внешнего вида…"],
    ["fa", "در حال بارگذاری ظاهر…"],
    ["ar", "جارٍ تحميل المظهر…"],
    ["ja", "外観を読み込み中…"],
    ["ko", "모양을 불러오는 중…"],
    ["pl", "Wczytywanie wyglądu…"],
    ["hu", "Megjelenés betöltése…"],
    ["fr", "Chargement de l’apparence…"],
    ["uk", "Завантаження вигляду…"],
    ["tr", "Görünüm yükleniyor…"],
    ["th", "กำลังโหลดลักษณะที่ปรากฏ…"],
    ["it", "Caricamento aspetto…"],
    ["hi", "रूप-रंग लोड हो रहा है…"],
    ["ur", "ظاہری شکل لوڈ ہو رہی ہے…"],
    ["bn", "চেহারা লোড হচ্ছে…"],
  ])("translates the loading status for %s before the settings provider mounts", (locale, expected) => {
    vi.mocked(useAdminLocale).mockReturnValue(locale);
    render(<AdminAppearance useAppearanceHook={() => slice({ value: null })} {...themePicker()} />);
    expect(screen.getByRole("status")).toHaveTextContent(expected);
  });

  it("has one compact Light / Dark / System control that repaints and saves the shell's setting", async () => {
    const { port, env } = themePicker();
    const appearance = slice();
    const { container } = render(<AdminAppearance useAppearanceHook={() => appearance} port={port} env={env} />);
    const group = screen.getByRole("radiogroup", { name: "Color scheme" });
    expect(screen.getByText("Color scheme", { selector: ".jini-field > .jini-field-label" })).toBeVisible();
    expect(screen.getAllByRole("radiogroup", { name: "Color scheme" })).toHaveLength(1);
    expect(group).toHaveClass("segmented", "admin-themes-scheme");
    expect(within(group).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(container.querySelector(".jini-seg-control")).toBeNull();
    expect(screen.queryByRole("group", { name: "Appearance" })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await waitFor(() => expect(within(group).getByRole("radio", { name: "Dark" })).toBeEnabled());
    expect(within(group).getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    const previous = { ...DEFAULT_APPEARANCE, accentColor: "#a855f7" };
    for (const [name, theme] of [["Dark", "dark"], ["System", "system"], ["Light", "light"]] as const) {
      await user.click(within(group).getByRole("radio", { name }));
      expect(env.root.getAttribute("data-color-scheme")).toBe(theme === "dark" ? "dark" : "light");
      expect(port.saveAppearance).toHaveBeenLastCalledWith({ ...previous, theme }, previous);
      await waitFor(() => expect(within(group).getByRole("radio", { name })).toHaveAttribute("aria-checked", "true"));
      await waitFor(() => expect(port.loadAppearance).toHaveBeenCalledTimes(theme === "dark" ? 2 : theme === "system" ? 3 : 4));
      previous.theme = theme;
    }
    expect(appearance.onChange).not.toHaveBeenCalled();
  });

  it("merges the accent selection without losing the stored scheme", () => {
    const appearance = slice({ value: { ...DEFAULT_APPEARANCE, theme: "system" } });
    render(<AdminAppearance useAppearanceHook={() => appearance} {...themePicker()} />);
    fireEvent.change(screen.getByLabelText("Custom accent color"), { target: { value: "#a855f7" } });
    expect(appearance.onChange).toHaveBeenCalledWith({ theme: "system", accentColor: "#a855f7" });
  });

  it("offers the theme's default and Jini's presets without changing the scheme", async () => {
    const appearance = slice({ value: { ...DEFAULT_APPEARANCE, theme: "system" } });
    render(<AdminAppearance useAppearanceHook={() => appearance} {...themePicker()} />);
    const group = screen.getByRole("radiogroup", { name: "Accent color" });
    await userEvent.click(within(group).getByRole("radio", { name: "#059669" }));
    expect(appearance.onChange).toHaveBeenLastCalledWith({ theme: "system", accentColor: "#059669" });
    await userEvent.click(within(group).getByRole("radio", { name: DEFAULT_ACCENT_COLOR }));
    expect(appearance.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_APPEARANCE, theme: "system", accentColor: DEFAULT_ACCENT_COLOR });
    await userEvent.click(within(group).getByRole("radio", { name: "Default accent color" }));
    expect(appearance.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_APPEARANCE, theme: "system" });
  });

  it.each([["classic", "light"], ["classic", "dark"], ["glass", "light"], ["glass", "dark"]] as const)("selects %s's resolved %s default, saves through the real adapter, and reloads with no override", async (themeId, scheme) => {
    const actual = await vi.importActual<typeof import("../../../lib/settings-tabs")>("../../../lib/settings-tabs");
    const stored = new Map<string, unknown>([
      ["theme", scheme], ["accentColor", "#d97706"],
      ["adminThemeAccents", { glass: "#123456", removed: "#abcdef" }],
    ]);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const { key, valueJson } = JSON.parse(init.body as string);
        if (key === "accentColor") expect(valueJson).toMatch(/^#[0-9a-f]{6}$/i);
        stored.set(key, valueJson);
        return new Response(JSON.stringify({ key, scope: "user", value: valueJson, revisionSeq: 1 }));
      }
      return new Response(JSON.stringify({ data: [...stored].map(([key, value]) => ({ key, value, sourceLayer: "user", defVersion: 1 })) }));
    }));
    persistence.load.mockImplementation(actual.loadAppearance);
    persistence.save.mockImplementation(actual.saveAppearance);
    const picker = themePicker({ theme: scheme });
    applyAdminThemeToDocument({ state: { themeId, scheme } }, { root: picker.env.root });
    const { unmount } = render(<AdminAppearance {...picker} />);
    await screen.findByLabelText("Custom accent color");
    fireEvent.click(screen.getByRole("radio", { name: "Default accent color" }));
    await waitFor(() => expect(persistence.save).toHaveBeenCalled());
    await waitFor(() => expect(stored.get("accentColor")).toBe(DEFAULT_APPEARANCE.accentColor));
    const loaded = await actual.loadAppearance();
    expect(adminThemeAccent({ appearance: loaded, themeId: "classic" })).toBeUndefined();
    expect(adminThemeAccent({ appearance: loaded, themeId: "glass" })).toBe("#123456");
    expect(loaded.accentColors?.removed).toBe("#abcdef");
    unmount();
    render(<AdminAppearance {...picker} />);
    const input = await screen.findByLabelText("Custom accent color");
    const preview = findAdminTheme({ id: themeId }).preview[scheme]!;
    expect(input).toHaveValue(preview.accentHex ?? preview.accent);
    expect(input).not.toHaveValue(DEFAULT_ACCENT_COLOR);
    expect(screen.getByRole("radio", { name: "Default accent color" })).toHaveAttribute("aria-checked", "true");
    expect(picker.env.root.style.getPropertyValue("--jini-theme-light-primary")).toBe("");
    expect(picker.env.root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("");
  });

  it("reports a scheme save failure and restores the persisted selection", async () => {
    const { port, env } = themePicker();
    vi.mocked(port.saveAppearance).mockRejectedValueOnce(new Error("scheme write failed"));
    render(<AdminAppearance useAppearanceHook={() => slice()} port={port} env={env} />);
    const dark = screen.getByRole("radio", { name: "Dark" });
    await waitFor(() => expect(dark).toBeEnabled());
    await userEvent.click(dark);
    expect(await screen.findByRole("alert")).toHaveTextContent("scheme write failed");
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    expect(env.root.getAttribute("data-color-scheme")).toBe("light");
  });

  it("shows loading, then preserves load/save errors alongside editable defaults", () => {
    const { rerender } = render(<AdminAppearance useAppearanceHook={() => slice({ value: null })} {...themePicker()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading appearance…");
    rerender(<AdminAppearance useAppearanceHook={() => slice({ loadError: "read failed", saveState: { status: "error", message: "write failed" } })} {...themePicker()} />);
    expect(screen.getAllByRole("alert").map((item) => item.textContent)).toEqual(["read failed", "write failed"]);
    expect(screen.getByRole("radiogroup", { name: "Color scheme" })).toBeInTheDocument();
  });

  it("uses the existing debounced settings lifecycle and persists against the loaded diff base", async () => {
    const previous = { ...DEFAULT_APPEARANCE, theme: "system", accentColor: "#a855f7" } as const;
    let stored: AppearanceConfig = previous;
    persistence.load.mockImplementation(async () => stored);
    persistence.save.mockImplementation(async (next: AppearanceConfig) => {
      stored = next;
      return ["accentColor"];
    });
    const picker = themePicker();
    render(<AdminAppearance {...picker} />);
    const input = await screen.findByLabelText("Custom accent color");
    fireEvent.change(input, { target: { value: "#059669" } });
    await waitFor(() => expect(persistence.save).toHaveBeenCalledWith({ ...previous, accentColor: "#059669" }, previous));
    expect(picker.env.root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#059669");
  });

  it("uses Classic's scheme default and accent setting for parked Glass", async () => {
    const previous = DEFAULT_APPEARANCE;
    let stored: AppearanceConfig = previous;
    persistence.load.mockImplementation(async () => stored);
    persistence.save.mockImplementation(async (next: AppearanceConfig) => { stored = next; return ["accentColor"]; });
    const picker = themePicker();
    applyAdminThemeToDocument({ state: { themeId: "glass", scheme: "light" } }, { root: picker.env.root });
    render(<AdminAppearance {...picker} />);
    const input = await screen.findByLabelText("Custom accent color");
    const preview = findAdminTheme({ id: "classic" }).preview;
    expect(input).toHaveValue(preview.light!.accentHex ?? preview.light!.accent);
    expect(picker.env.root.style.getPropertyValue("--jini-theme-light-primary")).toBe("");
    act(() => applyAdminThemeToDocument({ state: { themeId: "glass", scheme: "dark" } }, { root: picker.env.root }));
    await waitFor(() => expect(input).toHaveValue(preview.dark!.accentHex ?? preview.dark!.accent));
    expect(input.closest(".settings-ui-section")).toHaveAttribute("data-theme", "light");
    fireEvent.change(input, { target: { value: "#059669" } });
    await waitFor(() => expect(persistence.save).toHaveBeenCalledWith({
      ...previous, accentColor: "#059669",
    }, previous));
    expect(picker.env.root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#059669");
  });

  it("edits Classic for parked Glass while preserving Glass's saved accent", async () => {
    const value = { ...DEFAULT_APPEARANCE, accentColor: "#d97706", accentColors: { glass: "#123456" } };
    const appearance = slice({ value });
    const picker = themePicker();
    applyAdminThemeToDocument({ state: { themeId: "glass", scheme: "dark" } }, { root: picker.env.root });
    render(<AdminAppearance useAppearanceHook={() => appearance} {...picker} />);
    const input = screen.getByLabelText("Custom accent color");
    expect(input).toHaveValue("#d97706");
    expect(input.closest(".settings-ui-section")).toHaveAttribute("data-theme", "light");
    expect(input.closest(".settings-ui-section")).not.toHaveAttribute("data-color-scheme");
    fireEvent.change(input, { target: { value: "#abcdef" } });
    expect(appearance.onChange).toHaveBeenLastCalledWith({ ...value, accentColor: "#abcdef", accentColors: { glass: "#123456" } });
  });

  it("reads the live document's theme state when no env is given", () => {
    const appearance = slice({ value: { ...DEFAULT_APPEARANCE, theme: "light" } });
    render(<AdminAppearance useAppearanceHook={() => appearance} port={themePicker().port} />);
    // No `data-admin-theme` on the real <html>: Classic, whose light preview names its own picker hex.
    expect(screen.getByLabelText("Custom accent color")).toHaveValue("#a85a38");
    expect(screen.getByRole("radiogroup", { name: "Color scheme" })).toBeInTheDocument();
  });
});
