import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  type AdminPost,
  type SeoEntryAnalysis,
  type SeoEntryMeta,
  type SeoEntryOverridesPatch,
  type SeoSettings,
} from "../lib/api";

/**
 * `SeoSettingsScreen` (SPEC-008 ui.spec.md §2.4) — the site-wide `seo.*` settings form +
 * `SitemapRegenerateButton` (§2.6). Coordinator-authored 2026-07-13, post-session-limit resume.
 *
 * SPEC-037 REQ-06/07/08: `SeoEntryPanel` closes the deferred per-entry gap this file's own header
 * used to disclose — a standalone entry picker (dropdown over `listPosts`/`listPages`, cheaper
 * than threading a new panel through `PostEditor.tsx`, per REQ-06's own "implementer's choice")
 * plus a partial-override edit form and a read-only analyze view. `RobotsRuleEditor` (§2.5) is
 * still a minimal textarea-per-rule form (unchanged from the original disclosed scope note).
 */

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** Dropdown over every post + page, sourced from the already-existing `listPosts`/`listPages`
 * routes — cheapest entry-selection UX available given what's already built (REQ-06). */
function EntryPicker(props: { entryId: string; onChange: (entryId: string) => void }) {
  const [entries, setEntries] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listPosts(), api.listPages()])
      .then(([posts, pages]) =>
        setEntries([...posts.posts.map((p) => p.post), ...pages.posts.map((p) => p.post)])
      )
      .catch((e) => setError(describeApiError(e, "failed to load entries")));
  }, []);

  if (error) return <div className="notice error">{error}</div>;
  if (!entries) return <div className="notice">Loading entries…</div>;

  return (
    <label>
      Entry
      <select value={props.entryId} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Choose an entry…</option>
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.title} ({entry.status})
          </option>
        ))}
      </select>
    </label>
  );
}

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

/** Read-only score + issues view (REQ-07) — exact field names read off `SeoAnalysis`/`SeoIssue`
 * (`src/seo/types.ts`), not guessed. */
