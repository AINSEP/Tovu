import { useEffect } from "react";

/**
 * @file Shared Escape-to-cancel keydown listener for `FieldAttributesDialog` — same helper
 * `collections/hooks/use-escape-to-cancel.hooks.ts` provides for that feature's dialogs, kept
 * feature-local here rather than promoted to `src/hooks/` since only one feature needs it apiece so
 * far; promote if a third feature needs the same thing.
 */
export function useEscapeToCancel(onCancel: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);
}
