import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { AdminMedia } from "@/lib/api";

import { closeDialog, openDialog, syncLightboxDialog, useMediaLightbox } from "../hooks/use-media-lightbox.hooks";

/**
 * @file Direct tests for the top-level functions extracted out of `useMediaLightbox`'s open/close
 * effect during the complexity-ceiling pass — `openDialog`/`closeDialog` (the guarded
 * `showModal`/`close` fallback, previously the effect's most deeply-nested branch) and
 * `syncLightboxDialog` (the effect's own body). The hook's end-to-end open/close/navigate behavior
 * stays covered by `Media.unit.test.tsx`'s `describe("lightbox")` block, which drives it through
 * real rendering; these tests are about the extracted units in isolation, per the complexity-ceiling
 * brief's "every extracted unit gets its own direct unit test" rule.
 */

function fakeDialog(opts: { open?: boolean; hasShowModal?: boolean; hasClose?: boolean } = {}): HTMLDialogElement {
  const dialog = document.createElement("dialog") as HTMLDialogElement & { open: boolean };
  dialog.open = opts.open ?? false;
  if (opts.hasShowModal !== false) {
    dialog.showModal = vi.fn(() => {
      dialog.open = true;
    });
  } else {
    // @ts-expect-error — simulating an environment where showModal is not implemented.
    dialog.showModal = undefined;
  }
  if (opts.hasClose !== false) {
    dialog.close = vi.fn(() => {
      dialog.open = false;
    });
  } else {
    // @ts-expect-error — simulating an environment where close is not implemented.
    dialog.close = undefined;
  }
  return dialog;
}

describe("openDialog", () => {
  it("calls showModal() when the dialog is not already open", () => {
    const dialog = fakeDialog({ open: false });
    openDialog(dialog);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
  });

  it("does not call showModal() again when the dialog is already open (avoids InvalidStateError)", () => {
    const dialog = fakeDialog({ open: true });
    openDialog(dialog);
    expect(dialog.showModal).not.toHaveBeenCalled();
  });

  it("falls back to the open attribute when showModal is not implemented", () => {
    const dialog = fakeDialog({ hasShowModal: false });
    openDialog(dialog);
    expect(dialog.hasAttribute("open")).toBe(true);
  });
});

describe("closeDialog", () => {
  it("calls close() when the dialog is open", () => {
    const dialog = fakeDialog({ open: true });
    closeDialog(dialog);
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it("does not call close() when the dialog is already closed", () => {
    const dialog = fakeDialog({ open: false });
    closeDialog(dialog);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it("falls back to removing the open attribute when close is not implemented", () => {
    const dialog = fakeDialog({ open: true, hasClose: false });
    dialog.setAttribute("open", "");
    closeDialog(dialog);
    expect(dialog.hasAttribute("open")).toBe(false);
  });
});

describe("syncLightboxDialog", () => {
  it("opens without a close button and tolerates a non-HTML focus trigger on close", () => {
    const dialog = fakeDialog();
    const triggerRef: React.RefObject<Element | null> = { current: null };
    syncLightboxDialog(dialog, true, triggerRef, { current: null });
    expect(dialog.open).toBe(true);
    triggerRef.current = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    syncLightboxDialog(dialog, false, triggerRef, { current: null });
    expect(dialog.open).toBe(false);
  });

  it("on open: captures document.activeElement into triggerRef, opens the dialog, and focuses closeRef", () => {
    const dialog = fakeDialog({ open: false });
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const closeButton = document.createElement("button");
    dialog.appendChild(closeButton);
    document.body.appendChild(dialog);
    const focusSpy = vi.spyOn(closeButton, "focus");

    const triggerRef: React.RefObject<Element | null> = { current: null };
    const closeRef: React.RefObject<HTMLButtonElement | null> = { current: closeButton };

    syncLightboxDialog(dialog, true, triggerRef, closeRef);

    expect(triggerRef.current).toBe(trigger);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(closeButton);
    // jsdom does not enforce a closed dialog's native focus restrictions, so pin the order too.
    expect(vi.mocked(dialog.showModal).mock.invocationCallOrder[0]).toBeLessThan(focusSpy.mock.invocationCallOrder[0]);

    document.body.removeChild(trigger);
    document.body.removeChild(dialog);
  });

  it("on close: closes the dialog and restores focus to the captured trigger", () => {
    const dialog = fakeDialog({ open: true });
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const focusSpy = vi.spyOn(trigger, "focus");

    const triggerRef: React.RefObject<Element | null> = { current: trigger };
    const closeRef: React.RefObject<HTMLButtonElement | null> = { current: null };

    syncLightboxDialog(dialog, false, triggerRef, closeRef);

    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);

    document.body.removeChild(trigger);
  });

  it("on close: does not throw and does not focus anything when no trigger was captured", () => {
    const dialog = fakeDialog({ open: true });
    const triggerRef: React.RefObject<Element | null> = { current: null };
    const closeRef: React.RefObject<HTMLButtonElement | null> = { current: null };

    expect(() => syncLightboxDialog(dialog, false, triggerRef, closeRef)).not.toThrow();
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });
});

describe("lightbox navigation guards", () => {
  it("ignores navigation while closed, including keyboard events before a dialog is attached", () => {
    const navigated: number[] = [];
    const { result } = renderHook(() => useMediaLightbox({ items: [], activeIndex: null,
      onNavigate: index => navigated.push(index), onClose: () => {} }));
    const event = { key: "ArrowRight", preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDialogElement>;
    act(() => {
      result.current.goToPrev();
      result.current.goToNext();
      result.current.handleKeyDown(event);
    });
    expect(navigated).toEqual([]);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(result.current.item).toBeNull();
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(false);
  });

  it("clamps the previous and next actions and leaves unrelated keys to the browser", () => {
    const navigated: number[] = [];
    // This controller only resolves media by index; rendering owns the asset fields.
    const items = [{ id: "first" }, { id: "second" }] as AdminMedia[];
    const { result, rerender } = renderHook(({ activeIndex }) => useMediaLightbox({ items, activeIndex,
      onNavigate: index => navigated.push(index), onClose: () => {} }), { initialProps: { activeIndex: 0 } });
    act(() => { result.current.goToPrev(); result.current.goToNext(); });
    expect(navigated).toEqual([1]);
    rerender({ activeIndex: 1 });
    act(() => { result.current.goToNext(); result.current.goToPrev(); });
    expect(navigated).toEqual([1, 0]);
    const event = { key: "Home", preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDialogElement>;
    act(() => result.current.handleKeyDown(event));
    expect(navigated).toEqual([1, 0]);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(result.current.item).toBe(items[1]);
  });
});
