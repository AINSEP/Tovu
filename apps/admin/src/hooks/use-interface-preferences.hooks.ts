import { useEffect, useState } from "react";

import { DEFAULT_INTERFACE, INTERFACE_NAMESPACE, loadInterface, type InterfaceConfig } from "../lib/settings-tabs";
import { subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";
import { useSettlementGeneration } from "./use-settlement-generation.hooks";

/**
 * @file Settings → User Interface's preferences, read live for the admin shell. `App.tsx` turns them
 * into classes on `.admin-layout` that gate CSS rules:
 *
 * - "Hide the chat button while the chat is open" (owner, 2026-10-06) → `hides-fab-while-open`,
 *   which gates the hide-while-open rules (`styles/assistant.css` for desktop, `styles.css` for the
 *   phone sheet), so the FAB either hides while the dock is open (default, the ✕ closes it) or
 *   stays on top of it and toggles it closed.
 * - "Wrap tabs instead of scrolling" (owner, 2026-10-07) → `wraps-tabs`, which turns the phone's
 *   one-row swipeable tab strips (`styles.css`, mobile catalog P-2) back into wrapping rows.
 *
 * Same load-then-follow-refreshes shape as `useAdminLocale`: the Settings tab's own save echoes
 * back over the settings-changed feed, so flipping a toggle updates the shell without a reload.
 * One read covers every preference in the namespace.
 */

export interface InterfacePreferencesPort {
  loadInterface(): Promise<InterfaceConfig>;
  subscribeToSettingsRefresh(listener: () => void): () => void;
}

export const defaultInterfacePreferencesPort: InterfacePreferencesPort = {
  loadInterface,
  subscribeToSettingsRefresh: (listener) =>
    subscribeToSettingsRefresh((scope) => {
      if (scope === null || scope.includes(INTERFACE_NAMESPACE)) listener();
    }),
};

/**
 * {@link DEFAULT_INTERFACE} until the stored values arrive, so the default behaviour never flickers
 * in. A failed read keeps the last values rather than flipping the shell on a network error.
 *
 * @complexity O(1) per load.
 */
export function useInterfacePreferences(port: InterfacePreferencesPort = defaultInterfacePreferencesPort): InterfaceConfig {
  const [preferences, setPreferences] = useState(DEFAULT_INTERFACE);
  const settlement = useSettlementGeneration();
  useEffect(() => {
    let cancelled = false;
    const fetchPreferences = () => {
      const generation = settlement.next();
      port
        .loadInterface()
        .then((next) => {
          if (!cancelled && settlement.isCurrent(generation)) setPreferences(next);
        })
        .catch(() => undefined);
    };
    fetchPreferences();
    const unsubscribe = port.subscribeToSettingsRefresh(fetchPreferences);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [port]);
  return preferences;
}

/** `.admin-layout`'s class list: each preference's CSS rules apply only under its class. */
export function resolveAdminLayoutClassName(preferences: InterfaceConfig): string {
  return [
    "admin-layout",
    preferences.hideChatFabWhileOpen ? "hides-fab-while-open" : null,
    preferences.wrapTabs ? "wraps-tabs" : null,
  ].filter(Boolean).join(" ");
}
