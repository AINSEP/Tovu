import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmButton } from "../ConfirmButton";

/**
 * @file `ConfirmButton` — the shared two-click in-place confirm control closing the audit's
 * cross-cutting finding #1 ("Confirmation coverage is a coin flip",
 * `ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`). Pins the armed/disarmed
 * state machine independent of any one screen's wiring, following the same RTL harness
 * `Plugins.unit.test.tsx`/`AiAssistant.unit.test.tsx` already established for this package.
 */

describe("resting and armed states", () => {
  it("renders the resting label and does not call onConfirm on the first click", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    await user.click(button);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm delete" })).toBeInTheDocument();
  });

  it("announces the armed state through a live region distinct from the button label", async () => {
    const user = userEvent.setup();
    render(<ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("status")).toHaveTextContent(/confirm delete/i);
  });

  it("calls onConfirm exactly once on the second click and returns to the resting label", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("disarming without firing", () => {
  it("Escape disarms an armed control without calling onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.keyboard("{Escape}");

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("a mousedown outside the control disarms it without calling onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <div>
        <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={onConfirm} />
        <button type="button">elsewhere</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("losing focus (blur) disarms an armed control", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <div>
        <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={onConfirm} />
        <button type="button">next</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.tab();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("pending state", () => {
  it("shows the pending label, disables the control, and ignores clicks", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmButton
        label="Delete"
        confirmLabel="Confirm delete"
        pending
        pendingLabel="Deleting…"
        onConfirm={onConfirm}
      />
    );

    const button = screen.getByRole("button", { name: "Deleting…" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("styling and naming", () => {
  it("applies .btn-danger only when destructive is set", () => {
    const { rerender } = render(
      <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={vi.fn()} destructive />
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("btn-danger");

    rerender(<ConfirmButton label="Disable" confirmLabel="Confirm disable" onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Disable" })).not.toHaveClass("btn-danger");
  });

  it("uses ariaLabel as the accessible name when provided, without changing the visible label", () => {
    render(
      <ConfirmButton
        label="Delete"
        confirmLabel="Confirm delete"
        onConfirm={vi.fn()}
        ariaLabel='Delete role "Editor"'
      />
    );
    const button = screen.getByRole("button", { name: 'Delete role "Editor"' });
    expect(button).toHaveTextContent("Delete");
  });
});
