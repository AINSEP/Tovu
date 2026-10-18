import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSettingsDialog } from "@jini-ai/chat/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockSettingsMenu } from "../DockSettingsMenu";
import { dockSettingsMenuSections, type DockSettingsMenuItem } from "../dock-header-rules";
import { DEFAULT_CHAT_DISPLAY } from "../chat-display-preferences";
import { ASSISTANT_DOCK_DICT, t } from "../assistant-dock-i18n";

afterEach(cleanup);

// @ts-expect-error hint was removed
({ key: "x", label: "x", hint: "x" } satisfies DockSettingsMenuItem);

const options = [
  { label: "Show", tooltip: "See each tool call as the assistant works. Open a card to inspect its details." },
  { label: "Collapsed", tooltip: "Keep tool calls together in one compact line per reply. Tap or click the line to see them." },
  { label: "Hidden", tooltip: "Hide routine tool calls to keep the conversation clear. Failed calls still appear so you can see what went wrong." },
  { label: "Done line", tooltip: "Show the time, cost, and running total below each reply. Some models may not report every detail." },
  { label: "Thinking", tooltip: "Show reasoning shared by the model, folded into the conversation. Some models do not provide it." },
];

describe.each(["gear", "dialog"] as const)("%s setting help", (surface) => {
  it.each(options)("tap opens $label help without selecting or closing; Escape and outside tap dismiss", async ({ label, tooltip }) => {
    const user = userEvent.setup(), update = vi.fn(), onClose = vi.fn();
    const sections = dockSettingsMenuSections({ t: key => key }, { display: { preferences: DEFAULT_CHAT_DISPLAY, update } });
    if (surface === "gear") {
      render(<DockSettingsMenu label="Settings" sections={sections} />);
      await user.click(screen.getByRole("button", { name: "Settings" }));
    } else {
      render(<ChatSettingsDialog open onClose={onClose} displaySections={sections}
        permissions={{ enabled: false, canEdit: true, capabilities: [], onChange: vi.fn() }} />);
    }
    const panel = screen.getByRole(surface === "gear" ? "menu" : "dialog");
    const radio = ["Show", "Collapsed", "Hidden"].includes(label);
    const control = within(panel).getByRole(surface === "gear" ? (radio ? "menuitemradio" : "menuitemcheckbox") : (radio ? "radio" : "switch"), { name: label });
    const before = surface === "gear" ? control.getAttribute("aria-checked") : (control as HTMLInputElement).checked;
    const help = within(panel).getByRole("button", { name: tooltip });
    expect(help.closest("button, label")).toBeNull();
    expect(control).not.toHaveAttribute("title");
    expect(control).toHaveAccessibleDescription(tooltip);

    await user.pointer([{ keys: "[TouchA>]", target: help }, { keys: "[/TouchA]" }]);
    expect(document.querySelector(".info-tip-bubble")).toHaveTextContent(tooltip);
    fireEvent.mouseLeave(help);
    expect(document.querySelector(".info-tip-bubble")).toHaveTextContent(tooltip);
    expect(surface === "gear" ? control.getAttribute("aria-checked") : (control as HTMLInputElement).checked).toBe(before);
    expect(update).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(panel).toBeVisible();
    if (surface === "gear") expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(help, { key: "Escape" });
    expect(document.querySelector(".info-tip-bubble")).toBeNull();
    expect(panel).toBeVisible();
    await user.pointer([{ keys: "[TouchB>]", target: help }, { keys: "[/TouchB]" }]);
    expect(document.querySelector(".info-tip-bubble")).toHaveTextContent(tooltip);
    await user.pointer([{ keys: "[TouchC>]", target: within(panel).getByText("Tool calls") }, { keys: "[/TouchC]" }]);
    expect(document.querySelector(".info-tip-bubble")).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(panel).toBeVisible();
  });
});

describe("chat setting tooltip translations", () => {
  it.each(["ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it", "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW"])("%s provides all five translated tooltips through the shared builder", locale => {
    const sections = dockSettingsMenuSections({ t: key => t(locale, key) }, { display: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn() } });
    expect(Object.keys(ASSISTANT_DOCK_DICT)).toHaveLength(21);
    const items = sections.flatMap(section => section.items);
    items.forEach(item => expect(item).not.toHaveProperty("hint"));
    for (const retired of [
      "Show: every tool call. Collapsed: one line per reply, click to open. Hidden: only failed calls.",
      "Time, cost and running total under each reply.",
      "Shows the model's reasoning when the agent shares it.",
    ]) expect(ASSISTANT_DOCK_DICT[locale]).not.toHaveProperty(retired);
    options.forEach(({ tooltip }, index) => {
      const translation = ASSISTANT_DOCK_DICT[locale][tooltip];
      expect(translation).toEqual(expect.any(String));
      expect(translation.trim()).not.toBe("");
      expect(translation).not.toBe(tooltip);
      expect(items[index].tooltip).toBe(translation);
    });
  });
});
