import { useEffect } from "react";

/**
 * @file `PublishContentDialog`'s only behaviour — Escape-to-cancel. Same one-behaviour-per-hook
 * split every other confirm dialog in this app uses (see
 * `features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts`), minus that pair's copy
 * builder: this dialog's body text has no per-instance name/variant to interpolate, so it is
 * written directly in `PublishContentDialog.tsx` via `t()`, the same way `Dashboard.tsx` renders
 * its own static strings. A copy-builder function here would just wrap constants.
 */

/**
 * @param props.onCancel Called when the dialog should close (Escape pressed).
 * @complexity Time/space: O(1) — one document-level listener for the component's mounted lifetime.
 */
export function usePublishContentConfirm(props: { onCancel: () => void }): void {
  const { onCancel } = props;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);
}
