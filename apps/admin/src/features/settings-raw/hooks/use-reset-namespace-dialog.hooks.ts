import { useEffect } from "react";

/**
 * @file `ResetNamespaceDialog`'s Escape-to-cancel wiring, so `ResetNamespaceDialog` in
 * `Settings.tsx` is only markup.
 *
 * Extracted verbatim — same listener, same cleanup. This dialog owns no state of its own (it is
 * fully controlled by `SettingsContainer`'s `pendingReset`), so this hook returns nothing; its only
 * job is the effect.
 */

export interface ResetNamespaceDialogHookProps {
  onCancel: () => void;
}

/** @complexity Time/space: O(1) — one listener attached and removed per mount. */
export function useResetNamespaceDialog(props: ResetNamespaceDialogHookProps): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
