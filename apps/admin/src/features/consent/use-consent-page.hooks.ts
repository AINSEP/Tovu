import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConsentFieldProblem, ConsentSettingsView } from '@jini-ai/cookie-consent/react';

import { describeApiError } from '@/lib/admin-http/request';
import { createConsentAutosave, type ConsentAutosave, type ConsentTimers } from './consent-autosave';
import { consentPreviewScale } from '@jini-ai/cookie-consent/react';
import { canPublishConsent, isConsentConflict, type ConsentSaveState } from './rules';
import type { ConsentEditorLimits, ConsentReadiness, ConsentRevisionsPort, ConsentSettingsSnapshot } from './settings.hooks';

import { type Translate } from '@jini-ai/core/text';
/**
 * @file State for the Cookie Consent page. The page edits one draft revision (autosaved, see
 * `consent-autosave.ts`) and publishes it explicitly; the live site changes only on Publish. All
 * I/O goes through {@link ConsentRevisionsPort}; the page and its tabs are markup only.
 */

export interface ConsentPageController {
  loadError: string | null;
  editor: ConsentEditorLimits | null;
  /** `null` until the first load. Draft first, else the live (published or legacy) settings. */
  value: ConsentSettingsView | null;
  onChange(required: { patch: Partial<ConsentSettingsView> }, optional?: Record<string, never>): void;
  /** The saved draft's blocking problems; Publish stays off while there are any. */
  problems: ConsentFieldProblem[];
  saveState: ConsentSaveState;
  saveError: string | null;
  /** The newest saved draft revision, or null before the first save. */
  draftId: string | null;
  hasUnpublished: boolean;
  everPublished: boolean;
  /** Whether the banner is on for visitors right now. */
  liveEnabled: boolean;
  canPublish: boolean;
  publishing: boolean;
  publishError: string | null;
  /** Bumps after each publication so readiness can refresh. */
  publishedCount: number;
  publish(): Promise<void>;
  reload(): void;
}

interface Heads { draftId: string | null; publishedId: string | null }

function withDraftId({ draftId }: { draftId: string }, _optional = {}): (current: Heads) => Heads {
  return (current) => ({ ...current, draftId });
}

function withPreviewError({ error }: { error: string }, _optional = {}): (current: ConsentPreviewState) => ConsentPreviewState {
  return (current) => ({ ...current, error });
}

/** Loads the revisions, autosaves edits as a draft and publishes it on request.
 * @complexity O(1) per edit; one request in flight at a time. */
export function useConsentPage({ port, t }: { port: ConsentRevisionsPort; t: Translate }, { delayMs, timers }: { delayMs?: number; timers?: ConsentTimers } = {}): ConsentPageController {
  const {
    loadNonce, setLoadNonce, snapshot, setSnapshot, loadError, setLoadError, value, setValue, heads, setHeads, problems, setProblems, saveState, setSaveState,
    settled, setSettled, saveError, setSaveError, publishing, setPublishing, publishError, setPublishError, liveEnabled, setLiveEnabled, publishedCount,
    setPublishedCount, valueRef, autosave, currentLoadNonce, loadInputs,
  } = useConsentEditorState({ t, delayMs, timers });
  useConsentDraftLoad({ loadInputs, setLoadError, port, currentLoadNonce, loadNonce, valueRef, setSnapshot, setValue, setHeads, setLiveEnabled, setProblems, setSaveState, setSettled, setSaveError, setPublishError, autosave });

  const hasUnpublished = heads.draftId !== null && heads.draftId !== heads.publishedId;

  function onChange({ patch }: { patch: Partial<ConsentSettingsView> }) {
    if (!valueRef.current || saveState === 'conflict') return;
    const saver = autosave.current;
    if (!saver) throw new Error('cookie consent editor has no autosave');
    valueRef.current = { ...valueRef.current, ...patch };
    setValue(valueRef.current);
    setSettled(false);
    setPublishError(null);
    saver.change({ config: valueRef.current });
  }
  const { canPublish, publish } = createConsentPublisher({
    saveState, settled, hasUnpublished, problems, publishing, heads, valueRef, autosave, setPublishing, setPublishError, port, setHeads, setLiveEnabled,
    setPublishedCount, setSaveState, t,
  });

  return {
    loadError, editor: snapshot?.editor ?? null, value, onChange, problems, saveState, saveError,
    draftId: heads.draftId, hasUnpublished, everPublished: heads.publishedId !== null, liveEnabled, canPublish, publishing, publishError, publishedCount,
    publish, reload: () => setLoadNonce(nonce => nonce + 1),
  };
}

