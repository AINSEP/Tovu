import { useState } from "react";

import { siteUrl } from "../../lib/site-url";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { ImagePreviewModal } from "../../components/ImagePreviewModal";
import { useAppearance } from "./hooks/use-appearance.hooks";
import { isActiveTheme, groupThemesByTabGroup, defaultThemeTabGroup, THEME_TAB_GROUPS, type ThemeTabGroup } from "./rules";
import { t as translateAppearance } from "./appearance-i18n";

/**
 * @file The Appearance/Themes screen — markup only.
 *
 * State, the fetch, and theme activation live in `hooks/use-appearance.hooks.ts`. The
 * active-theme status derivation and tab grouping live in `rules.ts`. `THEME_BLURBS` is static
 * copy, not a derivation, so it stays here.
 */
const THEME_BLURBS: Record<string, string> = {
  "tovu-official": "The official explainer — a landing page that documents Tovu itself.",
  column: "A reading-first literary theme — serif type in a single column.",
  signal: "A bright product-blog — cobalt masthead and a rounded card grid.",
};

/** A stable id for the Marketplace placeholder tab — deliberately not a {@link ThemeTabGroup}
 *  value, since it has no themes to bucket and never becomes the active/default tab. */
const MARKETPLACE_TAB_ID = "marketplace";

/** `group` capitalized for a tab label — honest rather than inventing marketing names for tiers
 *  (`code`) that have no shipped theme and no established product name yet. */
function tabGroupLabel(group: ThemeTabGroup): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

/**
 * A theme card's visual preview (2026-08-10) — `static`-tier themes ship a `screenshots/index.png`
 * (or `index-light.png`, this session's Basic theme) already servable at
 * `/theme-assets/{id}/screenshots/...` via `theme-static-assets.ts`'s existing `express.static`
 * mount, so no new backend endpoint is needed. There is no API field naming which filename (if any)
 * a theme's screenshots folder actually contains, so this tries the one canonical path every
 * screenshot-bearing theme in this session used (`index.png`) and falls back to a placeholder glyph
 * on `onError` — covers both "theme has no screenshots dir at all" (immediate 404) and "theme has
 * a dir but not that exact file" identically, with no per-theme special-casing.
 *
 * Click-to-expand (2026-08-10 owner feedback: the thumbnail alone is too small to read) opens
 * `ImagePreviewModal` at a real size. Only wired for the real-screenshot branch — a placeholder
 * glyph has nothing worth expanding, so it stays a plain non-interactive `<div>`.
 *
 * @complexity Time/space: O(1) — one `<img>`, two booleans (fallback swap, modal open/closed).
 */
function ThemeCardPreview({ themeId }: { themeId: string }) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const src = `/theme-assets/${themeId}/screenshots/index.png`;

  return (
    <div className="theme-card-preview">
      {failed ? (
        <div className="theme-card-preview-placeholder" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M3 15l5-5 4 4 3-3 6 6" />
            <circle cx="8" cy="9" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="theme-card-preview-trigger"
            onClick={() => setExpanded(true)}
            aria-label={`Expand preview for ${themeId}`}
          >
            <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
          </button>
          <ImagePreviewModal
            open={expanded}
            src={src}
            alt={`${themeId} theme preview`}
            onClose={() => setExpanded(false)}
          />
        </>
      )}
    </div>
  );
}

export interface AppearanceProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useAppearanceHook?: typeof useAppearance;
}

export function Appearance({ useAppearanceHook = useAppearance }: AppearanceProps = {}) {
  const { settings, themes, themeTiers = {}, error, busyTheme, activate } = useAppearanceHook();
  const locale = useAdminLocale();
  const t = (key: string): string => translateAppearance(locale, key);
  // Manual override once the operator picks a tab; `null` means "not yet touched", so the tab
  // shown on load tracks the active theme's own tab group (`defaultThemeTabGroup`) without a
  // mount-time effect — same derived-value-with-override shape as `useSettingsDialogShell`'s own
  // active tab. Typed as plain `string` (not `ThemeTabGroup`) because the Marketplace placeholder
  // tab's id isn't a tab group — it's `disabled` in `TabBar` and never reachable via `onChange`
  // regardless, but the state shape shouldn't claim otherwise.
  const [manualTab, setManualTab] = useState<string | null>(null);

  if (error && !settings) return <div className="notice error">{error}</div>;
  if (!settings) return <div className="notice">{t("Loading themes…")}</div>;

  const grouped = groupThemesByTabGroup(themes, themeTiers);
  const activeTab = manualTab ?? defaultThemeTabGroup(settings, themeTiers);
  // Safe to index directly (no `?? []` fallback): `activeTab` is either `defaultThemeTabGroup`'s
  // result (always a real `ThemeTabGroup`) or a `manualTab` set from `TabBar`'s `onChange`, which
  // never fires for the `disabled` Marketplace tab — so `activeTab` can never actually be
  // `MARKETPLACE_TAB_ID` at this point, only cast for it structurally.
  const visibleThemes = grouped[activeTab as ThemeTabGroup];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Studio")}</p>
          <h1 className="page-title">{t("Themes")}</h1>
          <p className="page-description">
            {t("The active theme controls what visitors see across the entire public site.")}
          </p>
        </div>
      </div>
      <p>
        <a href={siteUrl("/")} target="_blank" rel="noreferrer">{t("View site ↗")}</a>
      </p>
      {error ? <div className="notice error">{error}</div> : null}
      <TabBar
        ariaLabel={t("Themes")}
        tabs={[
          ...THEME_TAB_GROUPS.map(
            (group): TabBarTab => ({ id: group, label: tabGroupLabel(group), count: grouped[group].length }),
          ),
          // Scaffolding for a future theme-marketplace search — no real backend to search yet, so
          // this is a visible-but-inert placeholder (2026-08-10 owner feedback), not a fake search
          // UI with invented results.
          { id: MARKETPLACE_TAB_ID, label: t("Marketplace (soon)"), disabled: true },
        ]}
        activeId={activeTab}
        onChange={(id) => setManualTab(id)}
      />
      {visibleThemes.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>{t("No themes in this tier yet.")}</p>
          </div>
        </div>
      ) : (
        // `role="group"` + `aria-label` names the picker as a whole, matching `PageEditor.tsx`'s
        // `role="group" aria-label="Preview width"` — the codebase's existing pattern for "a set of
        // related controls with one label" rather than nothing. Without it, this was a bare `<div>`:
        // a screen reader landing here (e.g. browsing by form control or by region) had no name for
        // the widget at all, only the individual, per-card `<h3>`/button text. Reuses the "Themes"
        // key already translated in every locale here instead of adding a new one.
        <div className="theme-grid" role="group" aria-label={t("Themes")}>
          {visibleThemes.map((themeId) => {
            const active = isActiveTheme(settings, themeId);
            return (
              <div key={themeId} className={`theme-card theme-${themeId}${active ? " active" : ""}`}>
                <ThemeCardPreview themeId={themeId} />
                <h3>{themeId}</h3>
                <p>{t(THEME_BLURBS[themeId] ?? "")}</p>
                {active ? (
                  <span className="theme-active-tag">{t("Active")}</span>
                ) : (
                  <button className="btn-primary" disabled={busyTheme !== null} onClick={() => activate(themeId)}>
                    {busyTheme === themeId ? t("Activating…") : t("Activate")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
