import { useEffect } from "react";
import { APPEARANCE_NAMESPACE, loadAppearance, type AppearanceConfig } from "../lib/settings-tabs";
import { subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";

export interface AdminAppearancePort {
  loadAppearance(): Promise<AppearanceConfig>;
  subscribeToSettingsRefresh(listener: () => void): () => void;
}
const defaultPort: AdminAppearancePort = {
  loadAppearance,
  subscribeToSettingsRefresh: (listener) => subscribeToSettingsRefresh((scope) => {
    if (scope === null || scope.includes(APPEARANCE_NAMESPACE)) listener();
  }),
};

// A controlled draft can change while the shell's initial read is still pending. Invalidate
// that read at the document boundary rather than letting it undo the operator's live preview.
const previewVersions = new WeakMap<HTMLElement, number>();

/** The host inputs feed Jini's derived accent tokens, including descendants with their own theme. */
function applyAccent({ accentColor, root }: { accentColor: string; root: HTMLElement }, _optional: object) {
  root.style.setProperty("--jini-theme-light-primary", accentColor);
  root.style.setProperty("--jini-theme-dark-primary", accentColor);
}

/** Follow the operator's appearance ledger on every admin page, using the existing refresh bus. */
export function useAdminAppearance(_required: object, { port = defaultPort, root = document.documentElement } = {}) {
  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const refresh = () => {
      const ticket = ++generation;
      const previewVersion = previewVersions.get(root);
      void port.loadAppearance().then((next) => {
        // An older response must not repaint a newer choice; failed reads retain the last accent.
        if (!cancelled && ticket === generation && previewVersions.get(root) === previewVersion) applyAccent({ accentColor: next.accentColor, root }, {});
      }).catch(() => undefined);
    };
    refresh();
    const unsubscribe = port.subscribeToSettingsRefresh(refresh);
    return () => { cancelled = true; unsubscribe(); };
  }, [port, root]);
}

/** Preview the controlled draft before the debounced ledger save completes. */
export function useSettingsAppearance({ accentColor, ready }: { accentColor: string; ready: boolean }, { root = document.documentElement } = {}) {
  useEffect(() => {
    if (ready) {
      previewVersions.set(root, (previewVersions.get(root) ?? 0) + 1);
      applyAccent({ accentColor, root }, {});
    }
  }, [accentColor, ready, root]);
}
