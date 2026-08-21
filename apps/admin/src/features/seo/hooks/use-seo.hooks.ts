import { useEffect, useState } from "react";
import type { SeoSettings } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../seo-i18n";
import { defaultSeoPort } from "./seo-dependencies.hooks";
import type { SeoPort } from "./seo-port.hooks";

/**
 * @file Everything the top-level `Seo` screen does (the site-wide defaults form + sitemap
 * regenerate action), so `Seo.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings.
 * `SeoSettingsScreen`'s per-section state (`EntryPicker`, `SeoEntryPanel`, `SeoEntrySection`) lives
 * in its own sibling hook files, not here — each section is independent and this hook only owns
 * what the top-level component itself renders.
 *
 * `port` is injected — see `seo-port.hooks.ts` (shared with `use-seo-entry-panel.hooks.ts` and
 * `use-entry-picker.hooks.ts`, since all three read/write the same SEO surface) — rather than
 * importing `lib/api` directly, so a test can describe load/save outcomes against
 * `createFakeSeoPort` instead of stubbing global `fetch`. `useWiredSeo` below is the zero-argument
 * pair `Seo.tsx` actually mounts. `useAdminLocale()` itself is called only inside `useWiredSeo` —
 * its resolved `locale` string is what gets injected, not the hook reference.
 *
 * `locale` is ALSO returned from {@link useSeo} (standing i18n rule, 2026-08-11 — a component with
 * a hook gets its locale-derived UI copy FROM that hook, not its own `useAdminLocale()` call) so
 * `Seo.tsx` sources it from here instead of calling `useAdminLocale()` itself, then keeps threading
 * the raw string down to `EntryPicker`/`SeoEntryPanel`/`SeoEntrySection` as before — this file's own
 * header already explains why those get `locale` as a prop rather than a bound `t`: `seo-i18n.ts`'s
 * own `t(locale, key)` is a pure function every one of them calls directly, never rebuilding a
 * dictionary lookup inline, so there is no bound closure to inject, only the raw string.
 */

export interface SeoController {
  settings: SeoSettings | null;
  error: string | null;
  saving: boolean;
  notice: string | null;
  save: (patch: Partial<SeoSettings>) => Promise<void>;
  regenerateSitemap: () => Promise<void>;
  /** The raw resolved locale — see this file's own header for why `Seo.tsx` gets this instead of
   *  calling `useAdminLocale()` itself. */
  locale: string;
}

export function useSeo(port: SeoPort, locale: string): SeoController {
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // `locale`/`t` are deliberately not listed — same pre-existing gap `use-page-editor.hooks.ts`
  // documents (this effect only ever ran off `[]` even when `locale` came from `useAdminLocale()`
  // directly); `port` is referentially stable in production (`useWiredSeo` always passes the same
  // module-level singleton).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `locale`/`t` gap predates this conversion (see comment above); `port` is referentially stable in production.
  useEffect(() => {
    port
      .getSeoSettings()
      .then((r) => setSettings(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : t(locale, "failed to load SEO settings")));
  }, [port]);

  async function save(patch: Partial<SeoSettings>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await port.setSeoSettings(patch);
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
      await port.regenerateSitemap();
      setNotice(t(locale, "Sitemap regeneration accepted."));
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "failed to regenerate sitemap"));
    } finally {
      setSaving(false);
    }
  }

  return { settings, error, saving, notice, save, regenerateSitemap, locale };
}

/**
 * Binds the real `/api/.../seo/settings` client — see `seo-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Seo.tsx` composes
 * this and a test composes {@link useSeo} with `createFakeSeoPort`.
 */
export function useWiredSeo(): SeoController {
  const locale = useAdminLocale();
  return useSeo(defaultSeoPort, locale);
}
