import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@jini-ai/chat/react", () => ({
  useT: () => (key: string) => key,
}));

import { FolderDropError } from "../FolderDropError";

afterEach(() => {
  cleanup();
});

describe("FolderDropError", () => {
  it("announces via role=\"alert\" (ui.spec.md §5)", () => {
    render(<FolderDropError path="/Users/x/gone" reason="does-not-exist" onRetry={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it.each([
    ["not-a-directory", /not a folder/i],
    ["does-not-exist", /couldn't be found/i],
    ["endpoint-unreachable", /try again in a moment/i],
  ] as const)("shows one of the three fixed, plain-language strings for reason=%s — never a raw server error", (reason, expected) => {
    render(<FolderDropError path="/Users/x/p" reason={reason} onRetry={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toMatch(expected);
  });

  it("the retry control's accessible name includes the word \"retry\", not just an icon (ui.spec.md §5)", () => {
    render(<FolderDropError path="/Users/x/p" reason="does-not-exist" onRetry={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls onRetry with the original path when retry is activated", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<FolderDropError path="/Users/x/gone" reason="does-not-exist" onRetry={onRetry} onDismiss={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith({ path: "/Users/x/gone" });
  });

  it("calls onDismiss when dismissed", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<FolderDropError path="/Users/x/gone" reason="does-not-exist" onRetry={vi.fn()} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
