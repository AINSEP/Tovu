import { useEffect } from "react";
import { APPEARANCE_NAMESPACE, DEFAULT_APPEARANCE, loadAppearance, type AppearanceConfig } from "../lib/settings-tabs";
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

/**
 * The host inputs feed Jini's derived accent tokens, including descendants with their own theme.
 * The ledger's registered default (Jini's neutral blue, which Jini expects hosts to brand over) is
 * not an operator choice, so it clears the inline inputs and `styles.css`'s `var(--primary)` mapping
 * keeps every Jini accent brand orange. Writing it inline turned selected chips, toggles and
 * primary buttons blue on any site that never picked an accent (owner, 2026-10-08: "selected tabs
 * and navs should be orange").
 */
function applyAccent({ accentColor, root }: { accentColor: string; root: HTMLElement }, _optional: object) {
  if (accentColor.toLowerCase() === DEFAULT_APPEARANCE.accentColor.toLowerCase()) {
    root.style.removeProperty("--jini-theme-light-primary");
    root.style.removeProperty("--jini-theme-dark-primary");
    return;
  }
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
