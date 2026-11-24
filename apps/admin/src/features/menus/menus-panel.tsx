import { Menus as MenusScreen } from "@jini-ai/admin/screens/menus/Menus";
import type { MenusController } from "@jini-ai/admin/screens/menus/hooks/use-menus.hooks";
import { useWiredMenus } from "./hooks/use-menus.hooks";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";

/**
 * @file The Menus list panel: `@jini-ai/admin`'s `Menus` screen bound to this host's wired list
 * hook, its section publish control and its `/admin/menus` routes.
 */
export interface MenusPanelProps {
  /** Test seam — defaults to the wired hook, so `panels.tsx` passes nothing. */
  useMenusHook?: () => MenusController;
}

export function Menus({ useMenusHook = useWiredMenus }: MenusPanelProps = {}) {
  return (
    <MenusScreen
      useMenusHook={useMenusHook}
      publishAction={<PublishSectionButton section="menus" />}
      newMenuHref="/admin/menus/new"
      menuHref={({ slug }) => `/admin/menus/${slug}`}
    />
  );
}
