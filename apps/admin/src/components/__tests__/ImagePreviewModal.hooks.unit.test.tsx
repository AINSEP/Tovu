import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useImagePreviewModal } from "../ImagePreviewModal.hooks";

/**
 * @file `useImagePreviewModal` — the `<dialog>` lifecycle extracted out of `ImagePreviewModal.tsx`
 * (`ImagePreviewModal.hooks.tsx`). `ImagePreviewModal.unit.test.tsx` already covers the same
 * behavior end-to-end through the rendered component, so this file's job is to pin the hook's own
 * contract in isolation: it toggles the dialog's `open` attribute in response to `open` changing,
 * and its two dismiss handlers behave correctly.
 *
 * jsdom implements neither `HTMLDialogElement.showModal` nor `.close` (the same reason the
 * component itself has a `setAttribute`/`removeAttribute` fallback branch) — these tests exercise
 * that fallback branch directly, via `hasAttribute("open")`, the same assertion
 * `ImagePreviewModal.unit.test.tsx` already uses through the rendered component.
 */

function attachDialog(result: { current: ReturnType<typeof useImagePreviewModal> }) {
  const dialog = document.createElement("dialog");
  document.body.appendChild(dialog);
  result.current.dialogRef.current = dialog;
  return dialog;
}

describe("useImagePreviewModal", () => {
  it("does not set the open attribute on mount when open is false", () => {
    const { result } = renderHook(({ open }) => useImagePreviewModal(open, vi.fn()), { initialProps: { open: false } });
    const dialog = attachDialog(result);

    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("sets the open attribute when open flips to true", () => {
    const { result, rerender } = renderHook(({ open }) => useImagePreviewModal(open, vi.fn()), {
      initialProps: { open: false },
    });
    attachDialog(result);

    rerender({ open: true });

    expect(result.current.dialogRef.current?.hasAttribute("open")).toBe(true);
  });

  it("removes the open attribute when open flips back to false", () => {
    const { result, rerender } = renderHook(({ open }) => useImagePreviewModal(open, vi.fn()), {
      initialProps: { open: false },
    });
    attachDialog(result);
    rerender({ open: true });
    expect(result.current.dialogRef.current?.hasAttribute("open")).toBe(true);

    rerender({ open: false });

    expect(result.current.dialogRef.current?.hasAttribute("open")).toBe(false);
  });

  it("handleNativeCancel prevents the browser default and routes through onClose", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useImagePreviewModal(true, onClose));

    const preventDefault = vi.fn();
    act(() => result.current.handleNativeCancel({ preventDefault } as never));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handleBackdropClick calls onClose only when the click target is the dialog itself", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useImagePreviewModal(true, onClose));
    const dialog = attachDialog(result);
    const child = document.createElement("img");
    dialog.appendChild(child);

    act(() => result.current.handleBackdropClick({ target: child } as never));
    expect(onClose).not.toHaveBeenCalled();

    act(() => result.current.handleBackdropClick({ target: dialog } as never));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
