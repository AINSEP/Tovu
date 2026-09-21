import { useEffect, useRef, type RefObject } from "react";

import { useFocusTrap } from "../../hooks/use-focus-trap.hooks";

/**
 * @file `ExternalMcpToolsModal.tsx`'s own derived-value logic, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` pattern (admin TSX-logic-sweep, 2026-09-05) — this repo's rule
 * that a `.tsx` file carries no functions or derived logic of its own. Mirrors
 * `hooks/use-external-mcp-remove-confirm.hooks.ts`'s own Escape-to-cancel effect (same listener,
 * same cleanup). Kept as this modal's OWN copy rather than importing that file's hook: the two
 * dialogs are otherwise unrelated (that one also derives remove-confirmation copy, which this modal
 * has no equivalent of), and that file's own header already gives the reasoning for not sharing an
 * 8-line effect across a second caller — the point to extract a shared one is a THIRD consumer, not
 * two.
 *
 * Now also owns the Tab trap (2026-09-20 focus-trap inventory, plan-components.md Part 3): this
 * modal declares `aria-modal="true"` but nothing kept Tab from walking out onto the page behind it.
 * `dialogRef`/`useFocusTrap` are returned from here rather than created in the `.tsx` body, for the
 * same "ref and its consuming hook stay together" reason `use-external-mcp-remove-confirm.hooks.ts`
 * gives.
 */

export interface ExternalMcpToolsModalController {
  /** Attach to the modal's own `aria-modal` root — see this file's header. */
  dialogRef: RefObject<HTMLDivElement | null>;
}

/** Calls `onClose` when Escape is pressed anywhere in the document, for as long as the modal stays
 *  mounted, and traps Tab inside the returned `dialogRef`.
 *
 *  @complexity O(1) per keypress; one listener for the lifetime of the mount. */
export function useExternalMcpToolsModalEscape(onClose: () => void): ExternalMcpToolsModalController {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  return { dialogRef };
}
