import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMessageOverflowModal } from "../MessageOverflowModal.hooks";

/**
 * @file `useMessageOverflowModal` — the `<dialog>` lifecycle extracted out of
 * `MessageOverflowModal.tsx`. Mirrors `ImagePreviewModal.hooks.unit.test.tsx` line for line: the
 * two hooks share the identical native-`<dialog>` lifecycle contract (see this hook's own module
 * doc for why it is a sibling rather than a shared import), so the same coverage shape applies.
 *
 * jsdom implements neither `HTMLDialogElement.showModal` nor `.close` — these tests exercise the
 * `setAttribute`/`removeAttribute` fallback branch directly, via `hasAttribute("open")`.
 */

function attachDialog(result: { current: ReturnType<typeof useMessageOverflowModal> }) {
  const dialog = document.createElement("dialog");
  document.body.appendChild(dialog);
  result.current.dialogRef.current = dialog;
  return dialog;
}

describe("useMessageOverflowModal", () => {
  it("does not set the open attribute on mount when open is false", () => {
    const { result } = renderHook(({ open }) => useMessageOverflowModal(open, vi.fn()), { initialProps: { open: false } });
    const dialog = attachDialog(result);

    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("sets the open attribute when open flips to true", () => {
    const { result, rerender } = renderHook(({ open }) => useMessageOverflowModal(open, vi.fn()), {
      initialProps: { open: false },
    });
    attachDialog(result);

    rerender({ open: true });

    expect(result.current.dialogRef.current?.hasAttribute("open")).toBe(true);
  });

  it("removes the open attribute when open flips back to false", () => {
    const { result, rerender } = renderHook(({ open }) => useMessageOverflowModal(open, vi.fn()), {
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
    const { result } = renderHook(() => useMessageOverflowModal(true, onClose));

    const preventDefault = vi.fn();
    act(() => result.current.handleNativeCancel({ preventDefault } as never));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handleBackdropClick calls onClose only when the click target is the dialog itself", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useMessageOverflowModal(true, onClose));
    const dialog = attachDialog(result);
    const child = document.createElement("div");
    dialog.appendChild(child);

    act(() => result.current.handleBackdropClick({ target: child } as never));
    expect(onClose).not.toHaveBeenCalled();

    act(() => result.current.handleBackdropClick({ target: dialog } as never));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
