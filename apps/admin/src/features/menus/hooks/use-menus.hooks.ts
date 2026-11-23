import { useMenus, type MenusController } from "@jini-ai/admin/screens/menus/hooks/use-menus.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";

import { t as translate } from "../menus-i18n";
import { defaultMenusPort, menusHostKit } from "../menus-host-ports";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useMenus`: the real menus port, a
 * `MENUS_DICT`-bound translator and the request-error kit.
 */

/**
 * Binds the real `/api/.../menus` client and a `MENUS_DICT`-bound translator — see
 * `menus-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Menus` composes
 * this and a test composes {@link useMenus} with `createFakeMenusPort`.
 */
export function useWiredMenus(): MenusController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return useMenus({ port: defaultMenusPort, t, kit: menusHostKit });
}
