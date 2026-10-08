import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  usePanelPosition,
  useSelectDropdown,
  type SelectOption,
} from "../Select/Select.hooks";

/**
 * @file Host hook-adapter guards. The live helpers and their direct tests (including the original
 * extraction rationale) now belong to Jini/packages/ui/src/features/admin-widgets.
 * Historical split rationale: `Select.hooks.tsx` — the pure DOM helpers (`buildOptionId`, `computePosition`,
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

describe("usePanelPosition — scroll/resize reposition guard", () => {
  // `reposition()`'s own `if (!el) return;` — the trigger ref can read null if the trigger element
  // is no longer mounted by the time a scroll/resize fires while the panel is still open. No
  // product path drives this through the full `<Select>` component today (the trigger button is
  // always rendered alongside the panel), so it's exercised directly against this extracted hook,
  // whose own doc names this split's purpose as making exactly this kind of internal branch
  // testable without mounting the whole dropdown.
  it("is a safe no-op when the trigger ref is null when a scroll fires", () => {
    const triggerRef = { current: null };
    const { result } = renderHook(() =>
      usePanelPosition({
        open: true,
        triggerRef,
        panelRef: { current: null },
        searchInputRef: { current: null },
        showSearch: false,
        onOutOfView: vi.fn(),
      }),
    );
    const before = result.current.position;

    expect(() => act(() => window.dispatchEvent(new Event("scroll")))).not.toThrow();
    expect(result.current.position).toBe(before);
  });
});

describe("useSelectDropdown", () => {
  function hookProps(overrides: Partial<{ value: string; options: SelectOption[]; disabled: boolean; onChange: (value: string) => void }> = {}) {
    return {
      value: overrides.value ?? "",
      onChange: overrides.onChange ?? vi.fn(),
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
    const { result } = renderHook(() => useSelectDropdown(hookProps({ options: FEW_OPTIONS, onChange })));
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
    withInnerHeight(800, () => {
      const { result } = renderHook(() => useSelectDropdown(hookProps()));
      const trigger = fakeTrigger({ top: 100, bottom: 130, left: 20, width: 200 }) as HTMLButtonElement;
      result.current.triggerRef.current = trigger;
      act(() => result.current.openPanel());
      expect(result.current.position).toMatchObject({ top: 134, left: 20, width: 200 });

      act(() => result.current.closePanel({ refocusTrigger: false }));
      expect(result.current.open).toBe(false);
      expect(result.current.position).toBeNull();

      vi.mocked(trigger.getBoundingClientRect).mockReturnValue({ top: 200, bottom: 230, left: 80, width: 240 } as DOMRect);
      act(() => result.current.openPanel());
      expect(result.current.open).toBe(true);
      expect(result.current.position).toMatchObject({ top: 234, left: 80, width: 240 });
    });
  });
});
