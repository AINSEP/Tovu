import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemePageDetailsModal } from "../ThemePageDetailsModal";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";

const row: ThemePageRow = {
  pageId: "pricing", filePath: "render/pages/pricing.html", published: false,
  resettable: true, collidingContent: { id: "content-7", kind: "page", title: "Pricing Policy", slug: "pricing-policy" },
};
const originalUrl = window.location.href;
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

afterEach(() => {
  // F7.6: restore methods even after an assertion fails.
  for (const [key, descriptor] of [["showModal", originalShow], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
  window.history.replaceState(null, "", originalUrl);
});

describe.each(["native", "fallback"] as const)("details dialog %s runtime", (runtime) => {
  it("opens and closes on row transitions, avoiding redundant native calls", () => {
    // F3.3: the platform fake retains open state; it rejects duplicate open/close calls.
    // Regression target: remove the !dialog.open/dialog.open guards, or ignore the open prop.
    const show = vi.fn(function (this: HTMLDialogElement) {
      if (this.open) throw new Error("already open");
      this.setAttribute("open", "");
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      if (!this.open) throw new Error("already closed");
      this.removeAttribute("open");
    });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: runtime === "native" ? show : undefined });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: runtime === "native" ? close : undefined });
    const props = { onClose: vi.fn(), t: (key: string) => key };
    const view = render(<ThemePageDetailsModal {...props} row={null} />);
    const dialog = view.container.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    // A platform-open dialog must not be opened again when the controlled row arrives.
    dialog.setAttribute("open", "");
    view.rerender(<ThemePageDetailsModal {...props} row={row} />);
    expect(screen.getByRole("dialog", { name: "pricing" })).toBe(dialog);
    expect(dialog.open).toBe(true);
    expect(show).not.toHaveBeenCalled();
    view.rerender(<ThemePageDetailsModal {...props} row={null} />);
    expect(dialog.open).toBe(false);
    view.rerender(<ThemePageDetailsModal {...props} row={row} />);
    expect(dialog.open).toBe(true);
    view.rerender(<ThemePageDetailsModal {...props} row={{ ...row, pageId: "terms" }} />);
    expect(screen.getByRole("dialog", { name: "terms" })).toBe(dialog);
    view.rerender(<ThemePageDetailsModal {...props} row={null} />);
    expect(dialog.open).toBe(false);
    view.rerender(<ThemePageDetailsModal {...props} row={null} />);
    expect(show).toHaveBeenCalledTimes(runtime === "native" ? 1 : 0);
    expect(close).toHaveBeenCalledTimes(runtime === "native" ? 2 : 0);
    if (runtime === "native") {
      expect(show.mock.contexts).toEqual([dialog]);
      expect(close.mock.contexts).toEqual([dialog, dialog]);
    }
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

it("shows an unpublished page's collision and navigates to its content record", async () => {
  // F2.4/F6.2 regression target: gate the warning on published, or pass an already-prefixed path to navigate.
  const user = userEvent.setup();
  render(<ThemePageDetailsModal row={row} onClose={vi.fn()} t={(key) => key} />);
  expect(screen.getByText("Not live")).toBeInTheDocument();
  const link = screen.getByRole("link", { name: "Open Pricing Policy" });
  expect(link).toHaveAttribute("href", "/admin/pages/pricing-policy");
  await user.click(link);
  expect(window.location.pathname).toBe("/admin/pages/pricing-policy");
});

it("handles native cancel by preventing default and clearing the current row", () => {
  // F3.1: this exercises the cancel-event contract, not browser Escape-to-cancel routing.
  function Harness() {
    const [current, setCurrent] = useState<ThemePageRow | null>(row);
    return <ThemePageDetailsModal row={current} onClose={() => setCurrent(null)} t={(key) => key} />;
  }
  render(<Harness />);
  const dialog = screen.getByRole("dialog", { name: "pricing" });
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(dialog, cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(dialog).not.toHaveAttribute("open");
  expect(screen.queryByText("render/pages/pricing.html")).not.toBeInTheDocument();
});
