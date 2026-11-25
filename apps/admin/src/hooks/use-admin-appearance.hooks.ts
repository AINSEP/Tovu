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

/**
 * The host inputs feed Jini's derived accent tokens, including descendants with their own theme.
 * The ledger's registered default (Jini's neutral blue, which Jini expects hosts to brand over) is
 * not an operator choice, so it clears the inline inputs and Classic's `var(--primary)` mapping
 * keeps Classic's Jini accent brand orange. Glass without a saved choice likewise keeps its own
 * palette. Writing the ledger default inline turned selected chips, toggles and
 * primary buttons blue on any site that never picked an accent (owner, 2026-10-08: "selected tabs
 * and navs should be orange").
 * The ink input follows the fill via Jini's `readableTextColor`: a light accent such as Tovu gold
 * otherwise kept the themes' white ink, unreadable on primary buttons and badges.
 */
function applyAccent({ accentColor, root }: { accentColor: string | undefined; root: HTMLElement }, _optional: object) {
  if (accentColor === undefined) {
    root.style.removeProperty("--jini-theme-light-primary");
    root.style.removeProperty("--jini-theme-dark-primary");
    root.style.removeProperty("--jini-theme-light-primary-ink");
    root.style.removeProperty("--jini-theme-dark-primary-ink");
    root.removeAttribute("data-admin-accent");
    return;
  }
  root.style.setProperty("--jini-theme-light-primary", accentColor);
  root.style.setProperty("--jini-theme-dark-primary", accentColor);
  const ink = readableTextColor({ hex: accentColor });
  root.style.setProperty("--jini-theme-light-primary-ink", ink);
  root.style.setProperty("--jini-theme-dark-primary-ink", ink);
  // Classic's default inputs point at --primary. Only bridge back to Jini's roles while
  // these literal overrides exist, avoiding a cycle and preserving the default palette.
  // "light" marks an accent that took dark ink, so Classic also darkens its text uses.
  root.setAttribute("data-admin-accent", ink === "#ffffff" ? "" : "light");
}

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
