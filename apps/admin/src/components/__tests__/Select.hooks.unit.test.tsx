import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildOptionId,
  computePosition,
  focusableInDomOrder,
  resolveTabTarget,
  useSelectDropdown,
  type SelectOption,
} from "../Select/Select.hooks";

/**
 * @file `Select.hooks.tsx` — the pure DOM helpers (`buildOptionId`, `computePosition`,
 * `focusableInDomOrder`) and the `useSelectDropdown` hook's own state-shape behavior, split out of
 * `Select.unit.test.tsx` when `Select.tsx` split into `Select.tsx`/`Select.hooks.tsx`, mirroring
 * this repo's `use-fab-position.hooks.test.ts`. `Select.unit.test.tsx` keeps the tests that render
 * the actual `<Select>` component; this file exercises the hook and its helpers directly via
 * `renderHook`, without a DOM tree or a portal at all.
 */

const FEW_OPTIONS: SelectOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
];

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

describe("resolveTabTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // `Select.unit.test.tsx`'s "Tab moves focus..." / "Shift+Tab moves focus..." / "Tab closes the
  // panel without moving focus..." tests already pin this behavior end-to-end through a real
  // keydown; these three exercise the extracted function's own math directly, per this pass's rule
  // that every top-level extraction gets a direct unit test.
  it("returns the trigger's next DOM-order neighbour when moving forward", () => {
    document.body.innerHTML = `<button id="before">before</button><button id="trigger">trigger</button><button id="after">after</button>`;
    const trigger = document.getElementById("trigger")!;
    const target = resolveTabTarget(null, trigger, false);
    expect(target?.id).toBe("after");
  });

  it("returns the trigger's previous DOM-order neighbour when shiftKey is set", () => {
    document.body.innerHTML = `<button id="before">before</button><button id="trigger">trigger</button><button id="after">after</button>`;
    const trigger = document.getElementById("trigger")!;
    const target = resolveTabTarget(null, trigger, true);
    expect(target?.id).toBe("before");
  });

  it("returns null when the trigger cannot be found among the focusable nodes", () => {
    document.body.innerHTML = `<button id="only">only</button>`;
    const trigger = document.createElement("button"); // never attached to the DOM
    expect(resolveTabTarget(null, trigger, false)).toBeNull();
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
