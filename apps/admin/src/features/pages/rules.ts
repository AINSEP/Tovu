import { createPageRouteRules } from "@jini-ai/admin/pages/page-route-rules";
import { STATIC_TIER_PAGE_SHELL_TEMPLATES } from "./hooks/use-theme-canvas-styling.hooks";

export const PAGES_RESOURCE = "pages";
export const HOME_PAGE_HANDLE = "home";

export const { pageAdminPath, themePageRowMenuItems, pagePickerValue } = createPageRouteRules({
  deps: {
    routeBase: "/pages", rootAlias: HOME_PAGE_HANDLE,
    shellNames: STATIC_TIER_PAGE_SHELL_TEMPLATES,
    actions: { details: { key: "details", label: "Details" }, edit: { key: "edit", label: "Edit" } },
  },
});
