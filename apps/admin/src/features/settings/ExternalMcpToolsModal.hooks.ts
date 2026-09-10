import { useEffect } from "react";

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
 */

/** Calls `onClose` when Escape is pressed anywhere in the document, for as long as the modal stays
 *  mounted. No focus-trap or scroll-lock — the same scope `ExternalMcpRemoveConfirmDialog`'s own
 *  Escape listener covers and nothing more.
 *
 *  @complexity O(1) per keypress; one listener for the lifetime of the mount. */
export function useExternalMcpToolsModalEscape(onClose: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
}
