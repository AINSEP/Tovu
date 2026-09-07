import { useEffect, useState } from "react";
import { describeApiError, type SeoEntryAnalysis, type SeoEntryMeta, type SeoEntryOverridesPatch } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { overrideOrClear } from "../rules";
import { t } from "../seo-i18n";
import { defaultSeoPort } from "./seo-dependencies.hooks";
import type { SeoPort } from "./seo-port.hooks";

/**
 * @file Everything `SeoEntryPanel` (REQ-06's per-entry overrides edit form + REQ-07's analyze
 * view) does, so it can stay markup only.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings.
 * `fieldValue`/`setField` stay here rather than move to `rules.ts`: both close over this hook's
 * own `touched` state (a component-scoped getter/setter pair, not a rule of the domain), the same
 * category as `usePosts`' `setPendingDelete`.
 *
 * `port` is injected — see `seo-port.hooks.ts` (shared with `use-seo.hooks.ts` and
 * `use-entry-picker.hooks.ts`, since all three read/write the same SEO surface) — rather than
 * importing `lib/api` directly, so a test can describe load/save outcomes against
 * `createFakeSeoPort` instead of stubbing global `fetch`. `useWiredSeoEntryPanel` below is the
 * zero-argument pair `Seo.tsx` actually mounts.
 */

export interface SeoEntryPanelOptions {
  entryId: string;
}

export interface SeoEntryPanelController {
  resolved: SeoEntryMeta | null;
  analysis: SeoEntryAnalysis | null;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  notice: string | null;
  /** Reads back whatever the operator touched for `key`, falling back to the resolved
   *  (server-effective) value for any field not yet edited this session. A field the operator
   *  EMPTIED reads back as `null` (the pending clear), which `Seo.tsx`'s own `?? ""` renders as an
   *  empty box — so the field the operator cleared stays cleared on screen. */
  fieldValue: <K extends keyof SeoEntryOverridesPatch>(key: K, resolvedValue: SeoEntryOverridesPatch[K]) => SeoEntryOverridesPatch[K];
  setField: <K extends keyof SeoEntryOverridesPatch>(key: K, value: SeoEntryOverridesPatch[K]) => void;
  save: () => Promise<void>;
  /** The patch `save` will PUT — only the fields the operator actually touched this session, with
   *  `null` for each one they emptied. An untouched field is ABSENT, never `null`: "unchanged" must
   *  never become "clear". */
  touched: SeoEntryOverridesPatch;
}

export function useSeoEntryPanel(options: SeoEntryPanelOptions, port: SeoPort, locale: string): SeoEntryPanelController {
  const { entryId } = options;
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
    Promise.all([port.getSeoEntry(entryId), port.getSeoEntryAnalyze(entryId)])
      .then(([metaRes, analyzeRes]) => {
        setResolved(metaRes.data);
        setAnalysis(analyzeRes.data);
      })
      .catch((e) => setLoadError(describeApiError(e, t(locale, "failed to load entry SEO data"))));
  }

  useEffect(load, [entryId, port]);

  function fieldValue<K extends keyof SeoEntryOverridesPatch>(key: K, resolvedValue: SeoEntryOverridesPatch[K]): SeoEntryOverridesPatch[K] {
    return key in touched ? touched[key] : resolvedValue;
  }

  // The `overrideOrClear` call is the whole clear-an-override fix, and it lives HERE rather than at
  // the eleven `onChange` handlers in `Seo.tsx` deliberately: normalizing at the single sink means
  // no field can be added to that form later and silently miss it (the "correct primitive, unwired
  // call site" failure this codebase keeps hitting), and it keeps `Seo.tsx` markup-only. `touched`
  // therefore holds `null` for a field the operator emptied, which is exactly what `save` PUTs.
  function setField<K extends keyof SeoEntryOverridesPatch>(key: K, value: SeoEntryOverridesPatch[K]) {
    setTouched((current) => ({ ...current, [key]: overrideOrClear(value) }));
  }

  async function save() {
    if (Object.keys(touched).length === 0) return;
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      const r = await port.putSeoEntry({ entryId }, touched);
      setResolved(r.data);
      setTouched({});
      setNotice(t(locale, "Saved."));
      port
        .getSeoEntryAnalyze(entryId)
        .then((analyzeRes) => setAnalysis(analyzeRes.data))
        .catch(() => {
          /* analyze refresh is best-effort; the save itself already succeeded */
        });
    } catch (e) {
      setSaveError(describeApiError(e, t(locale, "failed to save SEO overrides")));
    } finally {
      setSaving(false);
    }
  }

  return { resolved, analysis, loadError, saving, saveError, notice, fieldValue, setField, save, touched };
}

/**
 * Binds the real `/api/.../seo/entries` client — see `seo-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Seo.tsx` composes
 * this and a test composes {@link useSeoEntryPanel} with `createFakeSeoPort`.
 */
export function useWiredSeoEntryPanel(options: SeoEntryPanelOptions): SeoEntryPanelController {
  const locale = useAdminLocale();
  return useSeoEntryPanel(options, defaultSeoPort, locale);
}
