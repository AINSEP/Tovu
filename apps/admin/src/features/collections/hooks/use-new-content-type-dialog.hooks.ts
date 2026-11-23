import { useNewContentTypeDialog, type NewContentTypeDialogController } from "@jini-ai/admin/screens/collections/hooks/use-new-content-type-dialog.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { collectionsHostKit, defaultNewContentTypeDialogPort } from "../collections-host-ports";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useNewContentTypeDialog`: the real
 * new-content-type port, the resolved admin locale and the collections host kit.
 */

/**
 * Binds the real `/api/.../content-types` client and the resolved `useAdminLocale()` value — see
 * `new-content-type-dialog-dependencies.hooks.ts`. The zero-argument-deps half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `Collections.tsx` composes this and a test composes
 * {@link useNewContentTypeDialog} with `createFakeNewContentTypeDialogPort`.
 */
export function useWiredNewContentTypeDialog(props: {
  onCreated: () => void;
  onCancel: () => void;
}): NewContentTypeDialogController {
  const locale = useAdminLocale();
  return useNewContentTypeDialog({ props, port: defaultNewContentTypeDialogPort, locale, kit: collectionsHostKit });
}
