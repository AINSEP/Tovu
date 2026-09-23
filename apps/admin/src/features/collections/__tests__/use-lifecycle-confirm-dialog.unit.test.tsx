import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { tabFromLastFocusableInDialog } from "@/hooks/__tests__/focus-trap.test-helpers";
import { useLifecycleConfirmDialog } from "../hooks/use-lifecycle-confirm-dialog.hooks";

/**
 * @file `useLifecycleConfirmDialog` — no state of its own; just Escape-to-cancel, the op-derived
 * copy/focus decision from `rules.ts`, and (M3) the focus trap's own `dialogRef`.
 *
 * `.tsx` (not `.ts`): the M3 focus-trap test below renders a small harness component, which needs
 * JSX — every other case here still drives the hook through `renderHook`, unchanged.
 */

describe("copy + autoFocusCancel derivation", () => {
  it("returns deprecate's copy and does not focus Cancel", () => {
    const { result } = renderHook(() => useLifecycleConfirmDialog({ op: "deprecate", onCancel: vi.fn() }));
    expect(result.current.copy.title).toBe("Deprecate content type");
    expect(result.current.autoFocusCancel).toBe(false);
  });

  it("returns tombstone's copy and focuses Cancel (heavier, less-reversible op)", () => {
    const { result } = renderHook(() => useLifecycleConfirmDialog({ op: "tombstone", onCancel: vi.fn() }));
    expect(result.current.copy.title).toBe("Tombstone content type");
    expect(result.current.autoFocusCancel).toBe(true);
  });
});

describe("Escape-to-cancel", () => {
  it("calls onCancel when Escape is pressed while mounted", () => {
    const onCancel = vi.fn();
    renderHook(() => useLifecycleConfirmDialog({ op: "deprecate", onCancel }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("focus trap (M3)", () => {
  it("Tab from the dialog's last focusable element wraps to the first instead of leaving", () => {
    function Harness() {
      const { dialogRef } = useLifecycleConfirmDialog({ op: "deprecate", onCancel: vi.fn() });
      return (
        <>
          <button type="button">page behind</button>
          <div ref={dialogRef} role="dialog" aria-modal="true">
            <button type="button">first</button>
            <button type="button">last</button>
          </div>
        </>
      );
    }
    render(<Harness />);

    const { event, first } = tabFromLastFocusableInDialog();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});
