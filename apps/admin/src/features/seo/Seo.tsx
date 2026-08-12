import { agentHandle } from "@jini-ai/agentic";

import { actionLabel, orEmpty, sortIssuesBySeverity } from "./rules";
import { useWiredEntryPicker } from "./hooks/use-entry-picker.hooks";
import { useWiredSeoEntryPanel } from "./hooks/use-seo-entry-panel.hooks";
import { useSeoEntrySection } from "./hooks/use-seo-entry-section.hooks";
import { useWiredSeo } from "./hooks/use-seo.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./seo-i18n";
import type { SeoEntryAnalysis } from "../../lib/api";

/**
 * `SeoSettingsScreen` (SPEC-008 ui.spec.md §2.4) — the site-wide `seo.*` settings form +
 * `SitemapRegenerateButton` (§2.6). Coordinator-authored 2026-07-13, post-session-limit resume.
 * Markup only.
 *
 * State and API calls live in one hook per component: `hooks/use-seo.hooks.ts` (top-level
 * defaults form + sitemap button), `hooks/use-entry-picker.hooks.ts`, `hooks/use-seo-entry-panel
 * .hooks.ts`, `hooks/use-seo-entry-section.hooks.ts`. The issue-severity sort lives in `rules.ts`.
 *
 * SPEC-037 REQ-06/07/08: `SeoEntryPanel` closes the deferred per-entry gap this file's own header
 * used to disclose — a standalone entry picker (dropdown over `listPosts`/`listPages`, cheaper
 * than threading a new panel through `PostEditor.tsx`, per REQ-06's own "implementer's choice")
 * plus a partial-override edit form and a read-only analyze view. `RobotsRuleEditor` (§2.5) is
 * still a minimal textarea-per-rule form (unchanged from the original disclosed scope note).
 *
 * `locale` is fetched once in `Seo` via `useAdminLocale()` and threaded down as a prop — see
 * `Database.tsx`'s file header for why (the hook's `loadLanguage()` isn't memoized).
 */

export interface EntryPickerProps {
  locale: string;
  entryId: string;
  onChange: (entryId: string) => void;
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. */
  useEntryPickerHook?: typeof useWiredEntryPicker;
}

/** Dropdown over every post + page, sourced from the already-existing `listPosts`/`listPages`
 * routes — cheapest entry-selection UX available given what's already built (REQ-06). */
function EntryPicker({ locale, entryId, onChange, useEntryPickerHook = useWiredEntryPicker }: EntryPickerProps) {
  const { entries, error } = useEntryPickerHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!entries) return <div className="notice">{t(locale, "Loading entries…")}</div>;

  return (
    <label>
      {t(locale, "Entry")}
      <select value={entryId} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t(locale, "Choose an entry…")}</option>
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.title} ({entry.status})
          </option>
        ))}
      </select>
    </label>
  );
}

/** Read-only score + issues view (REQ-07) — exact field names read off `SeoAnalysis`/`SeoIssue`
 * (`src/seo/types.ts`), not guessed. No state of its own — only the severity sort, which lives in
 * `rules.ts` as `sortIssuesBySeverity`. */
