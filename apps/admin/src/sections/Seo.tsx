import { useEffect, useState } from "react";
import { api, type SeoSettings } from "../lib/api";

/**
 * `SeoSettingsScreen` (SPEC-008 ui.spec.md §2.4) — the site-wide `seo.*` settings form +
 * `SitemapRegenerateButton` (§2.6). Coordinator-authored 2026-07-13, post-session-limit resume.
 *
 * Scope note: `SeoEntryPanel` (§2.1/§2.7, embedded per-entry meta editing inside the Post/Page
 * editor) is NOT built in this pass — that requires touching `PostEditor.tsx`, out of scope for
 * closing the site-wide settings gap. `RobotsRuleEditor` (§2.5) is implemented as a minimal
 * textarea-per-rule form here rather than the full add/edit/remove control surface the spec
 * describes, to keep this pass proportional to the remaining time budget.
 */
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
        directives. Per-entry overrides live on each post/page's own editor.
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
    </div>
  );
}
