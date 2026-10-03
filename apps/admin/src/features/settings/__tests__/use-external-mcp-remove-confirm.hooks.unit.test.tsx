import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExternalMcpRemoveConfirmDialog } from "../ExternalMcpRemoveConfirmDialog";

// F2.3/F3.3/F6.2: use the real dialog, DOM listeners and focus trap; exercise update and unmount.
// Author Checklist: literal OAuth copy, exact callback delivery, real keyboard input, fresh renders.
describe("MCP removal confirmation lifecycle", () => {
  it("delivers each button action once and cancels only when the backdrop is clicked", async () => {
    // Author Checklist F2.4/F2.5/F6.1: real pointer delivery and exact callbacks.
    // Reject dropping stopPropagation, swapping Confirm/Cancel, or double delivery.
    const user = userEvent.setup();
    const actions: string[] = [];
    const onCancel = vi.fn(() => { actions.push("cancel"); });
    const onConfirm = vi.fn(() => { actions.push("confirm"); });
    render(<ExternalMcpRemoveConfirmDialog name="Atlas" isOAuth={false} cardHandle="atlas"
      t={(key) => key} onCancel={onCancel} onConfirm={onConfirm} />);
    const dialog = screen.getByRole("dialog", { name: 'Remove "Atlas"?' });
    await user.click(within(dialog).getByRole("heading"));
    expect(actions).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(actions).toEqual(["confirm"]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(actions).toEqual(["confirm", "cancel"]);
    await user.click(dialog.parentElement!);
    expect(actions).toEqual(["confirm", "cancel", "cancel"]);
  });

  it("keeps forward and reverse Tab inside the real dialog", async () => {
    // F2.4/F3.1: dropping dialogRef from the dialog lets Tab escape to Outside.
    // Author Checklist: real hook/ref/DOM focus; both boundary directions, no focus spy.
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<>
      <ExternalMcpRemoveConfirmDialog name="Atlas" isOAuth={false} cardHandle="atlas"
        t={(key) => key} onCancel={onCancel} onConfirm={onConfirm} />
      <button>Outside</button>
    </>);
    const dialog = screen.getByRole("dialog", { name: 'Remove "Atlas"?' });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const remove = within(dialog).getByRole("button", { name: "Remove" });
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(remove).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(remove).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("updates the Escape receiver and removes the listener on unmount", async () => {
    // Mutation: omit onCancel from the effect dependencies or omit removeEventListener.
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const props = { name: "Atlas", isOAuth: false, cardHandle: "atlas", t: (key: string) => key, onConfirm: vi.fn(), onCancel: first };
    const { rerender, unmount } = render(<ExternalMcpRemoveConfirmDialog {...props} />);
    await user.keyboard("x");
    expect(first).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(first.mock.calls).toEqual([[]]);
    rerender(<ExternalMcpRemoveConfirmDialog {...props} onCancel={second} />);
    await user.keyboard("{Escape}");
    expect(first.mock.calls).toEqual([[]]);
    expect(second.mock.calls).toEqual([[]]);
    unmount();
    await user.keyboard("{Escape}");
    expect(second.mock.calls).toEqual([[]]);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("changes the warning and server identity when switching from plain credentials to OAuth", () => {
    // Mutation: force isOAuth: false when building the copy; reconnect warning disappears.
    const props = { name: "Atlas", isOAuth: false, cardHandle: "atlas", t: (key: string) => key, onConfirm: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(<ExternalMcpRemoveConfirmDialog {...props} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName('Remove "Atlas"?');
    expect(screen.getByRole("dialog")).toHaveTextContent("This connection will stop working immediately. You'll need to re-enter its configuration to use it again.");
    rerender(<ExternalMcpRemoveConfirmDialog {...props} name="Boreal" isOAuth />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName('Remove "Boreal"?');
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Atlas");
    expect(screen.getByRole("dialog")).toHaveTextContent("This connection will stop working immediately. Its OAuth credential is sealed and cannot be recovered — reconnecting will require signing in again.");
  });
});
