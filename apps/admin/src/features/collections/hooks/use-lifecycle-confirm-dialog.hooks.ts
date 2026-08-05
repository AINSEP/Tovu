import { LIFECYCLE_COPY, autoFocusCancelForLifecycleOp, type LifecycleConfirmOp } from "../rules";
import { useEscapeToCancel } from "./use-escape-to-cancel.hooks";

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
}

export function useLifecycleConfirmDialog(props: {
  op: LifecycleConfirmOp;
  onCancel: () => void;
}): LifecycleConfirmDialogController {
  useEscapeToCancel(props.onCancel);

  return {
    copy: LIFECYCLE_COPY[props.op],
    autoFocusCancel: autoFocusCancelForLifecycleOp(props.op),
  };
}
