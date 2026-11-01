import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@jini-ai/chat/react", () => ({ useT: () => (key: string) => key }));

import { FolderPathButton } from "../FolderPathButton";

afterEach(() => {
  cleanup();
});

describe("FolderPathButton", () => {
  it("is a labelled button styled exactly like the composer's + and opens the picker", async () => {
    const onPick = vi.fn();
    render(<FolderPathButton picking={false} onPick={onPick} />);
    const button = screen.getByRole("button", { name: "Insert a folder path" });
    expect(button).toHaveAttribute("title", "Insert a folder path");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("jini-composer-attach");
    await userEvent.setup().click(button);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("is disabled while the dialog is open", () => {
    render(<FolderPathButton picking onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Insert a folder path" })).toBeDisabled();
  });

  // Owner bug 11-01: in a browser tab the dialog opens on the Mac running Tovu, and nothing in the
  // tab said so. While waiting, a browser tab says where the window is; the desktop app does not.
  const OPENED_ELSEWHERE = "Folder window opened on the computer running Tovu";

  it("says where the folder window opened while it is open in a browser tab", () => {
    render(<FolderPathButton picking remote onPick={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(OPENED_ELSEWHERE);
  });

  it("shows no status once the dialog closes, nor in the desktop app", () => {
    const { rerender } = render(<FolderPathButton picking={false} remote onPick={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<FolderPathButton picking onPick={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
