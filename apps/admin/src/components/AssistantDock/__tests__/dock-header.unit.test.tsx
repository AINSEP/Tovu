import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockHeaderTip } from "../DockHeaderTip";
import { DockSettingsMenu } from "../DockSettingsMenu";
import { activateDockMenuItem, dockSettingsMenuItems, shouldShowHeaderTip } from "../dock-header-rules";

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

  it("does nothing for a disabled row and closes-then-runs an enabled one", () => {
    const selectItem = vi.fn();
    expect(activateDockMenuItem({ item: { key: "x", label: "X", disabled: true, onSelect: vi.fn() }, selectItem })).toBe(false);
    expect(selectItem).not.toHaveBeenCalled();

    const onSelect = vi.fn();
    expect(activateDockMenuItem({ item: { key: "x", label: "X", onSelect }, selectItem })).toBe(true);
    expect(selectItem).toHaveBeenCalledWith({ onSelect });
  });

  it("offers one row, which opens the Chat settings dialog", () => {
    const onOpenChatSettings = vi.fn();
    const items = dockSettingsMenuItems({ t: identity }, { onOpenChatSettings });
    expect(items).toEqual([{ key: "chat-settings", label: "Open chat settings…", onSelect: onOpenChatSettings }]);
  });
});

describe("DockSettingsMenu", () => {
  it("opens a menu whose row opens Chat settings, and closes on Escape, outside click and a second click", async () => {
    const user = userEvent.setup();
    const onOpenChatSettings = vi.fn();
    render(<DockSettingsMenu label="Settings" items={dockSettingsMenuItems({ t: identity }, { onOpenChatSettings })} />);
    const gear = screen.getByRole("button", { name: "Settings" });
    expect(gear).toHaveAttribute("aria-expanded", "false");

    await user.click(gear);
    const menu = screen.getByRole("menu", { name: "Settings" });
    const row = within(menu).getByRole("menuitem", { name: "Open chat settings…" });
    expect(row).not.toHaveAttribute("aria-disabled");
    expect(gear).toHaveAttribute("aria-expanded", "true");

    // Choosing the row closes the menu, then opens the dialog.
    await user.click(row);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onOpenChatSettings).toHaveBeenCalledTimes(1);

    await user.click(gear);
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
});

describe("DockHeaderTip", () => {
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
    render(<DockHeaderTip label="Settings"><DockSettingsMenu label="Settings" items={dockSettingsMenuItems({ t: identity }, { onOpenChatSettings: vi.fn() })} /></DockHeaderTip>);
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
