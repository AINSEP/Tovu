import { Toast } from "@jini-ai/ui";
import { agentHandle } from "@jini-ai/agentic";

import { NO_THEME_ID, type PresentationSettings, type ThemeTier } from "../../lib/api";
import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { TabBar, type TabBarTab } from "@jini-ai/ui/tab-strip";
import { ImagePreviewModal } from "@jini-ai/ui/admin-widgets";
import { buildAgentListHandles } from "@jini-ai/agentic";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { interpolate } from "@jini-ai/ui/panel-kit";
import { useThemeCardPreview } from "./hooks/use-theme-card-preview.hooks";
import { useWiredThemes, type ThemesController } from "./hooks/use-themes.hooks";
import {
  isActiveTheme,
  isStrandedActiveTheme,
  isThemeDisabled,
  groupThemesByTabGroup,
  defaultThemeTabGroup,
  themeDisplayName,
  sortThemesForDisplay,
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

/**
 * An `aria-label` naming which card a repeated action button acts on.
 *
 * "Activate" reads identically on every card in the grid — a screen reader or a
 * generic browser agent reading the accessibility tree (roles + accessible names, not this repo's
 * own `data-agent-label` — `agentHandle()`'s `label` option is a private `data-agent-*` attribute,
 * invisible to both) has no way to tell one card's button from another's without this. Busy and
 * idle share this one derivation so the accessible name never drifts from the visible verb.
 *
 * @complexity O(1).
 */
function actionButtonAriaLabel(idleVerb: string, busyVerb: string, busy: boolean, itemName: string): string {
  return `${busy ? busyVerb : idleVerb} ${itemName}`;
}

/** `group` capitalized for a tab label — honest rather than inventing marketing names for tiers
 *  (`code`) that have no shipped theme and no established product name yet. Routed through `t()`
 *  so these translate instead of
 *  always rendering the raw English capitalization — the capitalized form is also the dictionary
 *  key, so an untranslated locale still falls back to the correct English label. */
function tabGroupLabel(t: Translate, group: ThemeTabGroup): string {
  return t(group.charAt(0).toUpperCase() + group.slice(1));
}

/**
 * A theme card's visual preview (2026-08-10, JPEG fallback added 2026-08-12) — `static`-tier themes
 * ship a `screenshots/index.{jpg,png}` already servable at `/theme-assets/{id}/screenshots/...` via
 * `theme-static-assets.ts`'s existing `express.static` mount. D-22 (2026-10-06): the server now
 * advertises the file that actually exists (or `null`), so the browser no longer probes `index.jpg`
 * and 404s before loading `index.png`; older servers keep the jpg→png→placeholder fallback in
 * `useThemeCardPreview`. JPEG isn't a blanket win: measured against every `static`-tier screenshot
 * on disk, only content with real photographic/gradient detail (e.g. `fuel`'s hero photo)
 * compresses meaningfully smaller as JPEG at quality 85 — flat, text-heavy UI screenshots (most of
 * this theme set) are already near-optimal as PNG and came out the same size or *larger* as JPEG,
 * so those stay PNG-only.
 *
 * Click-to-expand (2026-08-10 owner feedback: the thumbnail alone is too small to read) opens
 * `ImagePreviewModal` at a real size. Only wired for the real-screenshot branch — a placeholder
 * glyph has nothing worth expanding, so it stays a plain non-interactive `<div>`.
 *
 * The per-card state lives in its own per-card hook, deliberately not in `use-themes.hooks.ts`'s
 * screen-level controller (owner-ratified, 2026-08-14 DI migration sweep): this renders once per
 * theme inside a `.map()`, so moving `stage`/`expanded` into the single controller would mean
 * redesigning it around a themeId-keyed record.
 *
 * @complexity Time/space: O(1) — one `<img>`, one fallback stage, one modal-open boolean.
 */
function ThemeCardPreview({ themeId, previewImageUrl, agentHandleBase, t }: { themeId: string; previewImageUrl?: string | null; agentHandleBase: string; t: Translate }) {
  const { failed, src, expanded, setExpanded, handleError } = useThemeCardPreview({ themeId, previewImageUrl });

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
            {...agentHandle({ handle: `${agentHandleBase}-preview` }, { role: "button", label: `Expand the "${themeId}" theme's preview image` })}
          >
            <img src={src} alt="" loading="lazy" onError={handleError} />
          </button>
          <ImagePreviewModal
            open={expanded}
            src={src}
            alt={interpolate({ template: t("{id} theme preview"), vars: { id: themeId } })}
            onClose={() => setExpanded(false)}
            closeLabel={t("Close preview")}
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
  /**
   * The `?tab=` query value from `panels.tsx`'s `themes`/`appearance` routes (`URLSearchParams.get`
   * returns `null` when the param is absent) — ADR-063, same `?tab=` deep-linking idiom
   * `Deployment.tsx`'s `tabId` prop already uses. `null` or an unrecognized value falls back to the
   * active theme's own tab group, same behavior this screen had before this prop existed (see
   * {@link resolveThemesActiveTabId}).
   */
  tabId?: string | null;
  /**
   * Which panel route mounted this screen — `panels.tsx` declares `Themes` at two URLs, `/themes`
   * (default) and the legacy nav-less `/appearance` alias. Threaded through so a tab click's
   * `navigate()` targets the URL the operator is actually on, instead of always jumping to
   * `/themes` regardless of which route rendered this component.
   */
  basePath?: string;
}

/**
 * Falls back to the active theme's own tab group for an absent or unrecognized `?tab=` value.
 * Delegates the validate-or-fallback check to the shared `../../lib/resolve-active-tab-id` guard
 * `Deployment.tsx`/`Security.tsx`/`SourceControl.tsx`/`Database.tsx` all use — this screen is the
 * one caller with a dynamic (not fixed-constant) default, computed here via
 * `defaultThemeTabGroup(settings, themeTiers)` before being handed in, so a stale link or typo
 * opens on a sensible tab instead of a blank grid (an unrecognized id would otherwise flow into
 * `grouped[activeTab]`, which is `undefined` for anything but a real {@link ThemeTabGroup}). A
 * `?tab=marketplace` link from before the theme marketplace was deleted (2026-10-04) falls back the
 * same way.
 *
 * @complexity Time/space: O(1) — fixed-size id list (four tab groups), not caller-controlled.
 */
function resolveThemesActiveTabId(
  tabId: string | null | undefined,
  settings: PresentationSettings,
  themeTiers: Record<string, ThemeTier>,
): string {
  const validTabIds: readonly string[] = THEME_TAB_GROUPS;
  return resolveActiveTabId({ tabId: tabId, validIds: validTabIds, defaultId: defaultThemeTabGroup(settings, themeTiers) });
}

/**
 * Fills in every optional {@link ThemesController} field with the same default the destructuring at
 * `Themes`'s own call site used to carry inline (complexity-ceiling pass, 2026-08-11) — split out to a
 * top-level function so these `??` fallbacks score against this function instead of `Themes`
 * itself. Existing test doubles built against the earlier, smaller controller shape
 * (`themeTiers`/`themeNames`/`rescanning`/`rescanNotice` were all added later) keep type-checking without being rewritten — see those fields' own doc on
 * `ThemesController` for why they're optional in the first place.
 */
function withThemeDefaults(controller: ThemesController) {
  return {
    ...controller,
    themeTiers: controller.themeTiers ?? {},
    themeNames: controller.themeNames ?? {},
    themePreviewImages: controller.themePreviewImages ?? {},
    rescanning: controller.rescanning ?? false,
    rescanNotice: controller.rescanNotice ?? null,
  };
}

/** The tab list for `TabBar` — one tab per configured {@link ThemeTabGroup}, each with its theme
 *  count. (The theme Marketplace tab that used to follow these was deleted 2026-10-04 with the dead
 *  marketplace it listed.) */
function buildThemeTabs(t: Translate, grouped: Record<ThemeTabGroup, string[]>): TabBarTab[] {
  return THEME_TAB_GROUPS.map(
    (group): TabBarTab => ({ id: group, label: tabGroupLabel(t, group), count: grouped[group].length }),
  );
}

/** The rescan-outcome toast. Transient, not a persistent banner: the rescan outcome confirms
 *  something the operator just did, so it clears itself rather than accumulating above the grid.
 *  Passing `onDismiss` is what makes the component render its own X — the same handler the
 *  auto-dismiss timer calls, so closing early and timing out are one code path. A duplicate-id result
 *  still gets `role="alert"` (announced immediately by a screen reader) because it means the site may
 *  be rendering a theme nobody picked. Extracted to a top-level component (complexity-ceiling pass) so
 *  its role/tone ternaries score independently of `Themes`'s own complexity. */
function RescanToast({
  rescanNotice,
  onDismiss,
}: {
  rescanNotice: string | null;
  onDismiss: (() => void) | undefined;
}) {
  if (!rescanNotice) return null;
  return (
    <Toast
      message={rescanNotice}
      role={rescanNotice.includes("Duplicate") ? "alert" : "status"}
      tone={rescanNotice.includes("Duplicate") ? "error" : "success"}
      ttlMs={5000}
      onDismiss={onDismiss}
    />
  );
}

/** The two banners below the toolbar — a failed fetch/save, and independently, "the site's active
 *  theme no longer resolves" (`.notice.warning` — same visual language `PostEditor.tsx`'s
 *  slug-collision banner already established for "the admin needs to know this, but nothing was
 *  lost/destroyed", not `.notice.error`, which this codebase reserves for a failed fetch/save).
 *  Extracted to a top-level component (complexity-ceiling pass) so these two independent ternaries
 *  score against this function instead of `Themes`'s own complexity. */
function ThemesBanners({
  error,
  settings,
  themes,
  t,
}: {
  error: string | null;
  settings: PresentationSettings;
  themes: string[];
  t: Translate;
}) {
  return (
    <>
      {error ? <div className="notice error">{error}</div> : null}
      {isStrandedActiveTheme(settings, themes) ? (
        <div className="notice warning">
          {t(
            "The site's active theme (\"{id}\") is no longer available, so the public site cannot render until you activate a different one. No content was lost.",
          ).replace("{id}", settings.activeThemeId)}
        </div>
      ) : null}
      {/* Deliberately a plain `.notice`, NOT `.notice warning` — the operator chose this, and
          styling a choice as a fault trains them to ignore the banner. It is persistent rather than
          a toast because "no theme" is a standing state of the site, not an event: an operator
          arriving at this screen later needs to know why every card shows Activate and none shows
          Active, and that is the same question the stranded-theme warning above answers for a
          different cause. */}
      {isThemeDisabled(settings) ? (
        <div className="notice">
          {t(
            "No theme is active. Your site renders unstyled so you can supply your own CSS; posts, pages and products still publish normally. Activate a theme below to switch back at any time — nothing was deleted.",
          )}
        </div>
      ) : null}
    </>
  );
}

/** The installed-themes tab's own content — empty state or the theme card grid. Extracted to a
 *  top-level component (complexity-ceiling pass) so this branching (including the active/inactive
 *  card-action switch) scores independently of `Themes`'s own complexity. */
function ThemeGrid({
  visibleThemes,
  themeNames,
  themePreviewImages,
  settings,
  busyTheme,
  activate,
  t,
}: {
  visibleThemes: string[];
  themeNames: Record<string, string>;
  themePreviewImages: Record<string, string | null | undefined>;
  settings: PresentationSettings;
  busyTheme: string | null;
  activate: (themeId: string) => Promise<void>;
  t: Translate;
}) {
  if (visibleThemes.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{t("No themes in this tier yet.")}</p>
        </div>
      </div>
    );
  }
  // Theme ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`).
  const cardHandles = buildAgentListHandles({ prefix: "themes-card", ids: visibleThemes });
  return (
    // `role="group"` + `aria-label` names the picker as a whole, matching `PageEditor.tsx`'s
    // `role="group" aria-label="Preview width"` — the codebase's existing pattern for "a set of
    // related controls with one label" rather than nothing.
    <div className="theme-grid" role="group" aria-label={t("Themes")}>
      {visibleThemes.map((themeId, index) => {
        const active = isActiveTheme(settings, themeId);
        const handleBase = cardHandles[index]!;
        const name = themeDisplayName(themeId, themeNames);
        return (
          <div key={themeId} className={`theme-card theme-${themeId}${active ? " active" : ""}`}>
            <ThemeCardPreview themeId={themeId} previewImageUrl={themePreviewImages[themeId]} agentHandleBase={handleBase} t={t} />
            <h3>{name}</h3>
            <p>{t(THEME_BLURBS[themeId] ?? "")}</p>
            {/* Activate stays left, Explore is pushed right. Explore takes the app's existing
                secondary/outline shape (white surface, bordered — see `.btn-explore` in styles.css)
                rather than a second filled button: the burnt-orange fill marks the one action with a
                site-wide consequence, and exploring changes nothing, so it should not compete with
                Activate for primary attention — but it still reads as a real, clickable destination,
                not plain text on the card. */}
            <div className="theme-card-actions">
              {active ? (
                <span className="theme-active-tag">{t("Active")}</span>
              ) : (
                <button
                  className="btn-primary"
                  disabled={busyTheme !== null}
                  onClick={() => activate(themeId)}
                  aria-label={actionButtonAriaLabel(t("Activate"), t("Activating…"), busyTheme === themeId, name)}
                  {...agentHandle({ handle: `${handleBase}-activate` }, { role: "button", label: `Activate the "${themeId}" theme` })}
                >
                  {busyTheme === themeId ? t("Activating…") : t("Activate")}
                </button>
              )}
              <button
                type="button"
                className="btn-explore"
                onClick={() => navigate(`/themes/explore?theme=${encodeURIComponent(themeId)}`)}
                aria-label={`${t("Explore")} ${name}`}
                {...agentHandle({ handle: `${handleBase}-explore` }, { role: "button", label: `Explore the "${themeId}" theme's files` })}
              >
                {t("Explore")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "View site" and the rescan control share one row, the rescan pushed to the far right. The server
 *  discovers themes once at boot, so anything that reaches the themes folder afterwards —
 *  a copy of an original, a `git pull`, the `npm run theme` CLI — is invisible
 *  here until someone asks it to look again. In-app actions will rescan on their own; this is the
 *  control for every change the app never saw happen. Extracted to a top-level component
 *  (complexity-ceiling pass) so its disabled/label ternaries score independently of `Themes`'s own
 *  complexity. */
function ThemesToolbar({
  settings,
  rescanning,
  rescan,
  busyTheme,
  activate,
  t,
}: {
  settings: PresentationSettings;
  rescanning: boolean;
  rescan: ThemesController["rescan"];
  busyTheme: ThemesController["busyTheme"];
  activate: ThemesController["activate"];
  t: Translate;
}) {
  return (
    <div className="page-toolbar">
      <a
        href={siteUrl("/")}
        target="_blank"
        rel="noreferrer"
        {...agentHandle({ handle: "themes-view-site" }, { role: "link", label: "Open the public site in a new tab" })}
      >
        {t("View site ↗")}
      </a>
      <button
        type="button"
        className="btn-secondary"
        disabled={rescanning || rescan === undefined}
        onClick={() => void rescan?.()}
        {...agentHandle({ handle: "themes-rescan" }, { role: "button", label: "Rescan the themes folder for changes" })}
      >
        {rescanning ? t("Rescanning…") : t("Rescan themes")}
      </button>
      {/* Hidden once the theme is already off — a control whose only effect is to re-send the
          state you are already in reads as broken when nothing changes. Getting back is the
          Activate button on any card, which is always present. A toolbar control rather than a
          card in the grid: the grid is split across tier tabs, so a card would be visible in only
          one of them and invisible in the rest. */}
      {isThemeDisabled(settings) ? null : (
        <button
          type="button"
          className="btn-secondary"
          disabled={busyTheme !== null}
          onClick={() => void activate(NO_THEME_ID)}
          {...agentHandle({ handle: "themes-disable" }, {
            role: "button",
            label: "Turn the theme off and render the site unstyled",
          })}
        >
          {busyTheme === NO_THEME_ID ? t("Turning off…") : t("Turn the theme off")}
        </button>
      )}
    </div>
  );
}

// `tabId` deliberately has no destructured default (unlike `useThemesHook`/`basePath` below) — this
// package's ESLint `complexity` rule counts each default-parameter assignment as a branch, and this
// screen was already at its ceiling. `resolveThemesActiveTabId` already treats an omitted prop
// (`undefined`) the same as an explicit `null` (its `tabId && ...` check is falsy either way), so a
// third default here would cost a complexity point for zero behavioral benefit.
export function Themes({ useThemesHook = useWiredThemes, tabId, basePath = "/themes" }: ThemesProps) {
  const {
    settings,
    themes,
    themeTiers,
    themeNames,
    themePreviewImages,
    error,
    busyTheme,
    activate,
    rescanning,
    rescanNotice,
    rescan,
    dismissRescanNotice,
    t,
  } = withThemeDefaults(useThemesHook());

  // Combines the original two guards (`error && !settings` / `!settings`) into one `if` so
  // TypeScript still narrows `settings` to non-null for everything below, while keeping only one
  // decision point in `Themes`'s own scope instead of two (complexity-ceiling pass) — equivalent
  // behavior: when `settings` hasn't loaded, an in-flight error takes priority over the loading copy.
  if (!settings) {
    return error ? <div className="notice error">{error}</div> : <div className="notice">{t("Loading themes…")}</div>;
  }

  const grouped = groupThemesByTabGroup(themes, themeTiers);
  // Derived straight from the `?tab=` prop (ADR-063) — no local `useState` override anymore.
  // `resolveThemesActiveTabId` folds in the same "fall back to the active theme's own tab group"
  // default `manualTab ?? defaultThemeTabGroup(...)` used before this prop existed, and
  // additionally guards against an unrecognized/stale query value (see that function's own doc).
  const activeTab = resolveThemesActiveTabId(tabId, settings, themeTiers);
  // `?? []` is a guard, not a live branch: `resolveThemesActiveTabId` only returns a real
  // `ThemeTabGroup` now that the theme Marketplace tab is gone (2026-10-04).
  // Active theme first, then A-Z by display name (`sortThemesForDisplay`).
  const visibleThemes = sortThemesForDisplay(
    grouped[activeTab as ThemeTabGroup] ?? [],
    settings.activeThemeId,
    themeNames,
  );

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
        <div className="page-actions">
          <PublishSectionButton section="themes" />
        </div>
      </div>
      <ThemesToolbar
        settings={settings}
        rescanning={rescanning}
        rescan={rescan}
        busyTheme={busyTheme}
        activate={activate}
        t={t}
      />
      <RescanToast rescanNotice={rescanNotice} onDismiss={dismissRescanNotice} />
      {/* Stranded active theme (2026-08-10) — `settings.activeThemeId` names a theme the server no
          longer resolves, so no card below can ever show the Active tag and nothing else said why —
          see `ThemesBanners`'s own doc. */}
      <ThemesBanners error={error} settings={settings} themes={themes} t={t} />
      <TabBar
        ariaLabel={t("Themes")}
        tabs={buildThemeTabs(t, grouped)}
        activeId={activeTab}
        containerHandle="themes-tab-bar"
        onChange={(id) => {
          // Real `navigate()`, not local state (ADR-063) — same idiom Deployment/Database's tab
          // strips use: `replace: true` so switching tabs updates the deep link without growing
          // back-button history one entry per click.
          navigate(`${basePath}?tab=${id}`, { replace: true });
        }}
      />
      <ThemeGrid themePreviewImages={themePreviewImages} visibleThemes={visibleThemes} themeNames={themeNames} settings={settings} busyTheme={busyTheme} activate={activate} t={t} />
    </div>
  );
}
