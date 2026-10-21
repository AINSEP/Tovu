import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PostSettingsDialog, type PostSettingsDialogProps } from "../PostSettingsDialog";
import type { PostSettingsDialogController, PostSettingsTab } from "../hooks/use-post-editor-ui.hooks";

/**
 * @file The post/page settings modal: closed renders nothing, the title names the content kind,
 * each tab shows only its own fields, and both clicks and arrow keys move between tabs through the
 * dialog controller.
 */

function dialog(tab: PostSettingsTab, overrides: Partial<PostSettingsDialogController> = {}): PostSettingsDialogController {
  return { open: true, tab, setTab: vi.fn(), openDialog: vi.fn(), closeDialog: vi.fn(), ...overrides };
}

function renderDialog(overrides: Partial<PostSettingsDialogProps> = {}) {
  const props: PostSettingsDialogProps = {
    dialog: dialog("author"),
    kindLabel: "post",
    author: "Ada",
    setAuthor: vi.fn(),
    showAuthor: true,
    setShowAuthor: vi.fn(),
    publishAtInput: "",
    setPublishAtInput: vi.fn(),
    scheduled: false,
    t: (key) => key,
    ...overrides,
  };
  return { props, ...render(<PostSettingsDialog {...props} />) };
}

describe("PostSettingsDialog", () => {
  it("renders nothing while closed", () => {
    const { container } = renderDialog({ dialog: dialog("author", { open: false }) });
    expect(container).toBeEmptyDOMElement();
  });

  it("titles itself for a page and shows only the Publish fields on the Publish tab", () => {
    renderDialog({ kindLabel: "page", dialog: dialog("publish") });
    expect(screen.getByRole("tablist", { name: "Page settings" })).toBeInTheDocument();
    expect(screen.getByText("Publish at")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Publish" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByDisplayValue("Ada")).not.toBeInTheDocument();
  });

  it("titles itself for a post and shows only the Author fields on the Author tab", () => {
    renderDialog();
    expect(screen.getByRole("tablist", { name: "Post settings" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();
    expect(screen.queryByText("Publish at")).not.toBeInTheDocument();
  });

  it("switches tabs on click and with the arrow keys", () => {
    const controller = dialog("author");
    renderDialog({ dialog: controller });
    fireEvent.click(screen.getByRole("tab", { name: "Publish" }));
    expect(controller.setTab).toHaveBeenLastCalledWith("publish");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Author" }), { key: "ArrowRight" });
    expect(controller.setTab).toHaveBeenCalledTimes(2);
    expect(controller.setTab).toHaveBeenLastCalledWith("publish");
  });
});
