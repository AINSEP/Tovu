import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useInfoTip } from "@jini-ai/ui/admin-widgets";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockHeaderTip } from "../DockHeaderTip";
import { useDockHeaderTip } from "../DockHeaderTip.hooks";
import { DockSettingsMenu } from "../DockSettingsMenu";
import { activateDockMenuItem, dockSettingsMenuSections, shouldShowHeaderTip } from "../dock-header-rules";
import { DEFAULT_CHAT_DISPLAY, type ChatDisplayPreferences } from "../chat-display-preferences";

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
  it("shows the tip for a closed control, never for an open one or anything inside its menu", () => {
    const root = document.createElement("div");
    root.innerHTML = `<button id="closed" aria-expanded="false"></button>
      <button id="open" aria-expanded="true"><i id="glyph"></i></button>
      <div role="menu"><input id="search" /></div>`;
    expect(shouldShowHeaderTip({ target: root.querySelector("#closed") })).toBe(true);
    expect(shouldShowHeaderTip({ target: root.querySelector("#glyph") })).toBe(false);
    expect(shouldShowHeaderTip({ target: root.querySelector("#search") })).toBe(false);
    expect(shouldShowHeaderTip({ target: null })).toBe(false);
  });

  it("does nothing for a disabled row, closes-then-runs an action row, and applies a setting row in place", () => {
    const selectItem = vi.fn();
    expect(activateDockMenuItem({ item: { key: "x", label: "X", disabled: true, onSelect: vi.fn() }, selectItem })).toBe(false);
    expect(selectItem).not.toHaveBeenCalled();

    const onSelect = vi.fn();
    expect(activateDockMenuItem({ item: { key: "x", label: "X", onSelect }, selectItem })).toBe(true);
    expect(selectItem).toHaveBeenCalledWith({ onSelect });

    selectItem.mockClear();
    const onToggle = vi.fn();
    expect(activateDockMenuItem({ item: { key: "y", label: "Y", role: "menuitemcheckbox", onSelect: onToggle }, selectItem })).toBe(true);
    expect(activateDockMenuItem({ item: { key: "z", label: "Z", role: "menuitemradio", onSelect: onToggle }, selectItem })).toBe(true);
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(selectItem).not.toHaveBeenCalled();
  });

  it("puts Tool calls, Done line and Thinking in the menu, checked from the current choices", () => {
    const update = vi.fn();
    const sections = dockSettingsMenuSections({ t: identity }, { display: { preferences: DEFAULT_CHAT_DISPLAY, update } });
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
  return <DockSettingsMenu label="Settings" sections={dockSettingsMenuSections({ t: identity }, { display: { preferences, update } })} notice={notice} />;
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
    render(<DockHeaderTip label="Chats" useTip={() => useDockHeaderTip({}, { useTip })}>
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
