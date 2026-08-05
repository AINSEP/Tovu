import { useEffect, useState } from "react";
import { api, type SeoSettings } from "../../../lib/api";

/**
 * @file Everything the top-level `Seo` screen does (the site-wide defaults form + sitemap
 * regenerate action), so `Seo.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings.
 * `SeoSettingsScreen`'s per-section state (`EntryPicker`, `SeoEntryPanel`, `SeoEntrySection`) lives
 * in its own sibling hook files, not here — each section is independent and this hook only owns
 * what the top-level component itself renders.
 */

export interface SeoController {
  settings: SeoSettings | null;
  error: string | null;
  saving: boolean;
  notice: string | null;
  save: (patch: Partial<SeoSettings>) => Promise<void>;
  regenerateSitemap: () => Promise<void>;
}

export function useSeo(): SeoController {
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

  return { settings, error, saving, notice, save, regenerateSitemap };
}
