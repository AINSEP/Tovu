import type { TabBarTab } from "../../components/TabBar";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { navigate } from "../../lib/router";
import { t } from "./seo-i18n";
import type { SeoSettings } from "../../lib/api";

/**
 * @file The `/admin/seo` tab system's non-JSX logic, plus the three tab glyphs.
 *
 * Everything derived lives here rather than in `Seo.tsx`: the tab-id list and its `?tab=` guard,
 * the tab descriptors, the navigation callback, and the `FormData` -> settings-patch mapping the
 * defaults form used to build inline in its own `onSubmit` (standing rule — a component's derived
 * logic belongs in a sibling `*.hooks.ts(x)`, not in the `.tsx`).
 *
 * `.tsx`, not `.ts`, because {@link resolveSeoTabs} returns `TabBarTab[]` whose `icon` field is a
 * `ReactNode` — the same reason `Sites.hooks.tsx` and this feature's own
 * `MediaRefField.hooks.tsx`/`SitemapModal.hooks.tsx` carry the `x`.
 *
 * ## Why three tabs, and why these three
 *
 * The screen was one long scroll holding three unrelated jobs, and an operator arrives wanting
 * exactly one of them:
 *
 *   - **Site defaults** — "what should search engines and social see for this site by default?"
 *     Set once, at setup, then rarely touched.
 *   - **Sitemap** — "is my sitemap current?" An occasional operations action, not a setting.
 *   - **Pages & posts** — "fix the SEO on this one page." The recurring, per-content job, and the
 *     only part of the screen anyone opens weekly.
 *
 * The split is by cadence and by object, not by markup: site-wide-and-static, ops-action, and
 * one-entry-at-a-time are three different reasons to be here. Being honest about it — those are
 * also, near enough, the three sections the page already had. The design work is in the other
 * three changes: naming them in operator language rather than in the data model's ("Pages & posts",
 * not "Per-entry SEO" — the picker lists posts and pages, and nobody hunting for a page thinks of
 * it as an *entry*), giving the defaults form real internal grouping it never had, and giving the
 * Sitemap tab a state line so it is not two naked buttons.
 *
 * ## The one thing that constrained the split
 *
 * A more Yoast-shaped cut — "Search appearance" / "Social sharing" / "Crawling" — was considered
 * and rejected, because those three groups all live inside ONE uncontrolled `<form>` read via
 * `new FormData(e.currentTarget)` on submit. Splitting them across tabs unmounts the inactive
 * panels' inputs, and an unmounted input is absent from `FormData` — so saving from any tab would
 * silently blank every field on the other two. Fixing that means converting eleven fields to
 * controlled state inside `use-seo.hooks.ts`, which is a behavior change to the save path and well
 * outside a tab conversion. The grouping is instead expressed WITHIN the Site defaults tab, as
 * labelled field groups, where it costs nothing and risks nothing.
 *
 * This is also why "Sitemap enabled" stays on the Site defaults tab while the sitemap ACTIONS sit
 * on the Sitemap tab: the checkbox is part of that same form and cannot leave it. The Sitemap tab
 * reports its state instead of duplicating the control, so there is exactly one switch.
 */

/** Shared attributes for a decorative line icon — copied deliberately from
 *  `deployment-visuals.tsx`'s own `LINE_ICON` so this tab row reads as the same family as the
 *  Deployment tab row it was modelled on (24px grid, 1.5 stroke, round joins). Local rather than
 *  imported across the feature boundary: `features/deployment/index.ts` is that feature's public
 *  surface and does not export it, and this app ships no shared icon module — the sidebar's glyphs
 *  in `App.tsx` and `SettingsUi.tsx`'s tab icons are both inline SVG for the same reason.
 *  `aria-hidden` on every one: each sits directly beside the text label that already says the same
 *  thing (`frontend-accessibility` — do not give an accessible name to decoration that duplicates
 *  adjacent visible text). */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Site defaults — sliders, i.e. values that are set once and then apply to everything. */
export function SeoDefaultsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </svg>
  );
}

/** Sitemap — a node branching into children, i.e. the shape of the file this tab rebuilds. */
export function SeoSitemapIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <rect x="3" y="17" width="6" height="4" rx="1" />
      <rect x="15" y="17" width="6" height="4" rx="1" />
      <path d="M12 7v4M6 17v-2h12v2M12 11v4" />
    </svg>
  );
}

/** Pages & posts — stacked documents, i.e. the collection this tab edits one at a time. */
export function SeoEntriesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M8 3h6l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v4h4" />
      <path d="M10 12h5M10 16h3" />
    </svg>
  );
}

/** The three tab ids, in render order. `defaults` is first and is the fallback — it is the only
 *  tab that is meaningful before anything else on the screen has been touched. */
export const SEO_TAB_IDS = ["defaults", "sitemap", "entries"] as const;
export type SeoTabId = (typeof SEO_TAB_IDS)[number];

