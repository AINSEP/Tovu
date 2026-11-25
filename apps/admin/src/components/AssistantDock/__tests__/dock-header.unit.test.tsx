import { cleanup, fireEvent, render, screen, within } from "@/__tests__/render-with-jini-kits";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useInfoTip } from "@jini-ai/ui/admin-widgets";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockHeaderTip } from "@jini-ai/admin/shell/components/AssistantDock/DockHeaderTip";
import { useDockHeaderTip } from "@jini-ai/admin/shell/components/AssistantDock/DockHeaderTip.hooks";
import { ChatSettingsSegmented } from "@jini-ai/chat/react";
import { DockSettingsMenu } from "@jini-ai/admin/shell/components/AssistantDock/DockSettingsMenu";
import { useTaxonomyRowMenu } from "@jini-ai/admin/screens/taxonomy/TaxonomyRowMenu.hooks";
import { dockSettingsMenuSections } from "@jini-ai/admin/shell/components/AssistantDock/dock-header-rules";
import { CHAT_TOOL_CALL_OPTIONS, DEFAULT_CHAT_DISPLAY } from "@jini-ai/admin/shell/components/AssistantDock/chat-display-preferences";
import type { ChatDisplayPreferences } from "@jini-ai/admin/shell/components/AssistantDock/hooks/use-chat-display-preferences.hooks";
import { REPLY_LENGTH_OPTIONS, DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, visibleAssistantRuntimePreferences } from "@jini-ai/admin/shell/components/AssistantDock/assistant-runtime-preferences";

/**
 * @file The dock header's gear menu and white icon tooltips (owner, 2026-10-11). Real hooks, real
 * DOM: the shared `useInfoTip` and the row-menu hook run unfaked; only callbacks are spies.
 */

afterEach(() => cleanup());

const identity = (key: string) => key;

function bubble() {
  return document.body.querySelector(".info-tip-bubble");
}

describe("dock header rules", () => {
  it("offers all reply lengths for every runtime, with Normal selected and only the selected preference patched", () => {
    const update = vi.fn();
    const sections = dockSettingsMenuSections({ t: identity, toolCallOptions: CHAT_TOOL_CALL_OPTIONS, replyLengthOptions: REPLY_LENGTH_OPTIONS }, {
      display: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn() },
      runtime: { preferences: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, update, visible: visibleAssistantRuntimePreferences({ agent: undefined }) },
    });
    const replyLength = sections.find(section => section.key === "reply-length")!;
    expect(replyLength.label).toBe("Reply length");
    expect(replyLength.tooltip).toBe("How much the assistant writes back. Short: just the result and what needs you.");
    expect(replyLength.items.map(({ label, role, checked }) => ({ label, role, checked }))).toEqual([
      { label: "Short", role: "menuitemradio", checked: false },
      { label: "Normal", role: "menuitemradio", checked: true },
      { label: "Detailed", role: "menuitemradio", checked: false },
    ]);
    for (const item of replyLength.items) item.onSelect?.();
    expect(update.mock.calls).toEqual([[{ replyLength: "short" }], [{ replyLength: "normal" }], [{ replyLength: "detailed" }]]);
  });

  it("puts Tool calls, Done line and Thinking in the menu, checked from the current choices", () => {
    const update = vi.fn();
    const sections = dockSettingsMenuSections({ t: identity, toolCallOptions: CHAT_TOOL_CALL_OPTIONS, replyLengthOptions: REPLY_LENGTH_OPTIONS }, { display: { preferences: DEFAULT_CHAT_DISPLAY, update } });
    expect(sections.map((section) => section.label)).toEqual(["Tool calls", undefined]);
    expect(sections.flatMap((section) => section.items.map(({ label, role, checked }) => ({ label, role, checked })))).toEqual([
      { label: "Show", role: "menuitemradio", checked: false },
      { label: "Collapsed", role: "menuitemradio", checked: true },
      { label: "Hidden", role: "menuitemradio", checked: false },
      { label: "Done line", role: "menuitemcheckbox", checked: true },
      { label: "Thinking", role: "menuitemcheckbox", checked: false },
    ]);
    for (const item of sections.flatMap((section) => section.items)) item.onSelect?.();
    expect(update.mock.calls.map(([patch]) => patch)).toEqual([
      { toolCalls: "show" }, { toolCalls: "collapsed" }, { toolCalls: "hidden" }, { showUsageLine: false }, { showThinking: true },
    ]);
  });
});

/** Local-state stand-in for the stored choices, so the menu re-renders as a real save would. */
function SettingsMenuHarness({ notice }: { notice?: string }) {
  const [preferences, setPreferences] = useState(DEFAULT_CHAT_DISPLAY);
  const update = (patch: Partial<ChatDisplayPreferences>) => setPreferences((current) => ({ ...current, ...patch }));
  return <DockSettingsMenu label="Settings" sections={dockSettingsMenuSections({ t: identity, toolCallOptions: CHAT_TOOL_CALL_OPTIONS, replyLengthOptions: REPLY_LENGTH_OPTIONS }, { display: { preferences, update } })} notice={notice}
    useTaxonomyRowMenuHook={useTaxonomyRowMenu} ChatSettingsSegmented={ChatSettingsSegmented} />;
}

