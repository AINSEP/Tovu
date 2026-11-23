import { describe, expect, it } from "vitest";

import { isDialogBackdropClick } from "../dialog-backdrop-click";

/**
 * @file B137 — a modal `<dialog>`'s own padding is the dialog element itself, so `target === dialog`
 * is true for a click INSIDE the box as well as on the backdrop. Only a point outside the dialog's
 * bounding rect is a backdrop click; anything else must keep the modal (and its draft) open.
 */

function dialogAt(rect: { left: number; top: number; right: number; bottom: number }): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top,
    width: rect.right - rect.left, height: rect.bottom - rect.top, toJSON: () => rect });
  return dialog;
}

const BOX = { left: 100, top: 100, right: 400, bottom: 300 };

describe("isDialogBackdropClick", () => {
  it("is false for a click on the dialog's own padding — target is the dialog but the point is inside its box", () => {
    const dialog = dialogAt(BOX);
    expect(isDialogBackdropClick({ dialog, event: { target: dialog, clientX: 105, clientY: 105 } })).toBe(false);
    expect(isDialogBackdropClick({ dialog, event: { target: dialog, clientX: 400, clientY: 300 } })).toBe(false);
  });

  it.each([[99, 200], [401, 200], [250, 99], [250, 301]])("is true for a dialog-targeted click outside the box at (%i, %i)", (clientX, clientY) => {
    const dialog = dialogAt(BOX);
    expect(isDialogBackdropClick({ dialog, event: { target: dialog, clientX, clientY } })).toBe(true);
  });

  it("is false for a click on content, even outside the box (an overflowing popover is not the backdrop)", () => {
    const dialog = dialogAt(BOX);
    const child = document.createElement("button");
    dialog.append(child);
    expect(isDialogBackdropClick({ dialog, event: { target: child, clientX: 10, clientY: 10 } })).toBe(false);
  });

  it("is false with no dialog mounted", () => {
    expect(isDialogBackdropClick({ dialog: null, event: { target: null, clientX: 0, clientY: 0 } })).toBe(false);
  });
});
