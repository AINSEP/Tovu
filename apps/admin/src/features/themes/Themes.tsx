import { useState } from "react";
import { Toast } from "@jini-ai/ui";

import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { ImagePreviewModal } from "../../components/ImagePreviewModal";
import { useWiredThemes } from "./hooks/use-themes.hooks";
import {
  isActiveTheme,
  isStrandedActiveTheme,
  groupThemesByTabGroup,
  defaultThemeTabGroup,
  THEME_TAB_GROUPS,
  type ThemeTabGroup,
} from "./rules";

/**
 * @file The Themes screen — markup only.
 *
 * State, the fetch, and theme activation live in `hooks/use-themes.hooks.ts`. The
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
 *  (`code`) that have no shipped theme and no established product name yet. Routed through `t()`
 *  (same pattern as the "Marketplace (soon)" label right next to it) so these translate instead of
 *  always rendering the raw English capitalization — the capitalized form is also the dictionary
 *  key, so an untranslated locale still falls back to the correct English label. */
function tabGroupLabel(t: (key: string) => string, group: ThemeTabGroup): string {
  return t(group.charAt(0).toUpperCase() + group.slice(1));
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

export interface ThemesProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useThemesHook?: typeof useWiredThemes;
}

export function Themes({ useThemesHook = useWiredThemes }: ThemesProps = {}) {
  const {
    settings,
    themes,
    themeTiers = {},
    error,
    busyTheme,
    activate,
    // Optional so a pre-existing test double supplying only the original controller fields still
    // type-checks — same reason `themeTiers` is optional above.
    rescanning = false,
    rescanNotice = null,
    rescan,
    dismissRescanNotice,
    marketplace = [],
    marketplaceLoading = false,
    loadMarketplace,
    downloading = null,
    download,
    t,
  } = useThemesHook();
  // Manual override once the operator picks a tab; `null` means "not yet touched", so the tab
  // shown on load tracks the active theme's own tab group (`defaultThemeTabGroup`) without a
  // mount-time effect — same derived-value-with-override shape as `useSettingsDialogShell`'s own
  // active tab. Typed as plain `string` (not `ThemeTabGroup`) because the Marketplace tab's id is
  // not a tab group — it lists what is installable rather than what is installed.
  const [manualTab, setManualTab] = useState<string | null>(null);

  if (error && !settings) return <div className="notice error">{error}</div>;
  if (!settings) return <div className="notice">{t("Loading themes…")}</div>;

  const grouped = groupThemesByTabGroup(themes, themeTiers);
  const activeTab = manualTab ?? defaultThemeTabGroup(settings, themeTiers);
  // `?? []` is load-bearing now. It used to be safe to index directly because the Marketplace tab
  // was `disabled`, so `activeTab` provably named a real `ThemeTabGroup`. Enabling that tab made
  // `MARKETPLACE_TAB_ID` reachable here, and `grouped["marketplace"]` is `undefined` — the branch
  // below renders the marketplace instead, but this line still evaluates first.
  const visibleThemes = grouped[activeTab as ThemeTabGroup] ?? [];

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
      {/* "View site" and the rescan control share one row, the rescan pushed to the far right. The
          server discovers themes once at boot, so anything that reaches the themes folder afterwards
          — a marketplace download, a copy of an original, a `git pull`, the `npm run theme` CLI — is
          invisible here until someone asks it to look again. In-app actions will rescan on their own;
          this is the control for every change the app never saw happen. */}
      <div className="page-toolbar">
        <a href={siteUrl("/")} target="_blank" rel="noreferrer">{t("View site ↗")}</a>
        <button
          type="button"
          className="btn-secondary"
          disabled={rescanning || rescan === undefined}
          onClick={() => void rescan?.()}
        >
          {rescanning ? t("Rescanning…") : t("Rescan themes")}
        </button>
      </div>
      {/* Transient, not a persistent banner: the rescan outcome confirms something the operator just
          did, so it clears itself rather than accumulating above the grid. Passing `onDismiss` is
          what makes the component render its own X — the same handler the auto-dismiss timer calls,
          so closing early and timing out are one code path. A duplicate-id result still gets
          `role="alert"` (announced immediately by a screen reader) because it means the site may be
          rendering a theme nobody picked. */}
      {rescanNotice ? (
        <Toast
          message={rescanNotice}
          role={rescanNotice.includes("Duplicate") ? "alert" : "status"}
          tone={rescanNotice.includes("Duplicate") ? "error" : "success"}
          ttlMs={5000}
          onDismiss={dismissRescanNotice}
        />
      ) : null}
      {error ? <div className="notice error">{error}</div> : null}
      {/* Stranded active theme (2026-08-10) — `settings.activeThemeId` names a theme the server no
          longer resolves, so no card below can ever show the Active tag and nothing else said why.
          `.notice.warning` — same visual language `PostEditor.tsx`'s slug-collision banner already
          established for "the admin needs to know this, but nothing was lost/destroyed" — not
          `.notice.error`, which this codebase reserves for a failed fetch/save. */}
      {isStrandedActiveTheme(settings, themes) ? (
        <div className="notice warning">
          {t("The site's active theme (\"{id}\") is no longer available, so the public site cannot render until you activate a different one. No content was lost.").replace(
            "{id}",
            settings.activeThemeId,
          )}
        </div>
      ) : null}
      <TabBar
        ariaLabel={t("Themes")}
        tabs={[
          ...THEME_TAB_GROUPS.map(
            (group): TabBarTab => ({ id: group, label: tabGroupLabel(t, group), count: grouped[group].length }),
          ),
          // Live as of the local fixture (`src/themes/__marketplace__/`): a real listing served by a
          // real route, downloading real theme folders. Still not a real marketplace — no network,
          // no search, no publisher identity, no versioning (see development/todos.md).
          { id: MARKETPLACE_TAB_ID, label: t("Marketplace"), count: marketplace.length || undefined },
        ]}
        activeId={activeTab}
        onChange={(id) => {
          setManualTab(id);
          // Fetched on first open rather than on mount: the Themes screen is the common case and
          // should not pay for a listing most visits never look at.
          if (id === MARKETPLACE_TAB_ID && marketplace.length === 0) void loadMarketplace?.();
        }}
      />
      {activeTab === MARKETPLACE_TAB_ID ? (
        marketplaceLoading ? (
          <div className="notice">{t("Loading the marketplace…")}</div>
        ) : marketplace.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p>{t("Nothing available to download right now.")}</p>
            </div>
          </div>
        ) : (
          <div className="theme-grid" role="group" aria-label={t("Marketplace")}>
            {marketplace.map((item) => (
              <div key={item.id} className="theme-card">
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                {/* Says up front what the name will actually be. A download that silently lands as
                    `basic-1` after the operator asked for `basic` is the kind of surprise that makes
                    people think something went wrong — so the rename is announced before it happens,
                    not just reported after. */}
                {item.idTaken ? (
                  <p className="theme-card-note">
                    {t("You already have a theme called")} <code>{item.id}</code>.{" "}
                    {t("This one will be installed under a new name.")}
                  </p>
                ) : null}
                <div className="theme-card-actions">
                  <button
                    className="btn-primary"
                    disabled={downloading !== null}
                    onClick={() => void download?.(item.id)}
                  >
                    {downloading === item.id ? t("Downloading…") : t("Download")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : visibleThemes.length === 0 ? (
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
                {/* Activate stays left, Explore is pushed right. Explore takes the app's existing
                    secondary/outline shape (white surface, bordered — see `.btn-explore` in
                    styles.css) rather than a second filled button: the burnt-orange fill marks the
                    one action with a site-wide consequence, and exploring changes nothing, so it
                    should not compete with Activate for primary attention — but it still reads as a
                    real, clickable destination, not plain text on the card. */}
                <div className="theme-card-actions">
                  {active ? (
                    <span className="theme-active-tag">{t("Active")}</span>
                  ) : (
                    <button className="btn-primary" disabled={busyTheme !== null} onClick={() => activate(themeId)}>
                      {busyTheme === themeId ? t("Activating…") : t("Activate")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-explore"
                    onClick={() => navigate(`/themes/explore?theme=${encodeURIComponent(themeId)}`)}
                  >
                    {t("Explore")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
