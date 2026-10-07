import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_INTERFACE } from "@/lib/settings-tabs";
import { useUserInterfaceTab } from "../hooks/use-user-interface-tab.hooks";
import { t } from "../settings-interface-i18n";
import { UserInterfaceSettingsPanel } from "../UserInterfaceSettingsPanel";

/**
 * @file Settings → User Interface: autosaving switches. "Hide the chat button while the chat is
 * open" (owner, 2026-10-06), default on; "Wrap tabs instead of scrolling" (owner, 2026-10-07),
 * default off. The slice is a plain fake `{ value, onChange }`.
 */

describe("useUserInterfaceTab", () => {
  it("reads the slice and flips only its own key", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUserInterfaceTab({ value: { hideChatFabWhileOpen: true, wrapTabs: false }, onChange }));
    expect(result.current.hideChatFabWhileOpen).toBe(true);
    result.current.toggleHideChatFabWhileOpen();
    expect(onChange).toHaveBeenCalledWith({ hideChatFabWhileOpen: false, wrapTabs: false });
  });

  it("flips tab wrapping without touching the chat-button key", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUserInterfaceTab({ value: { hideChatFabWhileOpen: false, wrapTabs: false }, onChange }));
    expect(result.current.wrapTabs).toBe(false);
    result.current.toggleWrapTabs();
    expect(onChange).toHaveBeenCalledWith({ hideChatFabWhileOpen: false, wrapTabs: true });
  });

  it("falls back to the defaults (hide, scroll) while the slice has not loaded", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUserInterfaceTab({ value: null, onChange }));
    expect(DEFAULT_INTERFACE).toEqual({ hideChatFabWhileOpen: true, wrapTabs: false });
    expect(result.current.hideChatFabWhileOpen).toBe(true);
    expect(result.current.wrapTabs).toBe(false);
    result.current.toggleHideChatFabWhileOpen();
    expect(onChange).toHaveBeenCalledWith({ hideChatFabWhileOpen: false, wrapTabs: false });
  });
});

describe("UserInterfaceSettingsPanel", () => {
  it("renders a labelled switch that reflects the value and autosaves on click", () => {
    const onChange = vi.fn();
    render(<UserInterfaceSettingsPanel slice={{ value: { hideChatFabWhileOpen: false, wrapTabs: false }, onChange }} locale="en" />);
    const toggle = screen.getByRole("switch", { name: "Hide the chat button while the chat is open" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ hideChatFabWhileOpen: true, wrapTabs: false });
  });

  it("renders the tab-wrapping switch, off by default, and autosaves on click", () => {
    const onChange = vi.fn();
    render(<UserInterfaceSettingsPanel slice={{ value: null, onChange }} locale="en" />);
    const toggle = screen.getByRole("switch", { name: "Wrap tabs instead of scrolling" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ hideChatFabWhileOpen: true, wrapTabs: true });
  });

  it("exposes each switch to the page driver under a stable agent handle", () => {
    render(<UserInterfaceSettingsPanel slice={{ value: { hideChatFabWhileOpen: true, wrapTabs: false }, onChange: vi.fn() }} locale="en" />);
    expect(screen.getAllByRole("switch").map((toggle) => toggle.getAttribute("data-agent-element"))).toEqual([
      "settings-interface-hide-chat-fab",
      "settings-interface-wrap-tabs",
    ]);
  });

  it("translates its copy", () => {
    render(<UserInterfaceSettingsPanel slice={{ value: { hideChatFabWhileOpen: true, wrapTabs: false }, onChange: vi.fn() }} locale="es" />);
    expect(screen.getByRole("switch", { name: "Ocultar el botón del chat mientras el chat está abierto" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Ajustar las pestañas en varias filas en lugar de desplazarlas" })).toBeTruthy();
  });
});

describe("settings-interface-i18n", () => {
  it("covers every key in all 21 admin locales and falls back to English", () => {
    const keys = [
      "User Interface",
      "How the admin's controls behave for you. Saved per operator.",
      "Hide the chat button while the chat is open",
      "On: the chat panel's ✕ closes it. Off: the button stays on screen above the open panel and closes it.",
      "Wrap tabs instead of scrolling",
      "On: on narrow screens, tab rows wrap onto more lines so every tab is visible. Off: they stay on one row you swipe sideways.",
    ];
    const locales = ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"];
    for (const locale of locales) for (const key of keys) expect(t(locale, key), `${locale}: ${key}`).not.toBe(key);
    expect(t("es", "User Interface")).toBe("Interfaz de usuario");
    expect(t("unlisted-locale", "User Interface")).toBe("User Interface");
  });
});