/** Falls back to Site defaults for an absent or unrecognized `?tab=` value, through the same shared
 *  guard `Deployment.tsx`/`Sites.tsx`/`Database.tsx`/`Themes.tsx` use — a stale bookmark or a typo
 *  must open a real tab, never a blank panel. */
export function resolveSeoTabId(tabId: string | null | undefined): SeoTabId {
  return resolveActiveTabId(tabId, SEO_TAB_IDS, "defaults");
}

/**
 * The three tabs in the shape `TabBar` takes.
 *
 * "Sitemap" is the only label already carried by `seo-i18n.ts` (it is the existing section
 * heading's key, translated in all 21 locales). "Site defaults" and "Pages & posts" are new English
 * keys with no dictionary entries, which is a disclosed gap and not a silent one:
 * `createDictionaryTranslator` falls through feature dict -> `COMMON_I18N` -> the English key
 * itself, so every locale renders correct English rather than a placeholder, and adding
 * translations later is purely additive because in this admin the English copy string IS the key.
 * Hand-writing 21 locales of unverifiable translation for two tab labels is the trade
 * `sites-i18n.ts`'s own header already weighed and declined.
 *
 * @complexity O(1) — a fixed three-element array.
 */
export function resolveSeoTabs(locale: string): TabBarTab[] {
  return [
    {
      id: "defaults",
      label: t(locale, "Site defaults"),
      icon: <SeoDefaultsIcon />,
      handle: "seo-tab-defaults",
      handleLabel: "Switch to the Site defaults tab — title template, meta description, social image and card handle, and the default robots directives",
    },
    {
      id: "sitemap",
      label: t(locale, "Sitemap"),
      icon: <SeoSitemapIcon />,
      handle: "seo-tab-sitemap",
      handleLabel: "Switch to the Sitemap tab — rebuild the cached sitemap, or view the URLs it contains",
    },
    {
      id: "entries",
      label: t(locale, "Pages & posts"),
      icon: <SeoEntriesIcon />,
      handle: "seo-tab-entries",
      handleLabel: "Switch to the Pages & posts tab — override and analyze the SEO metadata of one page or post",
    },
  ];
}

/** `replace: true` so moving between tabs does not grow the back stack one entry per click — the
 *  same call `Deployment.tsx`/`Sites.tsx`/`Themes.tsx` make for their own `?tab=`. A module-level
 *  function, not an inline arrow, so `TabBar`'s `onChange` takes it directly. */
export function goToSeoTab(tabId: string) {
  navigate(`/seo?tab=${tabId}`, { replace: true });
}

/** One `FormData` field as a string, with the caller's fallback for an absent field. Its own named
 *  function purely so {@link buildSeoSettingsPatch} below stays readable at a glance: written
 *  inline, the seven fields' `?? `/`||` chains scored the patch builder at the ESLint ceiling
 *  (`apps/admin` enforces 9/9 as a hard error) for no gain in clarity. */
function formString(form: FormData, key: string, fallback = ""): string {
  return String(form.get(key) ?? fallback);
}

/** A `FormData` field that is omitted entirely when blank, rather than persisted as an empty
 *  string. Preserves the exact `String(...) || undefined` semantics the inline version had — an
 *  empty box means "no site default", not "a default that is the empty string". */
function optionalFormString(form: FormData, key: string): string | undefined {
  return formString(form, key) || undefined;
}

/**
 * The site-wide settings patch the defaults form submits — lifted verbatim out of the form's own
 * inline `onSubmit` when this screen gained tabs. Same seven fields, same fallbacks, same
 * `checkbox === "on"` reading of the three toggles; nothing about what gets saved changed.
 *
 * @complexity O(1) — a fixed set of field reads, no iteration.
 */
export function buildSeoSettingsPatch(form: FormData): Partial<SeoSettings> {
  return {
    titleTemplate: formString(form, "titleTemplate", "%s"),
    defaultDescription: optionalFormString(form, "defaultDescription"),
    defaultOgImage: optionalFormString(form, "defaultOgImage"),
    twitterSite: optionalFormString(form, "twitterSite"),
    defaultRobots: {
      noindex: form.get("noindex") === "on",
      nofollow: form.get("nofollow") === "on",
    },
    sitemapEnabled: form.get("sitemapEnabled") === "on",
  };
}

/** The Sitemap tab's one-line state read, so the tab reports whether a sitemap is published at all
 *  instead of offering a Regenerate button with no indication it is switched off. The control
 *  itself deliberately stays on the Site defaults tab — see this file's header. */
export function sitemapStateLabel(locale: string, sitemapEnabled: boolean): string {
  if (sitemapEnabled) return t(locale, "This site publishes a sitemap.");
  return t(locale, "This site does not publish a sitemap. Turn it on under Site defaults.");
}
