import { paintAdminAccent } from "@jini-ai/admin/shell/lib/paint-admin-accent";
import { readableTextColor } from "@jini-ai/ui";
import { useInvalidate } from "@jini-ai/ui/fetch-query";
import { bindAdminAppearance } from "@jini-ai/admin/react/shell/appearance";
import { APPEARANCE_NAMESPACE, adminThemeAccent, loadAppearance } from "../lib/settings-tabs";
import { subscribeToSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { useAdminThemeState } from "../admin-themes/use-admin-theme.hooks";
import { advanceAppearancePreview } from "@jini-ai/admin/shell/hooks/use-admin-appearance-snapshot.hooks";
import { useAdminAppearanceSnapshot } from "./use-admin-appearance-snapshot.hooks";

export const { useAdminAppearance, useSettingsAppearance } = bindAdminAppearance({
  hooks: {
    useThemeStateHook: useAdminThemeState,
    useAppearanceSnapshotHook: useAdminAppearanceSnapshot,
    useInvalidateHook: useInvalidate,
  },
  deps: {
    namespace: APPEARANCE_NAMESPACE,
    loadAppearance,
    subscribeToSettingsRefresh,
    advancePreview: advanceAppearancePreview,
    getRoot: () => document.documentElement,
    paintAccent: ({ accentColor, root }, _optional) => paintAdminAccent({ accent: accentColor, root, deps: { readableTextColor } }, {}),
    resolveAccent: adminThemeAccent,
  },
});