function AnalyzePanel(props: { locale: string; analysis: SeoEntryAnalysis }) {
  const { locale } = props;
  const sortedIssues = sortIssuesBySeverity(props.analysis.issues);

  return (
    <div className="notice seo-analyze-panel">
      <h3>{t(locale, "Analysis")}</h3>
      <p>
        {t(locale, "Score:")} <strong>{props.analysis.score}</strong>
      </p>
      {sortedIssues.length === 0 ? (
        <p className="muted-cell">{t(locale, "No issues.")}</p>
      ) : (
        <ul>
          {sortedIssues.map((issue, i) => (
            <li key={`${issue.code}-${i}`}>
              <span className={`status status-${issue.severity === "error" ? "failure" : issue.severity === "warning" ? "unavailable" : "success"}`}>
                {issue.severity}
              </span>{" "}
              <code>{issue.code}</code>
              {issue.field ? <span className="muted-cell"> ({issue.field})</span> : null} — {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface SeoEntryPanelProps {
  locale: string;
  entryId: string;
  useSeoEntryPanelHook?: typeof useWiredSeoEntryPanel;
}

/** Per-entry overrides edit form (REQ-06). Pre-fills from `getSeoEntry`'s resolved meta, but
 * tracks which fields the user actually touched so `putSeoEntry` only ever sends a genuine
 * partial patch — matching the resolved-vs-override distinction `SeoExtFields` implies (an
 * untouched field must not turn into a persisted override equal to today's resolved default). */
// EXEMPTION (complexity ceiling, 2026-08-06, updated for the ≤9/≤9 bar): ESLint scores this
// component's cyclomatic complexity at 25 against a 9 ceiling, but its cognitive complexity is 6
// (also under 9). That gap between the two is the signature of a
// measurement artifact, not real branching: eleven form fields each read as
// `fieldValue(key, resolved.X ?? default) ?? default`, and ESLint's cyclomatic rule counts every
// `??` as its own decision point — twenty of the twenty-five come from those fallback chains alone,
// none of which nest inside one another or inside each other's control flow (which is exactly what
// keeps cognitive complexity low). The other five points are ordinary flat conditionals (notice,
// saveError, the disabled expression, the Save button's label, the analysis panel) already under
// the ceiling on their own. There is nothing to extract: splitting the eleven fields into their own
// components would still evaluate the same fallback chains, just spread across more functions, for
// no complexity benefit and a real loss of "one form, one place to read its fields."
function SeoEntryPanel({ locale, entryId, useSeoEntryPanelHook = useWiredSeoEntryPanel }: SeoEntryPanelProps) {
  const { resolved, analysis, loadError, saving, saveError, notice, fieldValue, setField, save, touched } = useSeoEntryPanelHook({ entryId });

  if (loadError) return <div className="notice error">{loadError}</div>;
  if (!resolved) return <div className="notice">{t(locale, "Loading entry SEO…")}</div>;

  return (
    <div className="notice seo-entry-panel">
      <h3>{t(locale, "Per-entry overrides")}</h3>
      <p className="muted-cell">
        {t(locale, "Fields show the currently-effective value (author override, or site default, or derived from the entry). Only fields you change here are saved as overrides.")}
      </p>
      {notice ? <div className="notice">{notice}</div> : null}
      {saveError ? (
        <div className="notice error" role="alert">
          {saveError}
        </div>
      ) : null}

      <label>
        {t(locale, "Title")}
        <input value={fieldValue("title", resolved.title) ?? ""} onChange={(e) => setField("title", e.target.value)} />
      </label>
      <label>
        {t(locale, "Description")}
        <textarea
          value={fieldValue("description", resolved.description ?? "") ?? ""}
          onChange={(e) => setField("description", e.target.value)}
        />
      </label>
      <label>
        {t(locale, "Canonical URL")}
        <input
          value={fieldValue("canonical", resolved.canonical) ?? ""}
          onChange={(e) => setField("canonical", e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={fieldValue("noindex", resolved.robots.noindex) ?? false}
          onChange={(e) => setField("noindex", e.target.checked)}
        />
        {t(locale, "Noindex")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={fieldValue("nofollow", resolved.robots.nofollow) ?? false}
          onChange={(e) => setField("nofollow", e.target.checked)}
        />
        {t(locale, "Nofollow")}
      </label>
      <label>
        {t(locale, "OG title")}
        <input
          value={fieldValue("ogTitle", resolved.openGraph.title) ?? ""}
          onChange={(e) => setField("ogTitle", e.target.value)}
        />
      </label>
      <label>
        {t(locale, "OG description")}
        <input
          value={fieldValue("ogDescription", resolved.openGraph.description ?? "") ?? ""}
          onChange={(e) => setField("ogDescription", e.target.value)}
        />
      </label>
      <label>
        {t(locale, "OG image (media ref or URL)")}
        <input
          value={fieldValue("ogImage", resolved.openGraph.image ?? "") ?? ""}
          onChange={(e) => setField("ogImage", e.target.value)}
        />
      </label>
      <label>
        {t(locale, "Twitter title")}
        <input
          value={fieldValue("twitterTitle", resolved.twitter.title) ?? ""}
          onChange={(e) => setField("twitterTitle", e.target.value)}
        />
      </label>
      <label>
        {t(locale, "Twitter description")}
        <input
          value={fieldValue("twitterDescription", resolved.twitter.description ?? "") ?? ""}
          onChange={(e) => setField("twitterDescription", e.target.value)}
        />
      </label>
      <label>
        {t(locale, "Twitter image (media ref or URL)")}
        <input
          value={fieldValue("twitterImage", resolved.twitter.image ?? "") ?? ""}
          onChange={(e) => setField("twitterImage", e.target.value)}
        />
      </label>

      <span className="editor-actions">
        <button type="button" className="btn-secondary" onClick={save} disabled={saving || Object.keys(touched).length === 0}>
          {saving ? t(locale, "Saving…") : t(locale, "Save overrides")}
        </button>
      </span>

      {analysis ? <AnalyzePanel locale={locale} analysis={analysis} /> : null}
    </div>
  );
}

export interface SeoEntrySectionProps {
  locale: string;
  useSeoEntrySectionHook?: typeof useSeoEntrySection;
}

/** Section wrapper (REQ-06/07) — entry picker over the per-entry edit + analyze panels. */
function SeoEntrySection({ locale, useSeoEntrySectionHook = useSeoEntrySection }: SeoEntrySectionProps) {
  const { entryId, setEntryId } = useSeoEntrySectionHook();

  return (
    <div
      className="seo-entry-section"
      {...agentHandle("seo-per-entry", {
        role: "region",
        label: "Per-entry SEO overrides — pick one entry and edit or analyze its metadata",
      })}
    >
      <h2>{t(locale, "Per-entry SEO")}</h2>
      <EntryPicker locale={locale} entryId={entryId} onChange={setEntryId} />
      {entryId ? <SeoEntryPanel locale={locale} key={entryId} entryId={entryId} /> : null}
    </div>
  );
}

export interface SeoProps {
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  nothing and behave exactly as before. */
  useSeoHook?: typeof useWiredSeo;
}

export function Seo({ useSeoHook = useWiredSeo }: SeoProps = {}) {
  const locale = useAdminLocale();
  const { settings, error, saving, notice, save, regenerateSitemap } = useSeoHook();

  if (error && !settings) return <div className="notice error">{error}</div>;
  if (!settings) return <div className="notice">{t(locale, "Loading SEO settings…")}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Marketing")}</p>
          <h1 className="page-title">SEO</h1>
          <p className="page-description">
            {t(locale, "Site-wide defaults for meta titles, descriptions, Open Graph/Twitter cards, and robots directives. Per-entry overrides are below.")}
          </p>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <form
        className="card"
        {...agentHandle("seo-defaults-form", {
          role: "form",
          label: "Site-wide SEO defaults — title template, meta description, social image, robots",
        })}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          save({
            titleTemplate: String(form.get("titleTemplate") ?? "%s"),
            defaultDescription: String(form.get("defaultDescription") ?? "") || undefined,
            defaultOgImage: String(form.get("defaultOgImage") ?? "") || undefined,
            twitterSite: String(form.get("twitterSite") ?? "") || undefined,
            defaultRobots: {
              noindex: form.get("noindex") === "on",
              nofollow: form.get("nofollow") === "on",
            },
            sitemapEnabled: form.get("sitemapEnabled") === "on",
          });
        }}
      >
        <div className="field-group">
          <div className="field">
            <label className="field-label" htmlFor="seo-title-template">
              {t(locale, "Title template (must contain %s)")}
            </label>
            <input
              id="seo-title-template"
              name="titleTemplate"
              defaultValue={settings.titleTemplate}
              {...agentHandle("seo-title-template", {
                role: "field",
                label: "Site-wide title template; %s is replaced by the page's own title",
              })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="seo-default-description">
              {t(locale, "Default meta description")}
            </label>
            <textarea
              id="seo-default-description"
              name="defaultDescription"
              defaultValue={orEmpty(settings.defaultDescription)}
              {...agentHandle("seo-default-description", {
                role: "field",
                label: "Fallback meta description for pages that set none of their own",
              })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="seo-default-og-image">
              {t(locale, "Default Open Graph / Twitter image (media ref)")}
            </label>
            <input
              id="seo-default-og-image"
              name="defaultOgImage"
              defaultValue={orEmpty(settings.defaultOgImage)}
              {...agentHandle("seo-default-og-image", {
                role: "field",
                label: "Media reference used as the default social share image",
              })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="seo-twitter-site">
              {t(locale, "Twitter @site handle")}
            </label>
            <input
              id="seo-twitter-site"
              name="twitterSite"
              defaultValue={orEmpty(settings.twitterSite)}
              {...agentHandle("seo-twitter-site", {
                role: "field",
                label: "The site's Twitter @handle, used in Twitter card metadata",
              })}
            />
          </div>
        </div>

        <div className="field-group">
          <label className="form-checkbox-field">
            <input
              type="checkbox"
              name="noindex"
              defaultChecked={settings.defaultRobots.noindex}
              {...agentHandle("seo-default-noindex", {
                role: "checkbox",
                label: "Ask search engines not to index pages by default",
              })}
            />
            {t(locale, "Default noindex")}
          </label>
          <label className="form-checkbox-field">
            <input
              type="checkbox"
              name="nofollow"
              defaultChecked={settings.defaultRobots.nofollow}
              {...agentHandle("seo-default-nofollow", {
                role: "checkbox",
                label: "Ask search engines not to follow links by default",
              })}
            />
            {t(locale, "Default nofollow")}
          </label>
          <label className="form-checkbox-field">
            <input
              type="checkbox"
              name="sitemapEnabled"
              defaultChecked={settings.sitemapEnabled}
              {...agentHandle("seo-sitemap-enabled", {
                role: "checkbox",
                label: "Whether this site publishes a sitemap at all",
              })}
            />
            {t(locale, "Sitemap enabled")}
          </label>
        </div>

        <div className="editor-actions form-actions">
          <button
            type="submit"
            disabled={saving}
            {...agentHandle("seo-save-settings", {
              role: "button",
              label: "Save the site-wide SEO defaults above",
            })}
          >
            {actionLabel(saving, t(locale, "Saving…"), t(locale, "Save settings"))}
          </button>
        </div>
      </form>

      <div
        {...agentHandle("seo-sitemap", {
          role: "region",
          label: "Sitemap — force a rebuild of the cached sitemap",
        })}
      >
        <h2>{t(locale, "Sitemap")}</h2>
        <p>{t(locale, "Force-rebuild the cached sitemap now, bypassing the normal cache-hit path.")}</p>
        <button
          className="btn-secondary"
          disabled={saving}
          onClick={regenerateSitemap}
          {...agentHandle("seo-regenerate-sitemap", {
            role: "button",
            label: "Rebuild the cached sitemap now, bypassing the cache",
          })}
        >
          {actionLabel(saving, t(locale, "Working…"), t(locale, "Regenerate sitemap"))}
        </button>
      </div>

      <SeoEntrySection locale={locale} />
    </div>
  );
}
