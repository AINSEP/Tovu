import { autoFocusCancelForLifecycleOp, lifecycleCopy, type LifecycleConfirmOp } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";

/**
 * @file `LifecycleConfirmDialog`'s op-derived copy/focus decision — native cancellation and
 * focus lifecycle now belong to Jini, so the dialog in `Collections.tsx` is only markup. This dialog holds no state
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
  const locale = useAdminLocale();
  return {
    copy: lifecycleCopy(props.op, locale),
    autoFocusCancel: autoFocusCancelForLifecycleOp(props.op),
  };
}
