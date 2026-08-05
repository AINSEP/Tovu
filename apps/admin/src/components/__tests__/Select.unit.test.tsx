import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOptionId, computePosition, focusableInDomOrder, Select, useSelectDropdown, type SelectOption } from "../Select";

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

  it("Home jumps the highlight back to the first option after End moved it to the last", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={FEW_OPTIONS} aria-label="Pick one" />);

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    await user.keyboard("{End}{Home}{Enter}");

    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("opens the panel via the keyboard — Enter, Space, ArrowDown, and ArrowUp on a focused, closed trigger", async () => {
    for (const key of ["{Enter}", " ", "{ArrowDown}", "{ArrowUp}"]) {
      const user = userEvent.setup();
      const { unmount } = render(<Select value="" onChange={vi.fn()} options={FEW_OPTIONS} aria-label="Pick one" />);
      const trigger = screen.getByRole("combobox", { name: "Pick one" });

      trigger.focus();
      await user.keyboard(key);

      expect(screen.getByRole("listbox"), `key ${key} did not open the panel`).toBeInTheDocument();
      unmount();
    }
  });

  it("a key with no bound action on the closed trigger (e.g. a plain letter) does not open the panel", async () => {
    const user = userEvent.setup();
    render(<Select value="" onChange={vi.fn()} options={FEW_OPTIONS} aria-label="Pick one" />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });

    trigger.focus();
    await user.keyboard("a");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("the trigger's key handler no-ops while disabled", async () => {
    const user = userEvent.setup();
    render(<Select value="" onChange={vi.fn()} options={FEW_OPTIONS} aria-label="Pick one" disabled />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });
    trigger.focus();

    await user.keyboard("{Enter}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
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

  it("an empty option list shows 'No matches' and ArrowDown/ArrowUp/Home/End/Enter are all safe no-ops", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={[]} aria-label="Pick one" />);

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    // None of these have anywhere to move a highlight to (`filtered.length === 0` throughout) —
    // asserting only that nothing throws and no option is ever selected.
    await user.keyboard("{ArrowDown}{ArrowUp}{Home}{End}{Enter}");

    expect(screen.getByRole("listbox")).toBeInTheDocument(); // Enter had nothing to select, so it stayed open
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a search query with no matches re-anchors the highlight to none — Home/End/Enter stay no-ops too", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={MANY_OPTIONS} aria-label="Pick one" />);

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    await user.type(screen.getByPlaceholderText("Search…"), "zzz-no-such-option");

    expect(screen.getByText("No matches")).toBeInTheDocument();

    await user.keyboard("{Home}{End}{Enter}");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("repositions on scroll via the viewport-edge check alone when document.elementFromPoint is unavailable", async () => {
    // Mirrors the module doc's own "degrades to the viewport-edge check above only" branch — some
    // hosts (older WebViews, per that comment) have no `elementFromPoint` at all.
    const user = userEvent.setup();
    render(<ControlledSelect options={FEW_OPTIONS} />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 50, bottom: 87, left: 0, right: 100, width: 100, height: 37, x: 0, y: 50, toJSON() {},
    } as DOMRect);
    const original = document.elementFromPoint;
    // @ts-expect-error — simulating an environment where the API does not exist at all.
    document.elementFromPoint = undefined;
    try {
      window.dispatchEvent(new Event("scroll"));
      // Still visible per the bounding-rect check alone, so the panel stays open and repositioned
      // rather than closed — the obscured-by-another-element check simply never runs.
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    } finally {
      document.elementFromPoint = original;
    }
  });

  it("Shift+Tab moves focus to whatever naturally precedes the trigger", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">before</button>
        <Select value="" onChange={vi.fn()} options={FEW_OPTIONS} aria-label="Pick one" />
      </div>
    );

    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "before" })).toHaveFocus();
  });

  it("Tab closes the panel without moving focus when the trigger can no longer be found among the focusable nodes", async () => {
    // `focusableInDomOrder`'s selector excludes disabled elements — becoming disabled while the
    // panel happens to still be open (a prop change mid-session) is the one way `triggerIndex` ends
    // up -1 despite the trigger existing in the DOM. `rerender`, not a click on some other control,
    // flips `disabled` here: any real outside click would itself close the panel first (this
    // component's own click-outside effect), pre-empting the state this test needs to reach.
    const user = userEvent.setup();
    const { rerender } = render(<Select value="" onChange={vi.fn()} options={FEW_OPTIONS} aria-label="Pick one" />);
    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    rerender(<Select value="" onChange={vi.fn()} options={FEW_OPTIONS} aria-label="Pick one" disabled />);
    expect(screen.getByRole("combobox", { name: "Pick one" })).toBeDisabled();

    // Dispatched directly at the panel rather than via userEvent.keyboard: the trigger is now
    // disabled and cannot hold focus, so there is no real element left for the keystroke to
    // originate from except the panel itself.
    fireEvent.keyDown(document.querySelector(".select-panel")!, { key: "Tab" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); // still closes
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

  it("closes the panel if the trigger is obscured by another element at its own center, even though still in the viewport", async () => {
    // The narrower case `elementFromPoint` exists for: a clipping ancestor (e.g. a dialog's fixed
    // header) hides the trigger without pushing it past the viewport edge, so the bounding-rect
    // check above stays silent and only this check catches it.
    const user = userEvent.setup();
    render(<ControlledSelect options={FEW_OPTIONS} />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 50, bottom: 87, left: 0, right: 100, width: 100, height: 37, x: 0, y: 50, toJSON() {},
    } as DOMRect);
    const coveringElement = document.createElement("div"); // an unrelated element, not the trigger or its descendant/ancestor
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(coveringElement);
    try {
      window.dispatchEvent(new Event("scroll"));
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
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

describe("buildOptionId", () => {
  it("joins the listbox id and index with the component's fixed suffix", () => {
    expect(buildOptionId("listbox-1", 3)).toBe("listbox-1-option-3");
  });
});

/** A stand-in trigger element with a stubbed `getBoundingClientRect()` — `computePosition` reads
 * nothing else off it. */
function fakeTrigger(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement("button");
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...rect,
  } as DOMRect);
  return el;
}

function withInnerHeight(height: number, run: () => void) {
  const original = window.innerHeight;
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  try {
    run();
  } finally {
    Object.defineProperty(window, "innerHeight", { value: original, configurable: true });
  }
}

describe("computePosition", () => {
  it("opens downward, anchored just below the trigger, when there is room below", () => {
    withInnerHeight(800, () => {
      const trigger = fakeTrigger({ top: 100, bottom: 130, left: 20, width: 200 });
      const position = computePosition(trigger);
      expect(position.top).toBe(134); // rect.bottom + the 4px gap
      expect(position.bottom).toBeUndefined();
      expect(position.left).toBe(20);
      expect(position.width).toBe(200);
    });
  });

  it("opens upward, anchored just above the trigger, when there isn't room below but there is above", () => {
    withInnerHeight(400, () => {
      // spaceBelow = 400 - 380 = 20 (< the 280px estimate); spaceAbove = 350 (> spaceBelow) -> upward.
      const trigger = fakeTrigger({ top: 350, bottom: 380, left: 0, width: 100 });
      const position = computePosition(trigger);
      expect(position.bottom).toBe(400 - 350 + 4); // viewportHeight - rect.top + the 4px gap
      expect(position.top).toBeUndefined();
      expect(position.maxHeight).toBe(Math.max(120, 350 - 8));
    });
  });

  it("floors maxHeight at 120 even when the actual available space is smaller", () => {
    withInnerHeight(100, () => {
      // spaceBelow = 100 - 20 = 80 (< 280 estimate), but spaceAbove (10) is not > spaceBelow (80),
      // so this still opens downward — the branch under test is the maxHeight floor, not direction.
      const trigger = fakeTrigger({ top: 10, bottom: 20, left: 0, width: 50 });
      const position = computePosition(trigger);
      expect(position.top).toBeDefined();
      expect(position.maxHeight).toBe(120);
    });
  });
});

describe("focusableInDomOrder", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns focusable elements in DOM order, skipping disabled ones and anything inside `exclude`", () => {
    document.body.innerHTML = `
      <button id="btn1">one</button>
      <div id="host"><input id="inp1" /><button id="btn2" disabled>two</button></div>
      <a id="link1" href="#">three</a>
    `;
    const host = document.getElementById("host") as HTMLElement;
    const ids = focusableInDomOrder(host).map((el) => el.id);
    // `inp1`/`btn2` are inside `host` (excluded); `btn2` would be skipped anyway (disabled).
    expect(ids).toEqual(["btn1", "link1"]);
  });

  it("returns every focusable element when exclude is null", () => {
    document.body.innerHTML = `<button id="only">x</button>`;
    expect(focusableInDomOrder(null).map((el) => el.id)).toEqual(["only"]);
  });
});

