import { useTrash, type TrashController, type TrashDependencies } from "@jini-ai/admin/screens/trash/hooks/use-trash.hooks";
import { describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { describeTrashLoadError } from "../rules";
import { t } from "../trash-i18n";
import { defaultTrashPort } from "./trash-dependencies.hooks";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useTrash`: the real Trash port, the resolved
 * admin locale, this host's Trash dictionary and its request-error describers.
 */

/** The host-owned collaborators every `useTrash` mount here receives (everything but port + locale). */
export const trashHostDeps: Pick<TrashDependencies, "t" | "describeLoadError" | "describeApiError"> = {
  t,
  describeLoadError: describeTrashLoadError,
  describeApiError,
};

/**
 * Binds the real client and the resolved locale — the zero-argument half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `Trash.tsx` composes this and a test composes
 * `useTrash` with `createFakeTrashPort` and {@link trashHostDeps}.
 */
export function useWiredTrash(): TrashController {
  const locale = useAdminLocale();
  return useTrash({ port: defaultTrashPort, locale, ...trashHostDeps });
}
