import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Select, type SelectOption } from "../Select";

/**
 * @file `Select` — the custom searchable dropdown built to replace `WidgetPickerDialog.tsx`'s two
 * native `<select>`s (no other admin `<select>` is in scope for this component). Covers the
 * behavior contract its own header documents: open/close, search-box visibility threshold,
 * filtering, full keyboard path, click-outside, and the two regressions a portaled floating panel
 * specifically risks — Escape bubbling to a host's own modal-cancel listener, and Tab landing
 * wherever the portal happens to sit in the DOM instead of wherever the trigger visually is.
 */

const FEW_OPTIONS: SelectOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
];

// 10 entries — at/above the component's own `SEARCH_VISIBILITY_THRESHOLD` (8), so the search box
// is expected to render for this list and not for `FEW_OPTIONS` above.
const MANY_OPTIONS: SelectOption[] = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet",
].map((label, i) => ({ value: String(i), label }));

function ControlledSelect(props: { options: SelectOption[]; initial?: string }) {
  const [value, setValue] = useState(props.initial ?? "");
  return <Select value={value} onChange={setValue} options={props.options} aria-label="Pick one" />;
}

describe("Select", () => {
  it("opens the panel on trigger click and closes it again on a second click", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={FEW_OPTIONS} />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("hides the search box below the visibility threshold, shows it at/above it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ControlledSelect options={FEW_OPTIONS} />);
    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
    unmount();

    render(<ControlledSelect options={MANY_OPTIONS} />);
    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });

  it("filters options case-insensitively as the search box is typed", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={MANY_OPTIONS} />);
    await user.click(screen.getByRole("combobox", { name: "Pick one" }));

    await user.type(screen.getByPlaceholderText("Search…"), "delta");

    expect(screen.getByRole("option", { name: "Delta" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("selects an option by click, closes the panel, and reports its value via onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={FEW_OPTIONS} aria-label="Pick one" />);

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    await user.click(screen.getByRole("option", { name: "Bravo" }));

    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // REGRESSION, found live in a real browser via a long "Existing Text widgets" list (25 items) at
  // a short viewport: `.select-list` genuinely overflows its own `max-height`, ArrowDown correctly
  // moved `aria-activedescendant`/`.is-highlighted`, but nothing ever scrolled the list to keep the
  // highlighted row inside the visible panel — confirmed via `getBoundingClientRect()`, the
  // highlighted row's rect sat entirely below the panel's own visible bounds after 20 ArrowDowns.
  // jsdom has no `scrollIntoView` at all (not even a no-op), so this stubs it locally to assert the
  // real call happens, rather than relying on the component's own defensive `typeof` guard (which
  // exists so a MISSING `scrollIntoView` degrades quietly, not so a PRESENT one goes untested).
  it("scrolls the highlighted option into view as the highlight moves via the keyboard", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<ControlledSelect options={MANY_OPTIONS} />);
      await user.click(screen.getByRole("combobox", { name: "Pick one" }));
      scrollIntoView.mockClear(); // the initial open's own highlight (index 0) may already have scrolled once

      await user.keyboard("{ArrowDown}");

      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("marks the current value's row aria-selected, and only that one", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={FEW_OPTIONS} initial="b" />);
    await user.click(screen.getByRole("combobox", { name: "Pick one" }));

    expect(screen.getByRole("option", { name: "Bravo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("option", { name: "Charlie" })).toHaveAttribute("aria-selected", "false");
  });

  it("ArrowUp/ArrowDown move the highlight with wraparound, and Enter selects the highlighted row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={FEW_OPTIONS} aria-label="Pick one" />);

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    // Opens with nothing selected -> highlight starts at index 0 ("Alpha"); ArrowUp wraps
    // backward to the last option ("Charlie") rather than stopping at the top.
    await user.keyboard("{ArrowUp}{Enter}");

    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("Home/End jump the highlight to the first/last option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={FEW_OPTIONS} aria-label="Pick one" />);

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    await user.keyboard("{End}{Enter}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("closes on an outside click without selecting anything", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <Select value="" onChange={onChange} options={FEW_OPTIONS} aria-label="Pick one" />
        <button type="button">outside</button>
      </div>
    );

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape closes the panel, refocuses the trigger, and selects nothing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={FEW_OPTIONS} aria-label="Pick one" />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("REGRESSION: Escape closes the dropdown without bubbling to a host's own document-level Escape listener", async () => {
    // Mirrors `WidgetPickerDialog.tsx`'s own effect exactly (`document.addEventListener("keydown",
    // ...)` that cancels the whole modal on Escape) — the dispatch that built this component named
    // this as the regression that matters: without `stopPropagation()` in `Select`'s own Escape
    // handler, closing just the dropdown would also cancel whatever modal it's sitting inside.
    const user = userEvent.setup();
    const onHostEscape = vi.fn();

    function ModalHost() {
      const [value, setValue] = useState("");
      useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
          if (e.key === "Escape") onHostEscape();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, []);
      return <Select value={value} onChange={setValue} options={FEW_OPTIONS} aria-label="Pick one" />;
    }

    render(<ModalHost />);
    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); // the dropdown itself closed
    expect(onHostEscape).not.toHaveBeenCalled(); // the host's own listener never saw the key
  });

  it("Tab moves focus to whatever naturally follows the trigger, not wherever the portaled panel sits in the DOM", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Select value="" onChange={vi.fn()} options={FEW_OPTIONS} aria-label="Pick one" />
        <button type="button">after</button>
      </div>
    );

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "after" })).toHaveFocus();
  });

  it("a disabled Select does not open on click", async () => {
    const user = userEvent.setup();
    render(<Select value="" onChange={vi.fn()} options={FEW_OPTIONS} aria-label="Pick one" disabled />);

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // REGRESSION, found live in a real browser via a scrolled `.widget-picker-body` (Task 1's own
  // new scroll region): the panel is portaled and repositions itself on every `scroll`/`resize` of
  // ANY ancestor, but with nothing to stop it, it happily kept "repositioning" a trigger that had
  // scrolled entirely off-screen — the panel just followed it there and sat open-but-invisible with
  // no way to tell. A native `<select>`'s own OS popup does not survive its trigger leaving view;
  // `elementFromPoint` at the trigger's center is how the component now detects that and closes
  // instead. jsdom's `document.elementFromPoint` is unimplemented (always returns `null`), so the
  // "still visible, just reposition" case below has to mock it explicitly, or every scroll would
  // look indistinguishable from "trigger is gone" and close the panel even when it plainly is not.
  it("closes the panel if the trigger scrolls entirely out of the viewport, rather than following it off-screen", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={FEW_OPTIONS} />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: -400, bottom: -363, left: 0, right: 100, width: 100, height: 37, x: 0, y: -400, toJSON() {},
    });
    // Dispatched raw, not through `userEvent`/`fireEvent` (neither models "the page scrolled"), so
    // nothing wraps the resulting `setOpen(false)` in `act()` for us — `waitFor` lets that update
    // actually flush before asserting, the same reason `WidgetsLibrary.unit.test.tsx` reaches for it
    // around its own raw async state transitions.
    window.dispatchEvent(new Event("scroll"));

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("keeps the panel open and repositions it on scroll when the trigger is still visible", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={FEW_OPTIONS} />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    const rect = { top: 50, bottom: 87, left: 0, right: 100, width: 100, height: 37, x: 0, y: 50, toJSON() {} };
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect);
    // jsdom doesn't implement `elementFromPoint` at all (not even as a stub returning `null`, the
    // property is simply absent) — define it fresh rather than `vi.spyOn`, which requires the
    // property to already exist. Returning the trigger itself is the real-browser answer a
    // genuinely visible trigger produces.
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(trigger);
    try {
      window.dispatchEvent(new Event("scroll"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });
});
