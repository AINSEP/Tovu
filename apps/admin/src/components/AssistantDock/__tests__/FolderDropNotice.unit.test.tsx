import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@jini-ai/chat/react", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? key.replace(/\{(\w+)\}/g, (_m, name: string) => String(vars[name] ?? `{${name}}`)) : key,
}));

import { FolderDropNotice } from "../FolderDropNotice";

afterEach(() => {
  cleanup();
});

describe("FolderDropNotice", () => {
  it("renders nothing when notice is null", () => {
    const { container } = render(<FolderDropNotice notice={null} onDismiss={vi.fn()} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for a pasted path when a dropped folder's path could not be read", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<FolderDropNotice notice={{ kind: "path-unavailable" }} onDismiss={onDismiss} onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Browsers can't share folder paths. Paste the path instead (Finder: ⌥⌘C, Explorer: Ctrl+Shift+C).");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("points at the folder button when this machine can open a folder dialog", () => {
    render(<FolderDropNotice notice={{ kind: "path-unavailable" }} canPickFolder onDismiss={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Browsers can't share folder paths. Use the folder button, or paste the path (Finder: ⌥⌘C, Explorer: Ctrl+Shift+C).");
  });

  it("renders FolderDropConfirmation for a confirmation notice", async () => {
    const onDismiss = vi.fn();
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <FolderDropNotice
        notice={{ kind: "confirmation", path: "/Users/x/site", replacedPreviousPath: "/Users/x/old" }}
        onDismiss={onDismiss}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The assistant can now read /Users/x/site, replacing the previous folder.");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("renders FolderDropError for an error notice — at most one notice visible at a time (ui.spec.md §4)", async () => {
    const onDismiss = vi.fn();
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <FolderDropNotice
        notice={{ kind: "error", path: "/Users/x/gone", reason: "does-not-exist" }}
        onDismiss={onDismiss}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("That folder couldn't be found.");
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledExactlyOnceWith({ path: "/Users/x/gone" });
    expect(onDismiss).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
