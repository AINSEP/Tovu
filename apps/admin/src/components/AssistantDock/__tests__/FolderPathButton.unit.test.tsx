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
});
