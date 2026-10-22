import { readableTextColor } from "@jini-ai/ui";
import { useInvalidate } from "@jini-ai/ui/fetch-query";
import { useEffect, useRef } from "react";
import { APPEARANCE_NAMESPACE, adminThemeAccent, loadAppearance, type AppearanceConfig } from "../lib/settings-tabs";
import { subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";
import { useAdminThemeState } from "../admin-themes/use-admin-theme.hooks";
import { advanceAppearancePreview, useAdminAppearanceSnapshot } from "./use-admin-appearance-snapshot.hooks";

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

const previewAccents = new WeakMap<HTMLElement, Map<string, { accentColor: string | undefined; version: number }>>();

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
  const { themeId } = useAdminThemeState({}, { root });
  const paintedTheme = useRef(themeId);
  const query = useAdminAppearanceSnapshot({ port }, { root });
  const invalidate = useInvalidate();
  useEffect(() => port.subscribeToSettingsRefresh(() => {
    invalidate({ key: ["settings", APPEARANCE_NAMESPACE] });
  }), [port, root, invalidate]);
  useEffect(() => {
    // An older response must not repaint a newer draft, including after a theme switch.
    // Other themes can still resolve their own saved choice; failed reads retain the last accent.
    const drafts = previewAccents.get(root);
    const themeChanged = paintedTheme.current !== themeId;
    paintedTheme.current = themeId;
    if (!query.data) {
      // A switch must never carry the previous theme's inline colour into an unloaded theme.
      if (themeChanged) applyAccent({ accentColor: drafts?.get(themeId)?.accentColor, root }, {});
      return;
    }
    // Only an accepted snapshot retires drafts, across all themes. A later preview in another
    // theme must never revive one that this read superseded; in-flight newer drafts survive.
    const readVersion = query.data.readPreviewVersion;
    drafts?.forEach((draft, id) => {
      if (draft.version <= readVersion) drafts.delete(id);
    });
    const draft = drafts?.get(themeId);
    const accentColor = draft && draft.version > readVersion
      ? draft.accentColor
      : adminThemeAccent({ appearance: query.data.appearance, themeId }, {});
    applyAccent({ accentColor, root }, {});
  }, [query.data, root, themeId]);
}

/** Preview the active theme's resolved draft before the debounced ledger save completes. */
export function useSettingsAppearance({ accentColor, ready }: { accentColor: string | undefined; ready: boolean }, { root = document.documentElement } = {}) {
  const { themeId } = useAdminThemeState({}, { root });
  useEffect(() => {
    if (ready) {
      const version = advanceAppearancePreview({ root }, {});
      const drafts = previewAccents.get(root) ?? new Map();
      drafts.set(themeId, { accentColor, version });
      previewAccents.set(root, drafts);
      applyAccent({ accentColor, root }, {});
    }
  }, [accentColor, ready, root, themeId]);
}
