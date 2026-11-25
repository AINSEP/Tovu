import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import { MenuEditor as MenuEditorScreen } from "@jini-ai/admin/screens/menus/MenuEditor";
import type { MenuEditorController } from "@jini-ai/admin/screens/menus/hooks/use-menu-editor.hooks";
import { useMenuItemRemove } from "@jini-ai/admin/screens/menus/MenuEditor.hooks";
import { useMenuPageLinkFields, useMenuTargetEditor } from "@jini-ai/admin/screens/menus/MenuPageLinkFields.hooks";

/**
 * @file The menu editor panel: `@jini-ai/admin`'s `MenuEditor` screen bound to this host's wired
 * controller hook, the `@jini-ai/ui` tab-strip helpers, the screen's own row hooks and the
 * `/admin/menus` list route. The tree-editor markup lives in `@jini-ai/admin`; the host owns only
 * this composition.
 *
 * STAYS-HOST (host composition): binds the host's wired hook, `@jini-ai/ui` tab strip and routes.
 */
export interface MenuEditorProps {
  menuId: string | null;
  /** The host must inject the controller hook that owns this editor's leave guard. */
  useMenuEditorHook: (required: { menuId: string | null }) => MenuEditorController;
}

const ROW_HOOKS = { useMenuItemRemove, useMenuTargetEditor, useMenuPageLinkFields };
const TAB_STRIP = { useTabBarKeyboard, resolveTabBarTabIndex };

export function MenuEditor({ menuId, useMenuEditorHook }: MenuEditorProps) {
  return <MenuEditorScreen menuId={menuId} useMenuEditorHook={useMenuEditorHook} tabStrip={TAB_STRIP} rowHooks={ROW_HOOKS} menusHref="/admin/menus" />;
}
