import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLifecycleConfirmDialog } from "../hooks/use-lifecycle-confirm-dialog.hooks";

/**
 * @file `useLifecycleConfirmDialog` — no state of its own; just Escape-to-cancel plus the
 * op-derived copy/focus decision from `rules.ts`.
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
