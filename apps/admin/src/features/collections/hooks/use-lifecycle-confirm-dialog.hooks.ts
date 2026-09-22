import { useRef, type RefObject } from "react";

import { autoFocusCancelForLifecycleOp, lifecycleCopy, type LifecycleConfirmOp } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useEscapeToCancel } from "./use-escape-to-cancel.hooks";
import { useFocusTrap } from "@/hooks/use-focus-trap.hooks";

/**
 * @file `LifecycleConfirmDialog`'s only two behaviours — Escape-to-cancel and the op-derived copy/
 * focus decision — so the dialog in `Collections.tsx` is only markup. This dialog holds no state
 * of its own; both derivations move to `rules.ts` (`LIFECYCLE_COPY`, `autoFocusCancelForLifecycleOp`)
 * since they compute a value from `op`, not just render one.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/collections` needs it.
 */

export interface LifecycleConfirmDialogController {
  copy: { title: string; body: string };
  autoFocusCancel: boolean;
  /** Attach to the dialog's own `role="dialog"` root so `useFocusTrap` (M3) can find it. */
  dialogRef: RefObject<HTMLDivElement | null>;
}

export function useLifecycleConfirmDialog(props: {
  op: LifecycleConfirmOp;
  onCancel: () => void;
}): LifecycleConfirmDialogController {
  const locale = useAdminLocale();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEscapeToCancel(props.onCancel);
  useFocusTrap(dialogRef);

  return {
    copy: lifecycleCopy(props.op, locale),
    autoFocusCancel: autoFocusCancelForLifecycleOp(props.op),
    dialogRef,
  };
}
