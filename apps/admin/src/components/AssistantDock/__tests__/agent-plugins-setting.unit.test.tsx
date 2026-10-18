import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { ChatSettingsDialog } from "@jini-ai/chat/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockSettingsMenu } from "../DockSettingsMenu";
import { dockSettingsMenuSections } from "../dock-header-rules";
import { DEFAULT_CHAT_DISPLAY } from "../chat-display-preferences";
import type { ChatAgentPlugins } from "../chat-agent-plugin-preferences";
import { useChatAgentPlugins, type ChatAgentPluginsPort } from "../hooks/use-chat-agent-plugins.hooks";
import { ASSISTANT_DOCK_DICT, t } from "../assistant-dock-i18n";

/**
 * @file The per-person "Agent plugins" chat setting (owner, 2026-10-18): Auto (default), Ask first or
 * Off, a radio group in the shared gear/More settings builder with ONE grouped ⓘ by its title, and
 * the hook that saves the choice through `chatAgentPluginsPreferencePort`'s shape.
 */

afterEach(cleanup);

const OPTIONS = [
  { label: "Auto", value: "auto", tooltip: 'Let the assistant use relevant installed plugins automatically. A "Using" chip shows which ones it loaded, and × stops future use in this chat.' },
  { label: "Ask first", value: "ask", tooltip: "Choose which matching plugins to use before they load. You'll be asked once in each chat that needs them." },
  { label: "Off", value: "off", tooltip: "Stop the assistant from loading plugins automatically. You can still choose a plugin yourself when you want it." },
] as const;
const TIP = OPTIONS.map(({ label, tooltip }) => `• ${label}: ${tooltip}`).join("\n");

function sectionsFor({ mode = "auto", update = vi.fn(), translate = (key: string) => key }: {
  mode?: ChatAgentPlugins; update?: (mode: ChatAgentPlugins) => void; translate?: (key: string) => string;
} = {}) {
  return dockSettingsMenuSections({ t: translate }, { display: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn() }, agentPlugins: { mode, update } });
}

