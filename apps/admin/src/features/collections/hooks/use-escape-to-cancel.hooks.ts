import { useEffect } from "react";

/**
 * @file Shared Escape-to-cancel keydown listener.
 *
 * `Collections.tsx`'s three modal dialogs (`NewContentTypeDialog`, `EditFieldsDialog`,
 * `LifecycleConfirmDialog`) each had an identical `useEffect` for this before this extraction —
 * consolidated per the inline-refactor step: same effect body, same cleanup, same
 * `eslint-disable` for the intentionally-empty dependency array, one place to get right instead of
 * three.
 */
export function useEscapeToCancel(onCancel: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
