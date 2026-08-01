import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "../ConfirmDialog";

/**
 * @file `ConfirmDialog` — the native-`<dialog>` modal confirm primitive replacing `window.confirm`
 * (see the component's own file header for the full rationale and the jsdom `showModal`/`close`
 * guard this pins). jsdom 29 (this package's test environment) implements neither `showModal` nor
 * `close`, so these tests exercise the parts of the contract that do not depend on the browser's
 * real top-layer mechanics: rendered content, initial focus, the native `cancel` event (what a
 * real browser dispatches on Escape), backdrop-click detection, destructive styling, the pending
 * state, and focus restoration on close.
 */

const noop = () => {};

describe("rendering and focus", () => {
  it("renders the title and body, and focuses the cancel action rather than confirm", () => {
    render(
      <ConfirmDialog
        open
        title="Move to trash?"
        body={<p>Move &quot;My Post&quot; to trash?</p>}
        confirmLabel="Move to trash"
        onConfirm={noop}
        onCancel={noop}
      />
    );

    expect(screen.getByRole("heading", { name: "Move to trash?" })).toBeInTheDocument();
    expect(screen.getByText('Move "My Post" to trash?')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("uses a custom cancel label when provided", () => {
    render(
      <ConfirmDialog
        open
        title="t"
        body={null}
        confirmLabel="Confirm"
        cancelLabel="Never mind"
        onConfirm={noop}
        onCancel={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Never mind" })).toBeInTheDocument();
  });
});

describe("styling", () => {
  it("applies .btn-danger to confirm only when destructive, never to cancel", () => {
    const { rerender } = render(
      <ConfirmDialog open title="t" body={null} confirmLabel="Delete" destructive onConfirm={noop} onCancel={noop} />
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("btn-danger");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("btn-secondary");
    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveClass("btn-danger");

    rerender(<ConfirmDialog open title="t" body={null} confirmLabel="Disable" onConfirm={noop} onCancel={noop} />);
    expect(screen.getByRole("button", { name: "Disable" })).not.toHaveClass("btn-danger");
  });
});

/**
 * Three-tier tone API (MSG-07): `tone` is the current API; `destructive` is kept working
 * (deprecated, mapped to `tone: "danger"`) for existing callers rather than a breaking rename.
 */
describe("tone", () => {
  it("applies no class for the default tone", () => {
    render(<ConfirmDialog open title="t" body={null} confirmLabel="Confirm" onConfirm={noop} onCancel={noop} />);
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).not.toHaveClass("btn-warning");
    expect(confirm).not.toHaveClass("btn-danger");
  });

  it('applies .btn-warning for tone: "warning"', () => {
    render(
      <ConfirmDialog open title="t" body={null} confirmLabel="Disable" tone="warning" onConfirm={noop} onCancel={noop} />
    );
    const confirm = screen.getByRole("button", { name: "Disable" });
    expect(confirm).toHaveClass("btn-warning");
    expect(confirm).not.toHaveClass("btn-danger");
  });

  it('applies .btn-danger for tone: "danger"', () => {
    render(
      <ConfirmDialog open title="t" body={null} confirmLabel="Delete" tone="danger" onConfirm={noop} onCancel={noop} />
    );
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm).toHaveClass("btn-danger");
    expect(confirm).not.toHaveClass("btn-warning");
  });

  it("maps the deprecated destructive: true to .btn-danger for callers that haven't migrated", () => {
    render(
      <ConfirmDialog open title="t" body={null} confirmLabel="Delete" destructive onConfirm={noop} onCancel={noop} />
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("btn-danger");
  });

  it("prefers tone over destructive when both are passed", () => {
    render(
      <ConfirmDialog
        open
        title="t"
        body={null}
        confirmLabel="Disable"
        destructive
        tone="warning"
        onConfirm={noop}
        onCancel={noop}
      />
    );
    const confirm = screen.getByRole("button", { name: "Disable" });
    expect(confirm).toHaveClass("btn-warning");
    expect(confirm).not.toHaveClass("btn-danger");
  });
});

describe("pending state", () => {
  it("disables both actions while pending", () => {
    render(<ConfirmDialog open title="t" body={null} confirmLabel="Delete" pending onConfirm={noop} onCancel={noop} />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("ignores the native cancel event while pending", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog open title="t" body={null} confirmLabel="Delete" pending onConfirm={noop} onCancel={onCancel} />
    );
    const dialog = container.querySelector("dialog")!;
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("dismissal", () => {
  it("calls onCancel (not onConfirm) on the native cancel event — what a real browser fires on Escape", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog open title="t" body={null} confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />
    );
    const dialog = container.querySelector("dialog")!;
    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when the click lands on the dialog element itself (the backdrop area)", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog open title="t" body={<p>body</p>} confirmLabel="Delete" onConfirm={noop} onCancel={onCancel} />
    );
    const dialog = container.querySelector("dialog")!;
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel when the click lands on dialog content", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="t" body={<p>body</p>} confirmLabel="Delete" onConfirm={noop} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole("heading", { name: "t" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onConfirm on a confirm click and onCancel on a cancel click", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="t" body={null} confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("focus restoration", () => {
  /** Mirrors the real caller shape (`Posts.tsx`/`Pages.tsx`): a trigger toggles `open`, the
   *  dialog stays mounted the whole time. */
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Delete
        </button>
        <ConfirmDialog
          open={open}
          title="t"
          body={null}
          confirmLabel="Confirm delete"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </div>
    );
  }

  it("returns focus to whatever was focused before the dialog opened", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Delete" });
    await user.click(trigger);
    expect(trigger).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
  });
});

/**
 * Regression for a live a11y bug: `Roles.tsx` mounts two `ConfirmDialog`s unconditionally
 * (role-delete and policy-delete, both stay-mounted/toggle-`open`, same shape as the
 * `focus restoration` harness above). The title `<h2>`'s id used to be a hardcoded string literal
 * shared by every instance — with both dialogs mounted, `aria-labelledby` (which resolves via
 * `getElementById`, exactly like `document.getElementById` below) always returned the FIRST `<h2>`
 * in document order, so the policy dialog announced as "Delete role?" to a screen reader while the
 * operator was about to confirm a destructive action. Fixed with `useId()`; this pins it so a
 * future edit can't reintroduce a literal id without a red test.
 */
describe("multiple instances (Roles.tsx's shape — two ConfirmDialogs stay mounted at once)", () => {
  it("gives each instance a distinct heading id, and each dialog's aria-labelledby resolves to its own title", () => {
    const { container } = render(
      <div>
        <ConfirmDialog open title="Delete role?" body={null} confirmLabel="Delete" onConfirm={noop} onCancel={noop} />
        <ConfirmDialog open title="Delete policy?" body={null} confirmLabel="Delete" onConfirm={noop} onCancel={noop} />
      </div>
    );

    const dialogs = Array.from(container.querySelectorAll("dialog"));
    expect(dialogs).toHaveLength(2);

    const headingIds = dialogs.map((d) => d.querySelector("h2")!.id);
    expect(headingIds[0]).not.toBe("");
    expect(headingIds[1]).not.toBe("");
    expect(new Set(headingIds).size).toBe(2);

    for (const dialog of dialogs) {
      const labelledbyId = dialog.getAttribute("aria-labelledby")!;
      const resolved = document.getElementById(labelledbyId);
      expect(resolved).toBe(dialog.querySelector("h2"));
    }

    expect(dialogs[0].querySelector("h2")).toHaveTextContent("Delete role?");
    expect(dialogs[1].querySelector("h2")).toHaveTextContent("Delete policy?");
  });
});