function createConsentPublisher(
  {
    saveState, settled, hasUnpublished, problems, publishing, heads, valueRef, autosave, setPublishing, setPublishError, port, setHeads, setLiveEnabled,
    setPublishedCount, setSaveState, t,
  }:
    Pick<ReturnType<typeof useConsentEditorState>, "saveState" | "settled" | "problems" | "publishing" | "heads" | "valueRef" | "autosave" | "setPublishing"
    | "setPublishError" | "setHeads" | "setLiveEnabled" | "setPublishedCount" | "setSaveState"> &
    Pick<Parameters<typeof useConsentPage>[0], "port" | "t"> &
    { hasUnpublished: boolean }
) {
  const canPublish = canPublishConsent({ saveState, settled, hasUnpublished, problems, publishing });

  async function publish() {
    if (!canPublish) return;
    // canPublish implies a saved, loaded draft: draftId, the value and autosave all exist.
    const draftId = heads.draftId;
    if (draftId === null) throw new Error('cookie consent publish has no draft id');
    if (valueRef.current === null) throw new Error('cookie consent publish has no settings');
    const saver = autosave.current;
    if (!saver) throw new Error('cookie consent publish has no autosave');
    setPublishing(true);
    setPublishError(null);
    try {
      await port.publish({ draftId, expectedPublishedId: heads.publishedId });
      setHeads({ draftId, publishedId: draftId });
      const currentValue = valueRef.current;
      if (!currentValue) throw new Error('cookie consent publish lost its settings');
      setLiveEnabled(currentValue.enabled);
      setPublishedCount(count => count + 1);
    } catch (error) {
      if (isConsentConflict({ error })) { saver.stop(); setSaveState('conflict'); }
      else setPublishError(describeApiError({ e: error, fallback: t("Couldn't publish.") }));
    } finally {
      setPublishing(false);
    }
  }
  return { canPublish, publish };
}

function useConsentDraftLoad(
  { loadInputs, setLoadError, port, currentLoadNonce, loadNonce, valueRef, setSnapshot, setValue, setHeads, setLiveEnabled, setProblems, setSaveState, setSettled, setSaveError, setPublishError, autosave }:
    Pick<ReturnType<typeof useConsentEditorState>, "loadInputs" | "setLoadError" | "currentLoadNonce" | "loadNonce" | "valueRef" | "setSnapshot" | "setValue" | "setHeads" | "setLiveEnabled" | "setProblems" | "setSaveState" | "setSettled" | "setSaveError" | "setPublishError" | "autosave"> & Pick<Parameters<typeof useConsentPage>[0], "port">
) {
  useEffect(() => {
    const { t, delayMs, timers } = loadInputs.current;
    let alive = true;
    setLoadError(null);
    port.get().then(loaded => {
      if (!alive || currentLoadNonce.current !== loadNonce) return;
      const draftId = loaded.draft?.id ?? null;
      valueRef.current = loaded.draft?.config ?? loaded.effective;
      setSnapshot(loaded);
      setValue(valueRef.current);
      setHeads({ draftId, publishedId: loaded.published?.id ?? null });
      setLiveEnabled(loaded.effective.enabled);
      setProblems([]); setSaveState('idle'); setSettled(true); setSaveError(null); setPublishError(null);
      autosave.current = createConsentAutosave({ port, draftId, events: {
        onSaving: () => setSaveState('saving'),
        onSaved: ({ result, settled: done }) => {
          setHeads(withDraftId({ draftId: result.revision.id }));
          setProblems(result.blockingProblems);
          if (done) { setSaveState('saved'); setSettled(true); }
        },
        onConflict: () => setSaveState('conflict'),
        onError: ({ error }) => { setSaveState('error'); setSaveError(describeApiError({ e: error, fallback: t("Couldn't save.") })); },
      } }, consentAutosaveOptions({ delayMs, timers }));
    }, error => { if (alive && currentLoadNonce.current === loadNonce) setLoadError(describeApiError({ e: error, fallback: t("Couldn't load cookie consent.") })); });
    return () => { alive = false; autosave.current?.stop(); };
  }, [port, loadNonce]); // Reload restarts the load; t/delay/timers must not reset a draft.
}

