import { useEffect, useState } from "react";
import { api, describeApiError, type SeoEntryAnalysis, type SeoEntryMeta, type SeoEntryOverridesPatch } from "../../../lib/api";

/**
 * @file Everything `SeoEntryPanel` (REQ-06's per-entry overrides edit form + REQ-07's analyze
 * view) does, so it can stay markup only.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings.
 * `fieldValue`/`setField` stay here rather than move to `rules.ts`: both close over this hook's
 * own `touched` state (a component-scoped getter/setter pair, not a rule of the domain), the same
 * category as `usePosts`' `setPendingDelete`.
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
   *  (server-effective) value for any field not yet edited this session. */
  fieldValue: <K extends keyof SeoEntryOverridesPatch>(key: K, resolvedValue: SeoEntryOverridesPatch[K]) => SeoEntryOverridesPatch[K];
  setField: <K extends keyof SeoEntryOverridesPatch>(key: K, value: SeoEntryOverridesPatch[K]) => void;
  save: () => Promise<void>;
  touched: SeoEntryOverridesPatch;
}

export function useSeoEntryPanel(options: SeoEntryPanelOptions): SeoEntryPanelController {
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
    Promise.all([api.getSeoEntry(entryId), api.getSeoEntryAnalyze(entryId)])
      .then(([metaRes, analyzeRes]) => {
        setResolved(metaRes.data);
        setAnalysis(analyzeRes.data);
      })
      .catch((e) => setLoadError(describeApiError(e, "failed to load entry SEO data")));
  }

  useEffect(load, [entryId]);

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
      const r = await api.putSeoEntry({ entryId }, touched);
      setResolved(r.data);
      setTouched({});
      setNotice("Saved.");
      api
        .getSeoEntryAnalyze(entryId)
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

  return { resolved, analysis, loadError, saving, saveError, notice, fieldValue, setField, save, touched };
}
