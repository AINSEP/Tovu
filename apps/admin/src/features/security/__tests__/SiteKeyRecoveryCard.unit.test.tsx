import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SiteKeyRecoveryCard } from "../SiteKeyRecoveryCard";
import type { SiteKeyRecoveryController } from "../hooks/use-site-key-recovery.hooks";

function recovery(overrides: Partial<SiteKeyRecoveryController> = {}): SiteKeyRecoveryController {
  return {
    siteKey: "", setSiteKey: vi.fn(), unlocking: false, unlockError: null, unlock: vi.fn(async () => {}),
    startFreshStep: "closed", preview: null, openStartFresh: vi.fn(async () => {}), cancelStartFresh: vi.fn(),
    confirmText: "", setConfirmText: vi.fn(), canConfirmStartFresh: false, startingFresh: false,
    startFreshError: null, startFresh: vi.fn(async () => {}), resultMessage: null, t: (key) => key, ...overrides,
  };
}

// Author Checklist F2.4/F2.5/F4.3/F6.2: render the actual card, drive real
// user clicks, inspect disabled controls and server error text; controller transitions
// are covered separately by use-site-key-recovery.unit.test.ts.
it("blocks empty and busy unlock attempts and renders the server's unlock error", async () => {
  // Reject: omit unlocking from disabled, or omit token.trim().
  const user = userEvent.setup();
  const ctrl = recovery({ siteKey: "   " });
  const { rerender } = render(<SiteKeyRecoveryCard recovery={ctrl} />);
  expect(screen.getByRole("heading", { name: "Your saved credentials are locked" })).toBeInTheDocument();
  const unlock = screen.getByRole("button", { name: "Unlock" });
  expect(unlock).toBeDisabled();
  await user.click(unlock);
  expect(ctrl.unlock).not.toHaveBeenCalled();
  rerender(<SiteKeyRecoveryCard recovery={{ ...ctrl, siteKey: "old-token", unlocking: true }} />);
  const busy = screen.getByRole("button", { name: "Unlocking…" });
  expect(busy).toBeDisabled();
  await user.click(busy);
  expect(ctrl.unlock).not.toHaveBeenCalled();
  rerender(<SiteKeyRecoveryCard recovery={{ ...ctrl, siteKey: "old-token", unlockError: "This site key does not open saved credentials." }} />);
  expect(screen.getByRole("status").textContent).toBe("This site key does not open saved credentials.");
  expect(screen.getByRole("button", { name: "Unlock" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Unlock" }));
  expect(vi.mocked(ctrl.unlock).mock.calls).toEqual([[]]);
});

it("shows the preview loading and busy confirmation states without permitting a destructive click", async () => {
  // Reject: loading falls through to confirm, or ignore canConfirmStartFresh.
  const user = userEvent.setup();
  let cancelled = false;
  const ctrl = recovery({ startFreshStep: "loading", cancelStartFresh: vi.fn(() => { cancelled = true; }) });
  const { rerender } = render(<SiteKeyRecoveryCard recovery={ctrl} />);
  expect(screen.getByText("Checking what would change…")).toBeInTheDocument();
  expect(screen.queryByLabelText("Type START FRESH to confirm")).not.toBeInTheDocument();
  rerender(<SiteKeyRecoveryCard recovery={{ ...ctrl, startFreshStep: "confirm", startingFresh: true, startFreshError: "Restore point unavailable" }} />);
  expect(screen.getByLabelText("Type START FRESH to confirm")).toHaveAttribute("placeholder", "START FRESH");
  expect(screen.getByRole("button", { name: "Starting fresh…" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Starting fresh…" }));
  expect(ctrl.startFresh).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("Restore point unavailable");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancelled).toBe(true);
  expect(ctrl.cancelStartFresh).toHaveBeenCalledTimes(1);
});