describe("useSelectDropdown", () => {
  function hookProps(overrides: Partial<{ value: string; options: SelectOption[]; disabled: boolean }> = {}) {
    return {
      value: overrides.value ?? "",
      onChange: vi.fn(),
      options: overrides.options ?? FEW_OPTIONS,
      disabled: overrides.disabled,
    };
  }

  // These three pin `openPanel`'s initial-highlight branches (`ui.spec.md`'s keyboard-nav contract
  // begins from wherever this lands) — reachable only by driving the full portaled dialog before,
  // now asserted directly against the hook's own state.
  it("openPanel highlights the current value's row when it matches an option", () => {
    const { result } = renderHook(() => useSelectDropdown(hookProps({ value: "b" })));
    act(() => result.current.openPanel());
    expect(result.current.open).toBe(true);
    expect(result.current.highlightedIndex).toBe(1); // FEW_OPTIONS[1] is "b"
  });

  it("openPanel highlights the first row when the value matches no option", () => {
    const { result } = renderHook(() => useSelectDropdown(hookProps({ value: "does-not-exist" })));
    act(() => result.current.openPanel());
    expect(result.current.highlightedIndex).toBe(0);
  });

  it("openPanel highlights nothing when there are no options at all", () => {
    const { result } = renderHook(() => useSelectDropdown(hookProps({ options: [] })));
    act(() => result.current.openPanel());
    expect(result.current.highlightedIndex).toBe(-1);
  });

  it("openPanel is a no-op while disabled", () => {
    const { result } = renderHook(() => useSelectDropdown(hookProps({ disabled: true })));
    act(() => result.current.openPanel());
    expect(result.current.open).toBe(false);
  });

  // `handleTriggerKeyDown`'s own guard (`if (disabled || open) return`) is unreachable through real
  // keyboard interaction for the `open` half: once the panel opens, focus always moves off the
  // trigger (into the search input or the panel itself — see the layout effect's own comment), so
  // no real keydown ever reaches the trigger's handler while `open` is true. Calling the hook's
  // returned function directly is the honest way to pin that half of the guard rather than
  // fabricating a DOM sequence the component can't actually produce.
  it("handleTriggerKeyDown no-ops once the panel is already open, mirroring the disabled no-op", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSelectDropdown(hookProps({ options: FEW_OPTIONS })));
    act(() => result.current.openPanel());
    expect(result.current.open).toBe(true);
    const highlightBefore = result.current.highlightedIndex;

    act(() => {
      result.current.handleTriggerKeyDown({
        key: "Enter",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLButtonElement>);
    });

    expect(result.current.open).toBe(true); // unchanged
    expect(result.current.highlightedIndex).toBe(highlightBefore); // openPanel was not re-invoked
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closePanel resets position to null, forcing the measure-then-focus sequence to redo on the next open", () => {
    const { result } = renderHook(() => useSelectDropdown(hookProps()));
    act(() => result.current.openPanel());
    act(() => result.current.closePanel({ refocusTrigger: false }));
    expect(result.current.open).toBe(false);
    expect(result.current.position).toBeNull();
  });
});