function useConsentEditorState(
  { t, delayMs, timers }:
    Pick<Parameters<typeof useConsentPage>[0], "t"> &
    Pick<NonNullable<Parameters<typeof useConsentPage>[1]>, "delayMs" | "timers">
) {
  const [loadNonce, setLoadNonce] = useState(0);
  const [snapshot, setSnapshot] = useState<ConsentSettingsSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState<ConsentSettingsView | null>(null);
  const [heads, setHeads] = useState<Heads>({ draftId: null, publishedId: null });
  const [problems, setProblems] = useState<ConsentFieldProblem[]>([]);
  const [saveState, setSaveState] = useState<ConsentSaveState>('idle');
  const [settled, setSettled] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [publishedCount, setPublishedCount] = useState(0);
  const valueRef = useRef<ConsentSettingsView | null>(null);
  const autosave = useRef<ConsentAutosave | null>(null);
  const currentLoadNonce = useRef(loadNonce);
  currentLoadNonce.current = loadNonce;
  const loadInputs = useRef({ t, delayMs, timers });
  loadInputs.current = { t, delayMs, timers };
  return {
    loadNonce, setLoadNonce, snapshot, setSnapshot, loadError, setLoadError, value, setValue, heads, setHeads, problems, setProblems, saveState, setSaveState,
    settled, setSettled, saveError, setSaveError, publishing, setPublishing, publishError, setPublishError, liveEnabled, setLiveEnabled, publishedCount,
    setPublishedCount, valueRef, autosave, currentLoadNonce, loadInputs,
  };
}

export interface ConsentPreviewState {
  html: string | null;
  problems: ConsentFieldProblem[];
  warnings: ConsentFieldProblem[];
  error: string | null;
}

/** The real renderer's gated page for the current (unsaved) settings, debounced; a response that
 * arrives after a newer request was sent is dropped. CSS warnings travel with the preview, never
 * into the saved draft's publish blockers. @complexity O(1) requests per settle. */
export function useConsentPreview({ port, config, t }: { port: ConsentRevisionsPort; config: ConsentSettingsView | null; t: Translate }, { delayMs = 500 }: { delayMs?: number } = {}): ConsentPreviewState {
  const [state, setState] = useState<ConsentPreviewState>({ html: null, problems: [], warnings: [], error: null });
  const sequence = useRef(0);
  const translator = useRef(t);
  translator.current = t;
  useEffect(() => {
    if (!config) return undefined;
    const t = translator.current;
    sequence.current += 1;
    const ticket = sequence.current;
    const timer = setTimeout(() => {
      port.preview({ config }).then(
        result => { if (ticket === sequence.current) setState({ html: result.html, problems: result.blockingProblems, warnings: result.warnings ?? [], error: null }); },
        error => { if (ticket === sequence.current) setState(withPreviewError({ error: describeApiError({ e: error, fallback: t("Couldn't render the preview.") }) })); },
      );
    }, delayMs);
    return () => clearTimeout(timer);
  }, [port, config, delayMs]); // Translation changes do not restart the pending preview.
  return state;
}

/** Tracks the preview pane's width as the scale that fits a desktop-width page into it, so the
 * Desktop preview shows the banner's desktop layout. Without ResizeObserver (tests) it stays 1.
 * @complexity O(1) per resize. */
export function useConsentPreviewScale(_required: Record<string, never> = {}, _optional = {}): { ref: (node: HTMLElement | null) => void; scale: number } {
  const [scale, setScale] = useState(1);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(entries => setScale(consentPreviewScale({ paneWidth: entries[0]?.contentRect.width ?? 0 })));
    observer.current.observe(node);
  }, []);
  return { ref, scale };
}

/** Readiness for Overview: the server checks the draft (else the live settings) as if it were on.
 * Reloads whenever `refresh` changes. */
export function useConsentReadiness({ port, refresh, t }: { port: ConsentRevisionsPort; refresh: string; t: Translate }, _optional = {}): { readiness: ConsentReadiness | null; error: string | null } {
  const [state, setState] = useState<{ readiness: ConsentReadiness | null; error: string | null }>({ readiness: null, error: null });
  const translator = useRef(t);
  translator.current = t;
  const currentRefresh = useRef(refresh);
  currentRefresh.current = refresh;
  useEffect(() => {
    const t = translator.current;
    let alive = true;
    port.readiness({}).then(
      readiness => { if (alive && currentRefresh.current === refresh) setState({ readiness, error: null }); },
      error => { if (alive && currentRefresh.current === refresh) setState({ readiness: null, error: describeApiError({ e: error, fallback: t("Couldn't check readiness.") }) }); },
    );
    return () => { alive = false; };
  }, [port, refresh]); // Refresh triggers the read; translation changes must not restart it.
  return state;
}

/** Preserve omitted autosave options so the autosave owner supplies its browser defaults. */
function consentAutosaveOptions({ delayMs, timers }: { delayMs: number | undefined; timers: ConsentTimers | undefined }) {
  return { ...(delayMs === undefined ? {} : { delayMs }), ...(timers ? { timers } : {}) };
}
