import { useCallback } from "react";
import { useMenuEditor, type MenuEditorController } from "@jini-ai/admin/screens/menus/hooks/use-menu-editor.hooks";
import { navigate as realNavigate } from "@jini-ai/admin/shell/lib/router";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../menus-i18n";
import { defaultMenusPort, menusHostKit } from "../menus-host-ports";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useMenuEditor`: the real menus port, the real
 * `lib/router` `navigate`, a `MENUS_DICT`-bound translator and the menus host kit.
 */

/**
 * Binds the real `/api/.../menus` client, the real `lib/router` `navigate`, and a
 * `MENUS_DICT`-bound translator — see `@jini-ai/admin`'s `menus-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `MenuEditor.tsx` composes this and a test composes `useMenuEditor` with
 * `createFakeMenusPort`.
 */
export function useWiredMenuEditor({ menuId }: { menuId: string | null }, _optional = {}): MenuEditorController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  const navigate = useCallback((routePath: string, options?: { replace?: boolean }) => options === undefined ? realNavigate({ routePath }) : realNavigate({ routePath }, options), []);
  return useMenuEditor({ menuId, dependencies: { port: defaultMenusPort, navigate, t, kit: menusHostKit } });
}
