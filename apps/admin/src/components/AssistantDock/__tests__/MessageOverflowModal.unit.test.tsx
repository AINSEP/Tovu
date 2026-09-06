import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MessageOverflowModal } from "../MessageOverflowModal";
import type { MessageOverflowModalController } from "../MessageOverflowModal.hooks";

/**
 * @file `MessageOverflowModal` — the chat pane's "Show in modal" surface. Mirrors
 * `ImagePreviewModal.unit.test.tsx`'s coverage shape for the same native-`<dialog>` three close
 * paths (close button, backdrop click, Escape), plus this component's own content contract: it
 * shows whatever `children` it is given, unconditionally (the "when to gate mounting" decision
 * belongs to each caller — see `OverflowAwareMcpUiSurfaceCard.tsx`'s own doc for why).
 *
 * `useT()` is not wrapped in a `JiniChatProvider` here — `@jini-ai/chat/react`'s `I18nContext`
 * defaults to a passthrough adapter (`t(key) === key`) outside any provider, so `t("Close")`
 * resolves to the literal string `"Close"`, which is what the assertions below target.
 */

describe("open/closed state", () => {
  it("has no open attribute when open is false", () => {
    render(<MessageOverflowModal open={false} title="Full view" onClose={vi.fn()}>content</MessageOverflowModal>);
    const dialog = document.querySelector("dialog.message-overflow-modal")!;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("has the open attribute when open is true", () => {
    render(<MessageOverflowModal open={true} title="Full view" onClose={vi.fn()}>content</MessageOverflowModal>);
    const dialog = document.querySelector("dialog.message-overflow-modal")!;
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("uses the given title as the dialog's accessible name", () => {
    render(<MessageOverflowModal open={true} title="Query result" onClose={vi.fn()}>content</MessageOverflowModal>);
    expect(document.querySelector("dialog.message-overflow-modal")).toHaveAttribute("aria-label", "Query result");
  });
});

describe("agentHandle", () => {
  it("omits data-agent-element on the close button when agentHandle is not passed", () => {
    render(<MessageOverflowModal open={true} title="Full view" onClose={vi.fn()}>content</MessageOverflowModal>);
    expect(screen.getByRole("button", { name: "Close" })).not.toHaveAttribute("data-agent-element");
  });

  it("publishes the close button as agent-addressable when agentHandle is passed", () => {
    render(
      <MessageOverflowModal open={true} title="Full view" onClose={vi.fn()} agentHandle="overflow-modal-close">
        content
      </MessageOverflowModal>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("data-agent-element", "overflow-modal-close");
  });
});

describe("content", () => {
  it("renders the given children", () => {
    render(
      <MessageOverflowModal open={true} title="Full view" onClose={vi.fn()}>
        <p>the whole table</p>
      </MessageOverflowModal>,
    );
    expect(screen.getByText("the whole table")).toBeInTheDocument();
  });
});

describe("closing", () => {
  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MessageOverflowModal open={true} title="Full view" onClose={onClose}>content</MessageOverflowModal>);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop (the dialog element itself, not a child) is clicked", () => {
    const onClose = vi.fn();
    render(<MessageOverflowModal open={true} title="Full view" onClose={onClose}>content</MessageOverflowModal>);
    const dialog = document.querySelector("dialog.message-overflow-modal")!;
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when a click lands on a child (the content), not the dialog's own backdrop area", () => {
    const onClose = vi.fn();
    render(
      <MessageOverflowModal open={true} title="Full view" onClose={onClose}>
        <p>the whole table</p>
      </MessageOverflowModal>,
    );
    fireEvent.click(screen.getByText("the whole table"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on the dialog's native cancel event (Escape) and prevents the browser's own close", () => {
    const onClose = vi.fn();
    render(<MessageOverflowModal open={true} title="Full view" onClose={onClose}>content</MessageOverflowModal>);
    const dialog = document.querySelector("dialog.message-overflow-modal")!;
    const cancelEvent = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancelEvent);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancelEvent.defaultPrevented).toBe(true);
  });
});

describe("MessageOverflowModal modal-hook injection", () => {
  it("renders purely off an injected fake, proving useMessageOverflowModal is not hardcoded", () => {
    const onClose = vi.fn();
    function useFakeMessageOverflowModal(): MessageOverflowModalController {
      return {
        dialogRef: { current: null },
        handleNativeCancel: () => {},
        // A fake that calls onClose unconditionally, regardless of click target — something the
        // real hook never does (it always checks `e.target === dialogRef.current` first).
        handleBackdropClick: () => onClose(),
      };
    }

    render(
      <MessageOverflowModal open={true} title="Full view" onClose={vi.fn()} useModal={useFakeMessageOverflowModal}>
        <p>the whole table</p>
      </MessageOverflowModal>,
    );

    fireEvent.click(screen.getByText("the whole table"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
