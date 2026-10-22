import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSettingsDialog } from "@jini-ai/chat/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockSettingsMenu } from "../DockSettingsMenu";
import { dockSettingsMenuSections, groupOptionTooltips, type DockSettingsMenuItem } from "../dock-header-rules";
import { DEFAULT_CHAT_DISPLAY } from "../chat-display-preferences";
import { ASSISTANT_DOCK_DICT, t } from "../assistant-dock-i18n";
import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, visibleAssistantRuntimePreferences } from "../assistant-runtime-preferences";

afterEach(cleanup);

// @ts-expect-error hint was removed
({ key: "x", label: "x", hint: "x" } satisfies DockSettingsMenuItem);

const toolCallOptions = [
  { label: "Show", tooltip: "See each tool call as the assistant works. Open a card to inspect its details." },
  { label: "Collapsed", tooltip: "Keep tool calls together in one compact line per reply. Tap or click the line to see them." },
  { label: "Hidden", tooltip: "Hide routine tool calls to keep the conversation clear. Failed calls still appear so you can see what went wrong." },
];
const switches = [
  { label: "Done line", tooltip: "Show the time, cost, and running total below each reply. Some models may not report every detail." },
  { label: "Thinking", tooltip: "Show reasoning shared by the model, folded into the conversation. Some models do not provide it." },
];
const options = [...toolCallOptions, ...switches];
/** The one Tool calls tip: a "• Label: help" line per option (owner, 2026-10-18). */
const toolCallsTip = toolCallOptions.map(({ label, tooltip }) => `• ${label}: ${tooltip}`).join("\n");
const bubble = () => document.querySelector(".info-tip-bubble");
const replyLengthTip = "How much the assistant writes back. Short: just the result and what needs you.";

async function openSurface(surface: "gear" | "dialog") {
  const user = userEvent.setup(), update = vi.fn(), onClose = vi.fn();
  const sections = dockSettingsMenuSections({ t: key => key }, { display: { preferences: DEFAULT_CHAT_DISPLAY, update } });
  if (surface === "gear") {
    render(<DockSettingsMenu label="Settings" sections={sections} />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
  } else {
    render(<ChatSettingsDialog open onClose={onClose} displaySections={sections}
      permissions={{ enabled: false, canEdit: true, capabilities: [], onChange: vi.fn() }} />);
  }
  return { user, update, onClose, panel: screen.getByRole(surface === "gear" ? "menu" : "dialog") };
}

/** Taps `help`, then checks the tip opened with `text` and nothing else changed. */
async function expectTapShowsOnly({ surface, user, panel, help, controls, update, onClose }: {
  surface: "gear" | "dialog"; user: ReturnType<typeof userEvent.setup>; panel: HTMLElement; help: HTMLElement;
  controls: HTMLElement[]; update: () => void; onClose: () => void;
}) {
  const state = () => controls.map(control => surface === "gear" ? control.getAttribute("aria-checked") : (control as HTMLInputElement).checked);
  const before = state();
  await user.pointer([{ keys: "[TouchA>]", target: help }, { keys: "[/TouchA]" }]);
  expect(bubble()).not.toBeNull();
  fireEvent.mouseLeave(help);
  expect(bubble()).not.toBeNull();
  expect(state()).toEqual(before);
  expect(update).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(panel).toBeVisible();
  if (surface === "gear") expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "true");
}

