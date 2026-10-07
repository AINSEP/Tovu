import { DEFAULT_INTERFACE, type InterfaceConfig } from "@/lib/settings-tabs";

/**
 * @file Settings → User Interface's toggle state. The slice (`useSettingsUi`'s `interface`, a
 * `useSettingsSlice` over `core.interface`) owns load, debounce and autosave; this only maps the
 * switches onto it, so `UserInterfaceSettingsPanel.tsx` stays markup.
 */

export interface UserInterfaceTabSlice {
  /** `null` until the slice loads; the panel only mounts after Settings' loading gate, but the
   *  default keeps the switch honest if it ever renders earlier. */
  value: InterfaceConfig | null;
  onChange: (next: InterfaceConfig) => void;
}

export interface UserInterfaceTab {
  hideChatFabWhileOpen: boolean;
  toggleHideChatFabWhileOpen: () => void;
  wrapTabs: boolean;
  toggleWrapTabs: () => void;
}

/** @complexity O(1). */
export function useUserInterfaceTab(slice: UserInterfaceTabSlice): UserInterfaceTab {
  const value = slice.value ?? DEFAULT_INTERFACE;
  const { onChange } = slice;
  return {
    hideChatFabWhileOpen: value.hideChatFabWhileOpen,
    toggleHideChatFabWhileOpen: () => onChange({ ...value, hideChatFabWhileOpen: !value.hideChatFabWhileOpen }),
    wrapTabs: value.wrapTabs,
    toggleWrapTabs: () => onChange({ ...value, wrapTabs: !value.wrapTabs }),
  };
}
