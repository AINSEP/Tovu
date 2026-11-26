import { paintAdminAccent } from "@jini-ai/admin/shell/lib/paint-admin-accent";
import { readableTextColor } from "@jini-ai/ui";
import { useInvalidate } from "@jini-ai/ui/fetch-query";
import { createAppearanceDraftStore, useAdminAppearance as useJiniAdminAppearance, useSettingsAppearance as useJiniSettingsAppearance } from "@jini-ai/admin/react/shell/appearance";
import { APPEARANCE_NAMESPACE, adminThemeAccent, loadAppearance, type AppearanceConfig } from "../lib/settings-tabs";
import { subscribeToSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { useAdminThemeState } from "../admin-themes/use-admin-theme.hooks";
import { advanceAppearancePreview } from "@jini-ai/admin/shell/hooks/use-admin-appearance-snapshot.hooks";
import { useAdminAppearanceSnapshot } from "./use-admin-appearance-snapshot.hooks";

export interface AdminAppearancePort {
  loadAppearance(): Promise<AppearanceConfig>;
  subscribeToSettingsRefresh(required: { listener: () => void }): () => void;
}
const defaultPort: AdminAppearancePort = {
  loadAppearance,
  subscribeToSettingsRefresh: ({ listener }, _options = {}) => subscribeToSettingsRefresh((scope) => {
    if (scope === null || scope.includes(APPEARANCE_NAMESPACE)) listener();
  }),
};

const previewAccents = createAppearanceDraftStore({}, {});

const applyAccent = ({ accentColor, root }: { accentColor: string | undefined; root: HTMLElement }, _optional: object) => paintAdminAccent({ accent: accentColor, root, deps: { readableTextColor } }, {});

/** Follow the appearance ledger, protecting each theme's drafts newer than the accepted read.
 * @complexity O(n) per accepted read/theme switch for n cached drafts; root state is weakly held. */
export function useAdminAppearance(_required: object, { port = defaultPort, root = document.documentElement } = {}) {
  return useJiniAdminAppearance({
    store: previewAccents, root, port,
    useThemeStateHook: useAdminThemeState,
    useAppearanceSnapshotHook: useAdminAppearanceSnapshot,
    useInvalidateHook: useInvalidate,
    paintAccent: applyAccent, resolveAccent: adminThemeAccent,
    queryPrefix: ["settings", APPEARANCE_NAMESPACE],
  }, {});
}

/** Preview the active theme's resolved draft before the debounced ledger save completes. */
export function useSettingsAppearance({ accentColor, ready }: { accentColor: string | undefined; ready: boolean }, { root = document.documentElement } = {}) {
  return useJiniSettingsAppearance({
    accentColor, ready, store: previewAccents, root,
    useThemeStateHook: useAdminThemeState,
    advancePreview: advanceAppearancePreview, paintAccent: applyAccent,
  }, {});
}
