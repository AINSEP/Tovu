import type { RefObject } from "react";
import { useFocusTrap as usePackageFocusTrap } from "@jini-ai/ui/panel-kit";

// Modal accessibility/stack rationale: Jini/packages/ui/src/features/panel-kit/hooks/use-focus-trap.hooks.ts.
/** Bind Tovu's positional hook contract to Jini's shared focus-trap stack.
 *
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
 * @file `useFocusTrap` — keeps Tab and Shift+Tab inside a div dialog that declares
 * `aria-modal="true"`. The attribute tells assistive technology everything behind the dialog is
 * unavailable; without a trap, Tab walked straight out onto the page controls behind it.
 *
 * Only the most recently activated trap acts, so a dialog opened from inside another one (e.g. a
 * media picker opened from a panel that is itself in a dialog) keeps focus in the inner one, and the
 * outer one takes over again when the inner one closes.
 *
 *  Active traps, oldest first. Module-level because traps in unrelated components must still agree
 *  on which one is on top.
 *
 * Where Tab should go instead of where the browser would send it, or `null` to leave it alone.
 * Wraps at either end, and pulls focus back in when it is already outside the container.
 *
 * @complexity O(n) in the number of elements inside the container (one `querySelectorAll`).
 *
 * Traps Tab focus inside `containerRef` while `active` is true.
 *
 * @param containerRef - The element carrying `role="dialog"`.
 * @param active - Defaults to true; pass false to suspend the trap without unmounting.
 * @sideeffects One `document` keydown listener per active trap; `preventDefault` + `focus()` only
 *   when Tab would otherwise leave the container.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active = true): void {
  usePackageFocusTrap({ containerRef }, { active });
}
