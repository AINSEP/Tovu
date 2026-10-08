import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LifecycleConfirmDialog } from "../Collections";
import type { AdminContentType } from "@/lib/api";
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
    expect(result.current.copy.title).toBe("Delete content type");
    expect(result.current.autoFocusCancel).toBe(true);
  });
});

describe("native lifecycle dialog", () => {
  it("native cancel reaches onCancel without confirming", () => {
    const onCancel = vi.fn(), onConfirm = vi.fn();
    render(<LifecycleConfirmDialog op="tombstone" contentType={{ label: "Recipe" } as AdminContentType}
      onConfirm={onConfirm} onCancel={onCancel} t={(key) => key} />);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses native modality and keeps destructive confirmation off initial focus", () => {
    render(<LifecycleConfirmDialog op="tombstone" contentType={{ label: "Recipe" } as AdminContentType}
      onConfirm={vi.fn()} onCancel={vi.fn()} t={(key) => key} />);
    expect(screen.getByRole("dialog").tagName).toBe("DIALOG");
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
});
