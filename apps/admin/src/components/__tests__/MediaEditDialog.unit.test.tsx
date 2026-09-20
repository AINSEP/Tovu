import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tabFromLastFocusableInDialog } from "../../hooks/__tests__/focus-trap.test-helpers";
import { MediaEditDialog } from "../MediaEditDialog/MediaEditDialog";
import type { useWiredMediaEditDialog } from "../MediaEditDialog/MediaEditDialog.hooks";

/**
 * @file `MediaEditDialog` JSX — the `media` node's `Edit` action (renamed from `Style…`/
 * `MediaStyleDialog`, 2026-09-11 owner UI revision: `Edit` moves BEFORE `Replace` in the action
 * row and the modal now edits `alt` too, alongside `cssClass`/`htmlAttributes`). Mirrors
 * `MediaPickerDialog.unit.test.tsx`'s split: this file drives the component against an injected
 * `useDialog` fake, `MediaEditDialog.hooks.unit.test.tsx` covers the real hook's own logic. The
 * bottom describe block exercises the REAL default hook end-to-end (real
 * `parseMediaHtmlAttributes` validation, real Escape listener).
 */

function fakeController(overrides: Partial<ReturnType<typeof useWiredMediaEditDialog>> = {}): ReturnType<typeof useWiredMediaEditDialog> {
  return {
    alt: "",
    cssClass: "",
    htmlAttributes: "",
    setAlt: vi.fn(),
    setCssClass: vi.fn(),
    setHtmlAttributes: vi.fn(),
    htmlAttributesError: null,
    save: vi.fn(),
    t: (key) => key,
    ...overrides,
  };
}

describe("MediaEditDialog — copy", () => {
  it("renders every label through the controller's own t, so the dialog needs no second useAdminLocale call", () => {
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController({ t: (key) => `[es] ${key}` });
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={vi.fn()} useDialog={useDialog} />);

    expect(screen.getByRole("heading", { name: "[es] Edit this instance" })).toBeInTheDocument();
    expect(screen.getByLabelText("[es] Alt text (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("[es] CSS class (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("[es] HTML attributes (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[es] Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[es] Save" })).toBeInTheDocument();
  });
});

describe("MediaEditDialog — rendering the current draft", () => {
  it("pre-fills all three fields from the injected controller's draft", () => {
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController({ alt: "A cat", cssClass: "hero", htmlAttributes: 'data-kui="x"' });
    render(
      <MediaEditDialog initial={{ alt: "A cat", cssClass: "hero", htmlAttributes: 'data-kui="x"' }} onSave={vi.fn()} onCancel={vi.fn()} useDialog={useDialog} />
    );

    expect(screen.getByLabelText("Alt text (optional)")).toHaveValue("A cat");
    expect(screen.getByLabelText("CSS class (optional)")).toHaveValue("hero");
    expect(screen.getByLabelText("HTML attributes (optional)")).toHaveValue('data-kui="x"');
  });

  it("shows the live validation hint when the injected controller reports one, without disabling Save", () => {
    const save = vi.fn();
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController({ htmlAttributesError: "'onerror' is not an allowed HTML attribute.", save });
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={vi.fn()} useDialog={useDialog} />);

    expect(screen.getByText("'onerror' is not an allowed HTML attribute.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });
});

describe("MediaEditDialog — editing calls through to the injected controller", () => {
  it("typing in the alt text field calls setAlt", async () => {
    const user = userEvent.setup();
    const setAlt = vi.fn();
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController({ setAlt });
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={vi.fn()} useDialog={useDialog} />);

    await user.type(screen.getByLabelText("Alt text (optional)"), "x");
    expect(setAlt).toHaveBeenCalledWith("x");
  });

  it("typing in the CSS class field calls setCssClass", async () => {
    const user = userEvent.setup();
    const setCssClass = vi.fn();
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController({ setCssClass });
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={vi.fn()} useDialog={useDialog} />);

    await user.type(screen.getByLabelText("CSS class (optional)"), "x");
    expect(setCssClass).toHaveBeenCalledWith("x");
  });

  it("typing in the HTML attributes field calls setHtmlAttributes", async () => {
    const user = userEvent.setup();
    const setHtmlAttributes = vi.fn();
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController({ setHtmlAttributes });
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={vi.fn()} useDialog={useDialog} />);

    await user.type(screen.getByLabelText("HTML attributes (optional)"), "m");
    expect(setHtmlAttributes).toHaveBeenCalledWith("m");
  });

  it("clicking Save calls the controller's save()", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController({ save });
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={vi.fn()} useDialog={useDialog} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("MediaEditDialog — dismissal", () => {
  it("calls onCancel on Cancel button click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController();
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={onCancel} useDialog={useDialog} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on a backdrop click but not on a click inside the dialog panel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const useDialog: typeof useWiredMediaEditDialog = () => fakeController();
    const { container } = render(
      <MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={onCancel} useDialog={useDialog} />
    );

    await user.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(container.querySelector(".settings-dialog-backdrop")!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("MediaEditDialog — real useWiredMediaEditDialog wiring (no fake)", () => {
  it("Escape, real validation hint, and Save-not-gated all work end to end through the default hook, alt included", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={onSave} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("Alt text (optional)"), "A cat");
    await user.type(screen.getByLabelText("HTML attributes (optional)"), 'onerror="x"');
    expect(await screen.findByText("Event handler attributes like 'onerror' are not allowed.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ alt: "A cat", cssClass: null, htmlAttributes: 'onerror="x"' });
  });
});

describe("MediaEditDialog — focus trap", () => {
  it("keeps Tab inside the dialog: Tab on the last focusable element wraps to the first", async () => {
    render(<MediaEditDialog initial={{ alt: null, cssClass: null, htmlAttributes: null }} onSave={vi.fn()} onCancel={vi.fn()} useDialog={() => fakeController()} />);
    const { event, first } = tabFromLastFocusableInDialog();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});
