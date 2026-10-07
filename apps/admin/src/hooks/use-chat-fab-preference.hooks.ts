import { useEffect, useState } from "react";

import { DEFAULT_INTERFACE, INTERFACE_NAMESPACE, loadInterface } from "../lib/settings-tabs";
import { subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";
import { useSettlementGeneration } from "./use-settlement-generation.hooks";

/**
 * @file Settings → User Interface's "Hide the chat button while the chat is open" preference, read
 * live for the admin shell (owner, 2026-10-06). `App.tsx` turns it into a class on `.admin-layout`
 * that gates the hide-while-open CSS rules (`styles/assistant.css` for desktop, `styles.css` for
 * the phone sheet), so the FAB either hides while the dock is open (default, the ✕ closes it) or
 * stays on top of it and toggles it closed.
 *
 * Same load-then-follow-refreshes shape as `useAdminLocale`: the Settings tab's own save echoes
 * back over the settings-changed feed, so flipping the toggle updates the FAB without a reload.
 */

export interface ChatFabPreferencePort {
  loadHideChatFabWhileOpen(): Promise<boolean>;
  subscribeToSettingsRefresh(listener: () => void): () => void;
}

export const defaultChatFabPreferencePort: ChatFabPreferencePort = {
  loadHideChatFabWhileOpen: async () => (await loadInterface()).hideChatFabWhileOpen,
  subscribeToSettingsRefresh: (listener) =>
    subscribeToSettingsRefresh((scope) => {
      if (scope === null || scope.includes(INTERFACE_NAMESPACE)) listener();
    }),
};

/**
 * `true` until a stored `false` arrives, so the default behaviour never flickers in. A failed read
 * keeps the last value rather than flipping the FAB on a network error.
 *
 * @complexity O(1) per load.
 */
export function useChatFabHideWhileOpen(port: ChatFabPreferencePort = defaultChatFabPreferencePort): boolean {
  const [hide, setHide] = useState(DEFAULT_INTERFACE.hideChatFabWhileOpen);
  const settlement = useSettlementGeneration();
  useEffect(() => {
    let cancelled = false;
    const fetchPreference = () => {
      const generation = settlement.next();
      port
        .loadHideChatFabWhileOpen()
        .then((next) => {
          if (!cancelled && settlement.isCurrent(generation)) setHide(next);
        })
        .catch(() => undefined);
    };
    fetchPreference();
    const unsubscribe = port.subscribeToSettingsRefresh(fetchPreference);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [port]);
  return hide;
}

/** `.admin-layout`'s class list: the hide-while-open CSS rules apply only under `hides-fab-while-open`. */
export function resolveAdminLayoutClassName(hideFabWhileOpen: boolean): string {
  return hideFabWhileOpen ? "admin-layout hides-fab-while-open" : "admin-layout";
}
