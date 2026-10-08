import type { RefObject } from "react";
import { useFocusTrap as usePackageFocusTrap } from "@jini-ai/ui/panel-kit";

// Modal accessibility/stack rationale: Jini/packages/ui/src/features/panel-kit/hooks/use-focus-trap.hooks.ts.
/** Bind Tovu's positional hook contract to Jini's shared focus-trap stack.
 * Traps Tab and Shift+Tab inside the container while active.
 * @param containerRef - The element carrying `role="dialog"`.
 * @param active - Defaults to true; pass false to suspend the trap without unmounting.
 * @sideeffects One document keydown listener per active trap; preventDefault and focus only
 *   when Tab would otherwise leave the container.
 * @complexity O(n) in the number of elements inside the container.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active = true): void {
  usePackageFocusTrap({ containerRef }, { active });
}
