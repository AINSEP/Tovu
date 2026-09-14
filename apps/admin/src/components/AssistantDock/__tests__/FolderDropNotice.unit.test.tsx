import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@jini-ai/chat/react", () => ({
  useT: () => (key: string) => key,
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

  it("renders FolderDropConfirmation for a confirmation notice", () => {
    render(
      <FolderDropNotice
        notice={{ kind: "confirmation", path: "/Users/x/site", replacedPreviousPath: null }}
        onDismiss={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders FolderDropError for an error notice — at most one notice visible at a time (ui.spec.md §4)", () => {
    render(
      <FolderDropNotice
        notice={{ kind: "error", path: "/Users/x/gone", reason: "does-not-exist" }}
        onDismiss={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
