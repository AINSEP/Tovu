import { useLayoutEffect } from "react";
import { BEFORE_LINK_NAVIGATION_EVENT } from "@jini-ai/admin/browser";
import type { MenuEditorController } from "@jini-ai/admin/screens/menus/hooks/use-menu-editor.hooks";
import { useWiredMenuEditor } from "./use-menu-editor.hooks";

// The sidebar never calls the header; bind the dirty check while mounted and let the router own Back too.
export function useRouteGuardedMenuEditor({ menuId }: { menuId: string | null }, _optional = {}): MenuEditorController {
  const controller = useWiredMenuEditor({ menuId });
  const { confirmLeave } = controller;
  useLayoutEffect(() => {
    const onBefore = (event: Event) => { if (!confirmLeave()) event.preventDefault(); };
    window.addEventListener(BEFORE_LINK_NAVIGATION_EVENT, onBefore);
    return () => window.removeEventListener(BEFORE_LINK_NAVIGATION_EVENT, onBefore);
  }, [confirmLeave]);
  return { ...controller, leaveGuardOwner: "router" };
}
