import { useEffect } from "react";

import { buildExternalMcpRemoveConfirmCopy, type RemoveConfirmCopy } from "../rules";

/**
 * @file `ExternalMcpRemoveConfirmDialog`'s only two behaviours — Escape-to-cancel and the
 * name/auth-mode-derived copy — so the dialog component itself is only markup. Mirrors
 * `features/collections/hooks/use-lifecycle-confirm-dialog.hooks.ts` (same split, same reason:
 * `copy` is a derived value, not something the component should compute inline).
 *
 * Not sharing `features/collections`' own `useEscapeToCancel` here: that hook is feature-local by
 * design (its own file header says nothing outside `features/collections` needs it), and this is
 * the only consumer in `features/settings` so far — duplicating an 8-line effect is cheaper than a
 * cross-feature import for one caller. If a third feature needs the same listener, that is the
 * point to extract a shared one, not before.
 */

export interface ExternalMcpRemoveConfirmController {
  copy: RemoveConfirmCopy;
}

export function useExternalMcpRemoveConfirm(props: {
  name: string;
  isOAuth: boolean;
  onCancel: () => void;
}): ExternalMcpRemoveConfirmController {
  const { onCancel } = props;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  return { copy: buildExternalMcpRemoveConfirmCopy({ name: props.name, isOAuth: props.isOAuth }) };
}