function AnalyzePanel(props: { analysis: SeoEntryAnalysis }) {
  const sortedIssues = [...props.analysis.issues].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  return (
    <div className="notice seo-analyze-panel">
      <h3>Analysis</h3>
      <p>
        Score: <strong>{props.analysis.score}</strong>
      </p>
      {sortedIssues.length === 0 ? (
        <p className="muted-cell">No issues.</p>
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

/** Per-entry overrides edit form (REQ-06). Pre-fills from `getSeoEntry`'s resolved meta, but
 * tracks which fields the user actually touched so `putSeoEntry` only ever sends a genuine
 * partial patch — matching the resolved-vs-override distinction `SeoExtFields` implies (an
 * untouched field must not turn into a persisted override equal to today's resolved default). */
function SeoEntryPanel(props: { entryId: string }) {
  const [resolved, setResolved] = useState<SeoEntryMeta | null>(null);
  const [analysis, setAnalysis] = useState<SeoEntryAnalysis | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [touched, setTouched] = useState<SeoEntryOverridesPatch>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    setLoadError(null);
    setResolved(null);
    setAnalysis(null);
    setTouched({});
    setSaveError(null);
    setNotice(null);
    Promise.all([api.getSeoEntry(props.entryId), api.getSeoEntryAnalyze(props.entryId)])
      .then(([metaRes, analyzeRes]) => {
        setResolved(metaRes.data);
        setAnalysis(analyzeRes.data);
      })
      .catch((e) => setLoadError(describeApiError(e, "failed to load entry SEO data")));
  }

  useEffect(load, [props.entryId]);

  function fieldValue<K extends keyof SeoEntryOverridesPatch>(key: K, resolvedValue: SeoEntryOverridesPatch[K]): SeoEntryOverridesPatch[K] {
    return key in touched ? touched[key] : resolvedValue;
  }

  function setField<K extends keyof SeoEntryOverridesPatch>(key: K, value: SeoEntryOverridesPatch[K]) {
    setTouched((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (Object.keys(touched).length === 0) return;
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      const r = await api.putSeoEntry({ entryId: props.entryId }, touched);
      setResolved(r.data);
      setTouched({});
      setNotice("Saved.");
      api
        .getSeoEntryAnalyze(props.entryId)
        .then((analyzeRes) => setAnalysis(analyzeRes.data))
        .catch(() => {
          /* analyze refresh is best-effort; the save itself already succeeded */
        });
    } catch (e) {
      setSaveError(describeApiError(e, "failed to save SEO overrides"));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <div className="notice error">{loadError}</div>;
  if (!resolved) return <div className="notice">Loading entry SEO…</div>;

  return (
    <div className="notice seo-entry-panel">
      <h3>Per-entry overrides</h3>
      <p className="muted-cell">
        Fields show the currently-effective value (author override, or site default, or derived
        from the entry). Only fields you change here are saved as overrides.
      </p>
      {notice ? <div className="notice">{notice}</div> : null}
      {saveError ? (
        <div className="notice error" role="alert">
          {saveError}
        </div>
      ) : null}

      <label>
        Title
        <input value={fieldValue("title", resolved.title) ?? ""} onChange={(e) => setField("title", e.target.value)} />
      </label>
      <label>
        Description
        <textarea
          value={fieldValue("description", resolved.description ?? "") ?? ""}
          onChange={(e) => setField("description", e.target.value)}
        />
      </label>
      <label>
        Canonical URL
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
        Noindex
      </label>
      <label>
        <input
          type="checkbox"
          checked={fieldValue("nofollow", resolved.robots.nofollow) ?? false}
          onChange={(e) => setField("nofollow", e.target.checked)}
        />
        Nofollow
      </label>
      <label>
        OG title
        <input
          value={fieldValue("ogTitle", resolved.openGraph.title) ?? ""}
          onChange={(e) => setField("ogTitle", e.target.value)}
        />
      </label>
      <label>
        OG description
        <input
          value={fieldValue("ogDescription", resolved.openGraph.description ?? "") ?? ""}
          onChange={(e) => setField("ogDescription", e.target.value)}
        />
      </label>
      <label>
        OG image (media ref or URL)
        <input
          value={fieldValue("ogImage", resolved.openGraph.image ?? "") ?? ""}
          onChange={(e) => setField("ogImage", e.target.value)}
        />
      </label>
      <label>
        Twitter title
        <input
          value={fieldValue("twitterTitle", resolved.twitter.title) ?? ""}
          onChange={(e) => setField("twitterTitle", e.target.value)}
        />
      </label>
      <label>
        Twitter description
        <input
          value={fieldValue("twitterDescription", resolved.twitter.description ?? "") ?? ""}
          onChange={(e) => setField("twitterDescription", e.target.value)}
        />
      </label>
      <label>
        Twitter image (media ref or URL)
        <input
          value={fieldValue("twitterImage", resolved.twitter.image ?? "") ?? ""}
          onChange={(e) => setField("twitterImage", e.target.value)}
        />
      </label>

      <span className="editor-actions">
        <button type="button" onClick={save} disabled={saving || Object.keys(touched).length === 0}>
          {saving ? "Saving…" : "Save overrides"}
        </button>
      </span>

      {analysis ? <AnalyzePanel analysis={analysis} /> : null}
    </div>
  );
}

/** Section wrapper (REQ-06/07) — entry picker over the per-entry edit + analyze panels. */
function SeoEntrySection() {
  const [entryId, setEntryId] = useState("");

  return (
    <div className="seo-entry-section">
      <h2>Per-entry SEO</h2>
      <EntryPicker entryId={entryId} onChange={setEntryId} />
      {entryId ? <SeoEntryPanel key={entryId} entryId={entryId} /> : null}
    </div>
  );
}
export function Seo() {
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSeoSettings()
      .then((r) => setSettings(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load SEO settings"));
  }, []);

  async function save(patch: Partial<SeoSettings>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.setSeoSettings(patch);
      setSettings(r.data);
      setNotice("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save SEO settings");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateSitemap() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.regenerateSitemap();
      setNotice("Sitemap regeneration accepted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to regenerate sitemap");
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <div className="notice error">{error}</div>;
  if (!settings) return <div className="notice">Loading SEO settings…</div>;

  return (
    <div>
      <h1>SEO</h1>
      <p>
        Site-wide defaults for meta titles, descriptions, Open Graph/Twitter cards, and robots
        directives. Per-entry overrides are below.
      </p>
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <form
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
        <label>
          Title template (must contain %s)
          <input name="titleTemplate" defaultValue={settings.titleTemplate} />
        </label>
        <label>
          Default meta description
          <textarea name="defaultDescription" defaultValue={settings.defaultDescription ?? ""} />
        </label>
        <label>
          Default Open Graph / Twitter image (media ref)
          <input name="defaultOgImage" defaultValue={settings.defaultOgImage ?? ""} />
        </label>
        <label>
          Twitter @site handle
          <input name="twitterSite" defaultValue={settings.twitterSite ?? ""} />
        </label>
        <label>
          <input type="checkbox" name="noindex" defaultChecked={settings.defaultRobots.noindex} />
          Default noindex
        </label>
        <label>
          <input type="checkbox" name="nofollow" defaultChecked={settings.defaultRobots.nofollow} />
          Default nofollow
        </label>
        <label>
          <input type="checkbox" name="sitemapEnabled" defaultChecked={settings.sitemapEnabled} />
          Sitemap enabled
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>

      <h2>Sitemap</h2>
      <p>Force-rebuild the cached sitemap now, bypassing the normal cache-hit path.</p>
      <button disabled={saving} onClick={regenerateSitemap}>
        {saving ? "Working…" : "Regenerate sitemap"}
      </button>

      <SeoEntrySection />
    </div>
  );
}
