/**
 * @file Host binding of the shared interface-preferences hook (Settings -> User Interface): supplies
 * the live port over `lib/settings-tabs`, the namespace, the defaults and the host's fetch-query
 * hooks. The load-then-follow-refreshes behaviour and `resolveAdminLayoutClassName` live in
 * `@jini-ai/admin/shell/hooks/use-interface-preferences.hooks`.
 */
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import {
  useInterfacePreferences as useSharedInterfacePreferences,
  type InterfacePreferencesPort as SharedInterfacePreferencesPort,
} from "@jini-ai/admin/shell/hooks/use-interface-preferences.hooks";
import { subscribeToSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { DEFAULT_INTERFACE, INTERFACE_NAMESPACE, loadInterface, type InterfaceConfig } from "../lib/settings-tabs";

export type InterfacePreferencesPort = SharedInterfacePreferencesPort<InterfaceConfig>;

export const defaultInterfacePreferencesPort: InterfacePreferencesPort = {
  loadInterface,
  subscribeToSettingsRefresh: ({ listener }, _options = {}) =>
    subscribeToSettingsRefresh((scope) => {
      if (scope === null || scope.includes(INTERFACE_NAMESPACE)) listener();
    }),
};

/** {@link DEFAULT_INTERFACE} until the stored values arrive; a failed read keeps the last values. */
export function useInterfacePreferences(port: InterfacePreferencesPort = defaultInterfacePreferencesPort): InterfaceConfig {
  return useSharedInterfacePreferences<InterfaceConfig>({ port, namespace: INTERFACE_NAMESPACE, defaultPreferences: DEFAULT_INTERFACE, useFetchQuery, useInvalidate });
}