describe("DockSettingsMenu", () => {
  it("navigates from the clicked setting after opening with the mouse, including wraparound", async () => {
    const user = userEvent.setup();
    render(<SettingsMenuHarness />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    // Tool calls is one segmented control, so its stop is the checked option (owner, 2026-10-21).
    expect(screen.getByRole("menuitemradio", { name: "Collapsed" })).toHaveFocus();
    await user.click(screen.getByRole("menuitemradio", { name: "Hidden" }));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemcheckbox", { name: "Done line" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitemradio", { name: "Hidden" })).toHaveFocus();
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Thinking" }));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Hidden" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitemcheckbox", { name: "Thinking" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitemradio", { name: "Hidden" })).toHaveFocus();
    await user.keyboard("{End}{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
  });

  it("picks within the segmented control with Left/Right and keeps the menu open", async () => {
    const user = userEvent.setup();
    render(<SettingsMenuHarness />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitemradio", { name: "Hidden" })).toHaveFocus();
    expect(screen.getByRole("menuitemradio", { name: "Hidden" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("menuitemradio", { name: "Show" })).toHaveFocus();
    expect(screen.getByRole("menuitemradio", { name: "Show" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Collapsed" })).toHaveAttribute("aria-checked", "false");
    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(screen.getByRole("menuitemradio", { name: "Show" })).toHaveFocus();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("changes settings in place with the menu left open, and closes on Escape, outside click and a second click", async () => {
    const user = userEvent.setup();
    render(<SettingsMenuHarness />);
    const gear = screen.getByRole("button", { name: "Settings" });
    expect(gear).toHaveAttribute("aria-expanded", "false");

    await user.click(gear);
    const menu = screen.getByRole("menu", { name: "Settings" });
    expect(gear).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("group", { name: "Tool calls" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "Collapsed" })).toHaveAttribute("aria-checked", "true");
    // No modal behind the gear any more.
    expect(within(menu).queryByRole("menuitem")).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitemradio", { name: "Hidden" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "Hidden" })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemradio", { name: "Collapsed" })).toHaveAttribute("aria-checked", "false");

    await user.click(within(menu).getByRole("menuitemcheckbox", { name: "Done line" }));
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Done line" })).toHaveAttribute("aria-checked", "false");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Done line" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(gear).toHaveFocus();

    await user.click(gear);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(gear);
    await user.click(gear);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves through the rows with the arrow keys and toggles with Enter", async () => {
    const user = userEvent.setup();
    render(<SettingsMenuHarness />);
    screen.getByRole("button", { name: "Settings" }).focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Collapsed" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitemcheckbox", { name: "Thinking" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitemcheckbox", { name: "Thinking" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Collapsed" })).toHaveFocus();
  });

  it("shows a failed save as a status line under the rows", async () => {
    const user = userEvent.setup();
    render(<SettingsMenuHarness notice="Couldn't save." />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(within(screen.getByRole("menu")).getByRole("status")).toHaveTextContent("Couldn't save.");
  });
});

describe("DockHeaderTip", () => {
  it("uses the injected tooltip controller with bottom placement", async () => {
    const useTip = vi.fn(useInfoTip);
    render(<DockHeaderTip label="Chats" useTip={() => useDockHeaderTip({ useTip })}>
      <button type="button" aria-label="Chats">c</button>
    </DockHeaderTip>);

    await userEvent.setup().hover(screen.getByRole("button", { name: "Chats" }));

    expect(useTip).toHaveBeenCalledWith({}, { placement: "bottom" });
    expect(bubble()).toHaveTextContent("Chats");
    expect(bubble()).toHaveClass("info-tip-bubble-below");
  });

  it("opens on focus, keeps the tip for other keys, and dismisses on Escape or blur", async () => {
    const user = userEvent.setup();
    render(<DockHeaderTip label="Chats"><button type="button" aria-label="Chats">c</button></DockHeaderTip>);
    const button = screen.getByRole("button", { name: "Chats" });

    fireEvent.keyDown(button, { key: "Escape" });
    expect(bubble()).toBeNull();
    await user.tab();
    expect(button).toHaveFocus();
    expect(bubble()).toHaveTextContent("Chats");
    await user.keyboard("{ArrowRight}");
    expect(bubble()).toHaveTextContent("Chats");
    await user.keyboard("{Escape}");
    expect(bubble()).toBeNull();

    await user.tab();
    await user.tab({ shift: true });
    expect(bubble()).toHaveTextContent("Chats");
    await user.tab();
    expect(bubble()).toBeNull();
  });

  it("shows the white bubble under the button on hover and hides it on leave and on click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DockHeaderTip label="Close AI chat"><button type="button" aria-label="Close AI chat" onClick={onClick}>x</button></DockHeaderTip>);
    const button = screen.getByRole("button", { name: "Close AI chat" });

    await user.hover(button);
    expect(bubble()).toHaveTextContent("Close AI chat");
    expect(bubble()).toHaveClass("info-tip-bubble-below");
    expect(bubble()).toHaveAttribute("aria-hidden", "true");

    await user.unhover(button);
    expect(bubble()).toBeNull();

    await user.hover(button);
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(bubble()).toBeNull();
  });

  it("stays hidden over the gear while its menu is open", async () => {
    const user = userEvent.setup();
    render(<DockHeaderTip label="Settings"><SettingsMenuHarness /></DockHeaderTip>);
    const gear = screen.getByRole("button", { name: "Settings" });

    await user.click(gear);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(bubble()).toBeNull();

    await user.unhover(gear);
    await user.hover(gear);
    expect(bubble()).toBeNull();
  });

  it("leaves native title ownership with the wrapped control across rerenders", () => {
    function Wrapped({ title }: { title: string }) {
      return <DockHeaderTip label="Chats"><button type="button" title={title}>c</button></DockHeaderTip>;
    }
    const { rerender } = render(<Wrapped title="First chat" />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "First chat");

    rerender(<Wrapped title="Second chat" />);
    expect(button).toHaveAttribute("title", "Second chat");
  });
});
