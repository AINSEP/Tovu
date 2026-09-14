import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/** @file `ui.spec.md` §1/§3.1/§5 — same "identity translation" `useT` mock convention
 *  `SlowRunNoticeCard.unit.test.tsx` uses. */
vi.mock("@jini-ai/chat/react", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? key.replace(/\{(\w+)\}/g, (_m, name: string) => String(vars[name] ?? `{${name}}`)) : key,
}));

import { FolderDropConfirmation } from "../FolderDropConfirmation";

afterEach(() => {
  cleanup();
});

describe("FolderDropConfirmation", () => {
  it("announces the path via role=\"status\" (ui.spec.md §5)", () => {
    render(<FolderDropConfirmation path="/Users/x/my-site" onDismiss={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("/Users/x/my-site");
  });

  it("words the confirmation as a first-time set when nothing was replaced", () => {
    render(<FolderDropConfirmation path="/Users/x/site" replacedPreviousPath={null} onDismiss={vi.fn()} />);
    expect(screen.getByRole("status").textContent).not.toMatch(/replac/i);
  });

  it("words the confirmation as a replacement when replacedPreviousPath is set (behavior.spec.md §1.2)", () => {
    render(<FolderDropConfirmation path="/Users/x/site-b" replacedPreviousPath="/Users/x/site-a" onDismiss={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toMatch(/replac/i);
  });

  it("calls onDismiss when the dismiss control is activated, and is reachable by keyboard", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<FolderDropConfirmation path="/Users/x/site" onDismiss={onDismiss} />);

    const dismissButton = screen.getByRole("button", { name: /dismiss/i });
    await user.tab();
    expect(dismissButton).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
