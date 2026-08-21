import { useEffect } from "react";

/**
 * @file Shared Escape-to-cancel keydown listener.
 *
 * `Collections.tsx`'s three modal dialogs (`NewContentTypeDialog`, `EditFieldsDialog`,
 * `LifecycleConfirmDialog`) each had an identical `useEffect` for this before this extraction —
 * consolidated per the inline-refactor step: same effect body, same cleanup, one place to get
 * right instead of three.
 *
 * `onCancel` is a dependency (2026-08-21 lint pass): none of the three callers memoize the
 * callback they pass in, so the listener rebinds on their re-renders. Harmless — the
 * `removeEventListener`/`addEventListener` pair runs synchronously in the same effect commit, so
 * there is no window for a dropped or double-fired Escape.
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
