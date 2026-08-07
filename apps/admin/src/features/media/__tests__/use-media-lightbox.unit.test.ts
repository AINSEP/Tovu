import { describe, expect, it, vi } from "vitest";

import { closeDialog, openDialog, syncLightboxDialog } from "../hooks/use-media-lightbox.hooks";

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
  it("on open: captures document.activeElement into triggerRef, opens the dialog, and focuses closeRef", () => {
    const dialog = fakeDialog({ open: false });
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const closeButton = document.createElement("button");
    document.body.appendChild(closeButton);
    const focusSpy = vi.spyOn(closeButton, "focus");

    const triggerRef: React.RefObject<Element | null> = { current: null };
    const closeRef: React.RefObject<HTMLButtonElement | null> = { current: closeButton };

    syncLightboxDialog(dialog, true, triggerRef, closeRef);

    expect(triggerRef.current).toBe(trigger);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);

    document.body.removeChild(trigger);
    document.body.removeChild(closeButton);
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
