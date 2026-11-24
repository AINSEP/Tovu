import type { AdminContentType } from "@jini-ai/admin/screens/collections/api/collections-api.types";
import { useEditFieldsDialog, type EditFieldsDialogController } from "@jini-ai/admin/screens/collections/hooks/use-edit-fields-dialog.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../collections-i18n";
import { collectionsHostKit, defaultEditFieldsDialogPort } from "../collections-host-ports";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useEditFieldsDialog`: the real edit-fields
 * port, a `COLLECTIONS_DICT`-bound translator and the collections host kit.
 */

/**
 * Binds the real `/api/.../content-types/{key}/fields` client — see
 * `edit-fields-dialog-dependencies.hooks.ts`.
 *
 * The zero-argument-port half of the `useX(dependencies)` / `useWiredX()` pair, so `Collections.tsx`
 * composes this and a test composes {@link useEditFieldsDialog} with
 * `createFakeEditFieldsDialogPort`.
 */
export function useWiredEditFieldsDialog(props: {
  contentType: AdminContentType;
  onSaved: () => void;
  onCancel: () => void;
}): EditFieldsDialogController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return useEditFieldsDialog({ props, port: defaultEditFieldsDialogPort, kit: collectionsHostKit }, { t });
}
