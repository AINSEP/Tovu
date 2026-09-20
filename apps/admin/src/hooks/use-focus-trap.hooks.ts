import { useEffect, type RefObject } from "react";

/**
 * @file `useFocusTrap` — keeps Tab and Shift+Tab inside a div dialog that declares
 * `aria-modal="true"`. The attribute tells assistive technology everything behind the dialog is
 * unavailable; without a trap, Tab walked straight out onto the page controls behind it.
 *
 * Only the most recently activated trap acts, so a dialog opened from inside another one (e.g. a
 * media picker opened from a panel that is itself in a dialog) keeps focus in the inner one, and the
 * outer one takes over again when the inner one closes.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Active traps, oldest first. Module-level because traps in unrelated components must still agree
 *  on which one is on top. */
const activeTraps: Array<RefObject<HTMLElement | null>> = [];

/**
 * Where Tab should go instead of where the browser would send it, or `null` to leave it alone.
 * Wraps at either end, and pulls focus back in when it is already outside the container.
 *
 * @complexity O(n) in the number of elements inside the container (one `querySelectorAll`).
 */
function redirectTarget(container: HTMLElement, shiftKey: boolean): HTMLElement | null {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusable.length === 0) return null;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;
  if (!(active instanceof Node) || !container.contains(active)) return shiftKey ? last : first;
  if (shiftKey && active === first) return last;
  if (!shiftKey && active === last) return first;
  return null;
}

/**
 * Traps Tab focus inside `containerRef` while `active` is true.
 *
 * @param containerRef - The element carrying `role="dialog"`.
 * @param active - Defaults to true; pass false to suspend the trap without unmounting.
 * @sideeffects One `document` keydown listener per active trap; `preventDefault` + `focus()` only
 *   when Tab would otherwise leave the container.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    activeTraps.push(containerRef);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || activeTraps[activeTraps.length - 1] !== containerRef) return;
      const container = containerRef.current;
      if (!container) return;
      const target = redirectTarget(container, event.shiftKey);
      if (!target) return;
      event.preventDefault();
      target.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      activeTraps.splice(activeTraps.lastIndexOf(containerRef), 1);
    };
  }, [containerRef, active]);
}
