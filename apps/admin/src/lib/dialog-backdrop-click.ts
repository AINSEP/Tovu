/**
 * @file Whether a click on a modal `<dialog>` landed on its backdrop (B137).
 *
 * `e.target === dialog` alone is not enough: the dialog's own padding IS the dialog element, so
 * that check is also true for a click inside the box — and closing there loses the open draft.
 * A click on the `::backdrop` is also dispatched to the dialog element, but its point is OUTSIDE
 * the dialog's bounding rect; that is the one fact that tells the two apart.
 */

/** The few `MouseEvent` fields the decision reads — a React or DOM mouse event both fit. */
export interface DialogClickPoint {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
}

/**
 * True only for a click targeting the dialog itself at a point outside its box. A click on content
 * (any child) is never a backdrop click, even when it overflows the box (a popover, a menu).
 * @complexity O(1) — one layout read.
 * @example dialog.onclick = (e) => { if (isDialogBackdropClick({ dialog, event: e })) onClose(); };
 */
export function isDialogBackdropClick(
  { dialog, event }: { dialog: Element | null; event: DialogClickPoint },
  _optional: Record<string, never> = {},
): boolean {
  if (!dialog || event.target !== dialog) return false;
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}
