import { useEffect, useRef, type RefObject } from "react";

import { useFocusTrap } from "../../../hooks/use-focus-trap.hooks";
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
 *
 * Also owns the Tab trap (2026-09-20 focus-trap inventory, plan-components.md Part 3): this dialog
 * declares `aria-modal="true"` but nothing kept Tab from walking out onto the page behind it. The
 * `dialogRef`/`useFocusTrap` pair lives here rather than in the `.tsx` body, so the ref and the
 * hook that consumes it stay together — a rendering-only component file cannot silently drop the
 * `ref={dialogRef}` attribute without also dropping the whole controller wire-up a test exercises.
 */

export interface ExternalMcpRemoveConfirmController {
  copy: RemoveConfirmCopy;
  /** Attach to the dialog's own `aria-modal` root — see this file's header. */
  dialogRef: RefObject<HTMLDivElement | null>;
}

export function useExternalMcpRemoveConfirm(props: {
  name: string;
  isOAuth: boolean;
  onCancel: () => void;
}): ExternalMcpRemoveConfirmController {
  const { onCancel } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  return { copy: buildExternalMcpRemoveConfirmCopy({ name: props.name, isOAuth: props.isOAuth }), dialogRef };
}