describe.each(["gear", "dialog"] as const)("%s setting help", (surface) => {
  it("Tool calls has ONE ⓘ beside its title that lists Show, Collapsed and Hidden; tapping it changes nothing", async () => {
    const { user, update, onClose, panel } = await openSurface(surface);
    const group = within(panel).getByRole("group", { name: "Tool calls" });
    const radios = within(group).getAllByRole(surface === "gear" ? "menuitemradio" : "radio");
    expect(radios.map(radio => radio.textContent || (radio as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Show", "Collapsed", "Hidden"]);
    // No ⓘ per option: the group's only help icon is the one after its title.
    const icons = group.querySelectorAll<HTMLElement>(".info-tip-icon");
    expect(icons).toHaveLength(1);
    const help = icons[0];
    expect(help).toHaveAttribute("role", "button");
    expect(help).toHaveAttribute("aria-label", toolCallsTip);
    expect(help.closest("button, label")).toBeNull();
    expect(help.closest(".info-tip")?.previousElementSibling).toHaveTextContent(/^Tool calls$/);
    radios.forEach(radio => expect(radio).not.toHaveAttribute("aria-describedby"));
    expect(document.getElementById(group.getAttribute("aria-describedby")!.split(" ").at(-1)!)?.textContent).toBe(toolCallsTip);

    await expectTapShowsOnly({ surface, user, panel, help, controls: radios, update, onClose });
    const bullets = [...bubble()!.querySelectorAll(".info-tip-bullet")].map(line => line.lastElementChild?.textContent);
    expect(bullets).toEqual(toolCallOptions.map(({ label, tooltip }) => `${label}: ${tooltip}`));

    fireEvent.keyDown(help, { key: "Escape" });
    expect(bubble()).toBeNull();
    expect(panel).toBeVisible();
    await user.pointer([{ keys: "[TouchB>]", target: help }, { keys: "[/TouchB]" }]);
    expect(bubble()).not.toBeNull();
    await user.pointer([{ keys: "[TouchC>]", target: within(panel).getByText("Tool calls") }, { keys: "[/TouchC]" }]);
    expect(bubble()).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(panel).toBeVisible();
  });

  it.each(switches)("$label keeps its own ⓘ; tap opens it without toggling or closing", async ({ label, tooltip }) => {
    const { user, update, onClose, panel } = await openSurface(surface);
    const control = within(panel).getByRole(surface === "gear" ? "menuitemcheckbox" : "switch", { name: label });
    const help = within(panel).getByRole("button", { name: tooltip });
    expect(help.closest("button, label")).toBeNull();
    expect(control).not.toHaveAttribute("title");
    expect(control).toHaveAccessibleDescription(tooltip);
    await expectTapShowsOnly({ surface, user, panel, help, controls: [control], update, onClose });
    expect(bubble()).toHaveTextContent(tooltip);
    fireEvent.keyDown(help, { key: "Escape" });
    expect(bubble()).toBeNull();
    expect(panel).toBeVisible();
  });
});

describe("chat setting tooltip translations", () => {
  it.each(Object.keys(ASSISTANT_DOCK_DICT))("%s translates Reply length, every option and its tooltip", locale => {
    for (const key of ["Reply length", "Short", "Normal", "Detailed", replyLengthTip]) {
      expect(ASSISTANT_DOCK_DICT[locale][key]?.trim()).toBeTruthy();
      expect(t(locale, key)).toBe(ASSISTANT_DOCK_DICT[locale][key]);
    }
    expect(t(locale, replyLengthTip)).not.toBe(replyLengthTip);
    const sections = dockSettingsMenuSections({ t: key => t(locale, key) }, {
      display: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn() },
      runtime: { preferences: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, update: vi.fn(), visible: visibleAssistantRuntimePreferences({ agent: undefined }) },
    });
    expect(sections.find(section => section.key === "reply-length")?.tooltip).toBe(t(locale, replyLengthTip));
  });

  it.each(["ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it", "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW"])("%s provides all five translated tooltips through the shared builder, Tool calls as one grouped tip", locale => {
    const sections = dockSettingsMenuSections({ t: key => t(locale, key) }, { display: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn() } });
    expect(Object.keys(ASSISTANT_DOCK_DICT)).toHaveLength(21);
    const items = sections.flatMap(section => section.items);
    items.forEach(item => expect(item).not.toHaveProperty("hint"));
    for (const retired of [
      "Show: every tool call. Collapsed: one line per reply, click to open. Hidden: only failed calls.",
      "Time, cost and running total under each reply.",
      "Shows the model's reasoning when the agent shares it.",
    ]) expect(ASSISTANT_DOCK_DICT[locale]).not.toHaveProperty(retired);
    const translated = options.map(({ tooltip }) => {
      const translation = ASSISTANT_DOCK_DICT[locale][tooltip];
      expect(translation).toEqual(expect.any(String));
      expect(translation.trim()).not.toBe("");
      expect(translation).not.toBe(tooltip);
      return translation;
    });
    // The three Tool calls lines sit in the group's one tip, each under its translated option name.
    expect(sections[0].tooltip).toBe(toolCallOptions.map(({ label }, index) => `• ${t(locale, label)}: ${translated[index]}`).join("\n"));
    expect(items.slice(0, 3).map(item => item.tooltip)).toEqual([undefined, undefined, undefined]);
    expect(items.slice(3, 5).map(item => item.tooltip)).toEqual(translated.slice(3));
  });
});

it("Reply length has one info tooltip beside its heading; tapping it leaves the selection and menu unchanged", async () => {
  const user = userEvent.setup(), update = vi.fn(), onClose = vi.fn();
  const sections = dockSettingsMenuSections({ t: key => key }, {
    display: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn() },
    runtime: { preferences: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, update, visible: visibleAssistantRuntimePreferences({ agent: undefined }) },
  });
  render(<DockSettingsMenu label="Settings" sections={sections} />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const panel = screen.getByRole("menu");
  const group = within(panel).getByRole("group", { name: "Reply length" });
  expect(group.querySelectorAll(".info-tip-icon")).toHaveLength(1);
  const help = within(group).getByRole("button", { name: replyLengthTip });
  expect(help.closest(".info-tip")?.previousElementSibling).toHaveTextContent(/^Reply length$/);
  expect(group).toHaveAccessibleDescription(replyLengthTip);
  await expectTapShowsOnly({ surface: "gear", user, panel, help, controls: within(group).getAllByRole("menuitemradio"), update, onClose });
  expect(bubble()).toHaveTextContent(replyLengthTip);
});

describe("groupOptionTooltips", () => {
  const radio = (key: string, tooltip?: string): DockSettingsMenuItem => ({ key, label: key.toUpperCase(), role: "menuitemradio", ...(tooltip ? { tooltip } : {}) });
  it("folds a radio group's option help into one bulleted section tip", () => {
    expect(groupOptionTooltips({ key: "g", label: "G", items: [radio("a", "Alpha."), radio("b"), radio("c", "Gamma.")] }))
      .toEqual({ key: "g", label: "G", tooltip: "• A: Alpha.\n• C: Gamma.", items: [radio("a"), radio("b"), radio("c")] });
  });
  it("leaves toggles, plain rows and help-less radio groups as they are", () => {
    const toggles = { key: "t", items: [{ key: "x", label: "X", role: "menuitemcheckbox" as const, tooltip: "Own tip." }] };
    const bare = { key: "r", items: [radio("a"), radio("b")] };
    expect(groupOptionTooltips(toggles)).toBe(toggles);
    expect(groupOptionTooltips(bare)).toBe(bare);
  });
});
