import { useSettingsAppearance } from "../../../hooks/use-admin-appearance.hooks";
import { useSettingsSlice } from "../../../hooks/use-settings-slice.hooks";
import {
  APPEARANCE_NAMESPACE, DEFAULT_APPEARANCE, loadAppearance, saveAppearance, type AppearanceConfig,
} from "../../../lib/settings-tabs";

/** The former Settings Appearance tab: same ledger, debounce, diff base and accent preview.
 * Only this slice mounts here; unrelated Settings loads cannot delay editing appearance.
 * @complexity O(1): one fixed-shape slice; Jini owns save/refresh lifecycle and unmount flushing. */
export function useAdminAppearanceSettings() {
  const appearance = useSettingsSlice<AppearanceConfig>({
    load: loadAppearance,
    save: saveAppearance,
    defaultValue: DEFAULT_APPEARANCE,
    namespaces: [APPEARANCE_NAMESPACE],
  });
  useSettingsAppearance({ accentColor: appearance.value?.accentColor ?? DEFAULT_APPEARANCE.accentColor, ready: appearance.value !== null }, {});
  return appearance;
}

