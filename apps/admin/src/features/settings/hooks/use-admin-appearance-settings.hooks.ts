import { useSettingsAppearance } from "../../../hooks/use-admin-appearance.hooks";
import { useSettingsSlice } from "../../../hooks/use-settings-slice.hooks";
import { useAdminThemeState } from "../../../admin-themes/use-admin-theme.hooks";
import {
  APPEARANCE_NAMESPACE, DEFAULT_APPEARANCE, adminThemeAccent, loadAppearance, saveAppearance, type AppearanceConfig,
} from "../../../lib/settings-tabs";

/** The former Settings Appearance tab: same ledger, debounce, diff base and accent preview.
 * Only this slice mounts here; unrelated Settings loads cannot delay editing appearance.
 * @complexity O(1): one fixed-shape slice; Jini owns save/refresh lifecycle and unmount flushing. */
export function useAdminAppearanceSettings(_required: object = {}, { root = document.documentElement } = {}) {
  const { themeId } = useAdminThemeState({}, { root });
  const appearance = useSettingsSlice<AppearanceConfig>({
    load: loadAppearance,
    save: saveAppearance,
    defaultValue: DEFAULT_APPEARANCE,
    namespaces: [APPEARANCE_NAMESPACE],
  });
  useSettingsAppearance({ accentColor: appearance.value ? adminThemeAccent({ appearance: appearance.value, themeId }, {}) : undefined, ready: appearance.value !== null }, { root });
  return appearance;
}
