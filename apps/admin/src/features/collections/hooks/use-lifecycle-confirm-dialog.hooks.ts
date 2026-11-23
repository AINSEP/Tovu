import type { LifecycleConfirmOp } from "@jini-ai/admin/screens/collections/rules";
import { useLifecycleConfirmDialog, type LifecycleConfirmDialogController } from "@jini-ai/admin/screens/collections/hooks/use-lifecycle-confirm-dialog.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { collectionsHostKit } from "../collections-host-ports";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useLifecycleConfirmDialog`: the resolved admin
 * locale and the collections host kit.
 */

/** Binds the resolved `useAdminLocale()` value and {@link collectionsHostKit}; the zero-deps half
 *  `LifecycleConfirmDialog` mounts. */
export function useWiredLifecycleConfirmDialog(props: {
  op: LifecycleConfirmOp;
  onCancel: () => void;
}): LifecycleConfirmDialogController {
  const locale = useAdminLocale();
  return useLifecycleConfirmDialog({ props, locale, kit: collectionsHostKit });
}
