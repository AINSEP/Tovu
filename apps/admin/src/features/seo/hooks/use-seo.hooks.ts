import { useEffect, useState } from "react";
import { api, type SeoSettings } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../seo-i18n";

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
  const locale = useAdminLocale();
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSeoSettings()
      .then((r) => setSettings(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : t(locale, "failed to load SEO settings")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch: Partial<SeoSettings>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.setSeoSettings(patch);
      setSettings(r.data);
      setNotice(t(locale, "Saved."));
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "failed to save SEO settings"));
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
      setNotice(t(locale, "Sitemap regeneration accepted."));
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "failed to regenerate sitemap"));
    } finally {
      setSaving(false);
    }
  }

  return { settings, error, saving, notice, save, regenerateSitemap };
}