describe("Agent plugins section", () => {
  it("is a radio group after the display rows with one grouped tip, checked from the current mode", () => {
    const update = vi.fn();
    const sections = sectionsFor({ mode: "ask", update });
    const section = sections.find((entry) => entry.key === "agent-plugins");
    expect(section).toBeDefined();
    expect(sections.map((entry) => entry.key)).toEqual(["tool-calls", "transcript", "agent-plugins"]);
    expect(section!.label).toBe("Agent plugins");
    expect(section!.tooltip).toBe(TIP);
    expect(section!.items.map(({ label, role, checked, tooltip }) => ({ label, role, checked, tooltip }))).toEqual([
      { label: "Auto", role: "menuitemradio", checked: false, tooltip: undefined },
      { label: "Ask first", role: "menuitemradio", checked: true, tooltip: undefined },
      { label: "Off", role: "menuitemradio", checked: false, tooltip: undefined },
    ]);
    for (const item of section!.items) item.onSelect?.();
    expect(update.mock.calls.map(([mode]) => mode)).toEqual(["auto", "ask", "off"]);
  });

  it("is left out when the host binds no plugin preference", () => {
    const sections = dockSettingsMenuSections({ t: (key) => key }, { display: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn() } });
    expect(sections.map((entry) => entry.key)).not.toContain("agent-plugins");
  });

  it.each(["gear", "dialog"] as const)("%s: one ⓘ after the title, none per option; tapping it changes nothing; choosing writes the mode", async (surface) => {
    const user = userEvent.setup(), update = vi.fn(), onClose = vi.fn();
    const sections = sectionsFor({ update });
    if (surface === "gear") {
      render(<DockSettingsMenu label="Settings" sections={sections} />);
      await user.click(screen.getByRole("button", { name: "Settings" }));
    } else {
      render(<ChatSettingsDialog open onClose={onClose} displaySections={sections}
        permissions={{ enabled: false, canEdit: true, capabilities: [], onChange: vi.fn() }} />);
    }
    const panel = screen.getByRole(surface === "gear" ? "menu" : "dialog");
    const group = within(panel).getByRole("group", { name: "Agent plugins" });
    const radios = within(group).getAllByRole(surface === "gear" ? "menuitemradio" : "radio");
    expect(radios.map((radio) => radio.textContent || (radio as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Auto", "Ask first", "Off"]);
    const icons = group.querySelectorAll<HTMLElement>(".info-tip-icon");
    expect(icons).toHaveLength(1);
    expect(icons[0]).toHaveAttribute("aria-label", TIP);
    expect(icons[0].closest(".info-tip")?.previousElementSibling).toHaveTextContent(/^Agent plugins$/);

    await user.pointer([{ keys: "[TouchA>]", target: icons[0] }, { keys: "[/TouchA]" }]);
    const bullets = [...document.querySelectorAll(".info-tip-bubble .info-tip-bullet")].map((line) => line.lastElementChild?.textContent);
    expect(bullets).toEqual(OPTIONS.map(({ label, tooltip }) => `${label}: ${tooltip}`));
    expect(update).not.toHaveBeenCalled();
    expect(panel).toBeVisible();
    fireEvent.keyDown(icons[0], { key: "Escape" });

    await user.click(radios[2]);
    expect(update).toHaveBeenCalledWith("off");
    expect(onClose).not.toHaveBeenCalled();
    if (surface === "gear") expect(screen.getByRole("menu")).toBeVisible();
  });

  it.each(["ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it", "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW"])("%s translates the label, options and copy", (locale) => {
    expect(Object.keys(ASSISTANT_DOCK_DICT)).toHaveLength(21);
    for (const key of ["Agent plugins", ...OPTIONS.flatMap(({ label, tooltip }) => [label, tooltip])]) {
      const translation = ASSISTANT_DOCK_DICT[locale][key];
      expect(translation, key).toEqual(expect.any(String));
      expect(translation.trim()).not.toBe("");
      expect(translation, key).not.toBe(key);
    }
    const section = sectionsFor({ translate: (key) => t(locale, key) }).find((entry) => entry.key === "agent-plugins")!;
    expect(section.tooltip).toBe(OPTIONS.map(({ label, tooltip }) => `• ${t(locale, label)}: ${t(locale, tooltip)}`).join("\n"));
  });
});

interface FakePort extends ChatAgentPluginsPort {
  stored: ChatAgentPlugins;
  saves: { next: ChatAgentPlugins; previous: ChatAgentPlugins }[];
  failSaves: boolean;
  refresh: () => void;
}

function fakePort(stored: ChatAgentPlugins = "auto"): FakePort {
  const listeners = new Set<() => void>();
  const port: FakePort = {
    stored,
    saves: [],
    failSaves: false,
    load: async () => port.stored,
    save: async ({ next, previous }) => {
      port.saves.push({ next, previous });
      if (port.failSaves) throw new Error("settings write failed");
      port.stored = next;
    },
    subscribe: ({ listener }) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh: () => listeners.forEach((listener) => listener()),
  };
  return port;
}

describe("useChatAgentPlugins", () => {
  it("is Auto until the stored mode arrives, then follows it", async () => {
    const port = fakePort("off");
    const { result } = renderHook(() => useChatAgentPlugins({ port }));
    expect(result.current.mode).toBe("auto");
    await waitFor(() => expect(result.current.mode).toBe("off"));
  });

  it("applies a choice at once and saves the diff for this person", async () => {
    const port = fakePort("auto");
    const { result } = renderHook(() => useChatAgentPlugins({ port }));
    await waitFor(() => expect(port.stored).toBe("auto"));
    act(() => result.current.update("off"));
    expect(result.current.mode).toBe("off");
    await waitFor(() => expect(port.saves).toEqual([{ next: "off", previous: "auto" }]));
    act(() => result.current.update("ask"));
    await waitFor(() => expect(port.saves.at(-1)).toEqual({ next: "ask", previous: "off" }));
    expect(result.current.saveFailed).toBe(false);
  });

  it("keeps the choice and reports a failed save", async () => {
    const port = fakePort("auto");
    port.failSaves = true;
    const { result } = renderHook(() => useChatAgentPlugins({ port }));
    act(() => result.current.update("ask"));
    await waitFor(() => expect(result.current.saveFailed).toBe(true));
    expect(result.current.mode).toBe("ask");
  });

  it("re-reads when another surface saves", async () => {
    const port = fakePort("auto");
    const { result } = renderHook(() => useChatAgentPlugins({ port }));
    await waitFor(() => expect(result.current.mode).toBe("auto"));
    port.stored = "ask";
    act(() => port.refresh());
    await waitFor(() => expect(result.current.mode).toBe("ask"));
  });
});
