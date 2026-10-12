import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatSettingsDialog } from "../ChatSettingsDialog";
import { DEFAULT_CHAT_DISPLAY, type ChatDisplayPreferences } from "../chat-display-preferences";
import type { ChatDisplayPreferencesController } from "../hooks/use-chat-display-preferences.hooks";

/**
 * @file The dock gear's Chat settings dialog (owner, 2026-10-11): the Display tab's controls reflect
 * the controller's choices and call its `update`; ✕ closes; a failed save shows its line. The real
 * `SettingsDialogShell` renders; only the controller (the dialog's prop) is a fake.
 */

afterEach(() => cleanup());

const identity = (key: string) => key;

function controller(preferences: ChatDisplayPreferences = DEFAULT_CHAT_DISPLAY, saveFailed = false): ChatDisplayPreferencesController {
  return { preferences, update: vi.fn(), saveFailed };
}

function renderDialog(display: ChatDisplayPreferencesController, onClose = vi.fn()) {
  render(<ChatSettingsDialog locale="en" t={identity} display={display} onClose={onClose} />);
  return { onClose, dialog: screen.getByRole("dialog") };
}

describe("ChatSettingsDialog", () => {
  it("opens as a modal on <body> titled Chat settings, on the Display tab", () => {
    const { dialog } = renderDialog(controller());
    expect(document.body).toContainElement(dialog);
    expect(within(dialog).getAllByText("Chat settings").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Display").length).toBeGreaterThan(0);
  });

  it("marks the stored tool-call mode as pressed, and only that one", () => {
    const { dialog } = renderDialog(controller({ ...DEFAULT_CHAT_DISPLAY, toolCalls: "hidden" }));
    const group = within(dialog).getByRole("group", { name: "Tool calls" });

    expect(within(group).getByRole("button", { name: "Show" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("button", { name: "Collapsed" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("button", { name: "Hidden" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Hidden" })).toHaveClass("is-active");
  });

  it("picks a tool-call mode through update", async () => {
    const user = userEvent.setup();
    const display = controller();
    const { dialog } = renderDialog(display);

    await user.click(within(dialog).getByRole("button", { name: "Show" }));

    expect(display.update).toHaveBeenCalledWith({ toolCalls: "show" });
  });

  it("shows each switch's state and flips it through update", async () => {
    const user = userEvent.setup();
    const display = controller({ toolCalls: "collapsed", showUsageLine: true, showThinking: false });
    const { dialog } = renderDialog(display);
    const usage = within(dialog).getByRole("switch", { name: "Done line" });
    const thinking = within(dialog).getByRole("switch", { name: "Thinking" });

    expect(usage).toHaveAttribute("aria-checked", "true");
    expect(thinking).toHaveAttribute("aria-checked", "false");

    await user.click(usage);
    expect(display.update).toHaveBeenLastCalledWith({ showUsageLine: false });

    await user.click(thinking);
    expect(display.update).toHaveBeenLastCalledWith({ showThinking: true });
  });

  it("closes from its ✕", async () => {
    const user = userEvent.setup();
    const { dialog, onClose } = renderDialog(controller());

    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says when a save failed, and says nothing otherwise", () => {
    renderDialog(controller(DEFAULT_CHAT_DISPLAY, false));
    expect(screen.queryByText("Couldn't save. This choice lasts until you reload.")).not.toBeInTheDocument();
    cleanup();

    renderDialog(controller(DEFAULT_CHAT_DISPLAY, true));
    expect(screen.getByText("Couldn't save. This choice lasts until you reload.")).toHaveAttribute("role", "status");
  });
});
