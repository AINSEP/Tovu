import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api';
import type { ConsentTimers } from '../consent-autosave';
import type { ConsentDraftSaved, ConsentPreview, ConsentReadiness, ConsentRevisionsPort, ConsentSettingsSnapshot } from '../settings.hooks';
import { useConsentPage, useConsentPreview, useConsentPreviewScale, useConsentReadiness } from '../use-consent-page.hooks';
import { CONSENT_CONFIG, conflict, consentSnapshot, fakeConsentPort, revision, saved } from './consent-fixtures';

/** @file The Cookie Consent controller: load, draft autosave, the 409 stop, and Publish. */

const t = (key: string) => key;

/** Autosave timers the test fires by hand. */
function manualTimers() {
  let next: (() => void) | null = null;
  const timers: ConsentTimers = { setTimeout: callback => { next = callback; return callback; }, clearTimeout: handle => { if (handle === next) next = null; } };
  return { timers, fire: () => { const callback = next; next = null; callback?.(); } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const withDraft = consentSnapshot({ draft: revision('d1'), published: revision('p1', { ...CONSENT_CONFIG, enabled: false }) });

async function mountPage(port: ConsentRevisionsPort) {
  const { timers, fire } = manualTimers();
  const hook = renderHook(() => useConsentPage({ port, t }, { delayMs: 5, timers }));
  await waitFor(() => expect(hook.result.current.value).not.toBeNull());
  return { ...hook, fire };
}

/** Edits the title and lets the debounced save run to completion. */
async function editAndSave(page: Awaited<ReturnType<typeof mountPage>>, title = 'New title') {
  act(() => page.result.current.onChange({ patch: { title } }));
  await act(async () => { page.fire(); });
}

describe('useConsentPage: load', () => {
  it('edits the draft when there is one and reports what is live', async () => {
    const page = await mountPage(fakeConsentPort({ get: () => Promise.resolve(withDraft) }));
    expect(page.result.current).toMatchObject({
      value: CONSENT_CONFIG, draftId: 'd1', hasUnpublished: true, everPublished: true, liveEnabled: false,
      saveState: 'idle', loadError: null, editor: withDraft.editor, canPublish: true, publishedCount: 0,
    });
  });

  it('starts from the live settings before the first draft, with nothing to publish', async () => {
    const page = await mountPage(fakeConsentPort());
    expect(page.result.current).toMatchObject({ value: { ...CONSENT_CONFIG, enabled: false }, draftId: null, hasUnpublished: false, everPublished: false, canPublish: false });
  });

  it('shows the load error', async () => {
    const port = fakeConsentPort({ get: () => Promise.reject(new ApiError('', 503)) });
    const { result } = renderHook(() => useConsentPage({ port, t }));
    await waitFor(() => expect(result.current.loadError).toBe("Couldn't load cookie consent."));
    expect(result.current.value).toBeNull();
  });

  it('ignores a load that settles after unmount', async () => {
    const ok = deferred<ConsentSettingsSnapshot>();
    const failed = deferred<ConsentSettingsSnapshot>();
    const okPort = fakeConsentPort({ get: () => ok.promise });
    const failedPort = fakeConsentPort({ get: () => failed.promise });
    const first = renderHook(() => useConsentPage({ port: okPort, t }));
    const second = renderHook(() => useConsentPage({ port: failedPort, t }));
    first.unmount();
    second.unmount();
    await act(async () => { ok.resolve(withDraft); failed.reject(new Error('gone')); });
    expect(first.result.current.value).toBeNull();
    expect(second.result.current.loadError).toBeNull();
  });

  it('ignores edits before the settings have loaded', () => {
    const port = fakeConsentPort({ get: () => new Promise<ConsentSettingsSnapshot>(() => {}) });
    const { result } = renderHook(() => useConsentPage({ port, t }));
    act(() => result.current.onChange({ patch: { title: 'Early' } }));
    expect(result.current.value).toBeNull();
  });

  it('reload fetches the revisions again', async () => {
    const get = vi.fn(() => Promise.resolve(withDraft));
    const page = await mountPage(fakeConsentPort({ get }));
    act(() => page.result.current.reload());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

describe('useConsentPage: autosave', () => {
  it('saves edits as a draft carrying the last draft id; Publish waits for the save to settle', async () => {
    const save = deferred<ConsentDraftSaved>();
    const saveDraft = vi.fn(() => save.promise);
    const page = await mountPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), saveDraft }));
    act(() => page.result.current.onChange({ patch: { title: 'New title' } }));
    expect(page.result.current.value?.title).toBe('New title');
    expect(page.result.current.canPublish).toBe(false);
    act(() => page.fire());
    expect(page.result.current.saveState).toBe('saving');
    expect(saveDraft).toHaveBeenCalledWith({ config: { ...CONSENT_CONFIG, title: 'New title' }, expectedDraftId: 'd1' });
    await act(async () => { save.resolve(saved('d2')); });
    expect(page.result.current).toMatchObject({ saveState: 'saved', draftId: 'd2', hasUnpublished: true, canPublish: true });
  });

  it("keeps Publish off while the saved draft has problems", async () => {
    const problems = [{ field: 'customCss', code: 'CSS_UNSAFE', message: 'Unsafe CSS.' }];
    const page = await mountPage(fakeConsentPort({ saveDraft: () => Promise.resolve(saved('d2', problems)) }));
    await editAndSave(page);
    expect(page.result.current.problems).toEqual(problems);
    expect(page.result.current.canPublish).toBe(false);
  });

  it('stops on a 409 and never saves over the other edit', async () => {
    const saveDraft = vi.fn(() => Promise.reject(conflict()));
    const page = await mountPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), saveDraft }));
    await editAndSave(page);
    expect(page.result.current.saveState).toBe('conflict');
    expect(page.result.current.canPublish).toBe(false);
    act(() => page.result.current.onChange({ patch: { title: 'Again' } }));
    act(() => page.fire());
    expect(page.result.current.value?.title).toBe('New title');
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps the edits and shows the error when a save fails', async () => {
    const page = await mountPage(fakeConsentPort({ saveDraft: () => Promise.reject(new ApiError('Disk full.', 500)) }));
    await editAndSave(page);
    expect(page.result.current).toMatchObject({ saveState: 'error', saveError: 'Disk full.', value: { title: 'New title' } });
  });
});

describe('useConsentPage: publish', () => {
  it('publishes the saved draft against the live revision it was edited on', async () => {
    const publish = vi.fn(() => Promise.resolve({ published: true as const, revisionId: 'd2' }));
    const page = await mountPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), saveDraft: () => Promise.resolve(saved('d2')), publish }));
    await editAndSave(page);
    await act(async () => { await page.result.current.publish(); });
    expect(publish).toHaveBeenCalledWith({ draftId: 'd2', expectedPublishedId: 'p1' });
    expect(page.result.current).toMatchObject({ hasUnpublished: false, everPublished: true, liveEnabled: true, publishedCount: 1, publishing: false, canPublish: false });
  });

  it('publishes the first draft against no live revision', async () => {
    const publish = vi.fn(() => Promise.resolve({ published: true as const, revisionId: 'd1' }));
    const page = await mountPage(fakeConsentPort({ get: () => Promise.resolve(consentSnapshot({ draft: revision('d1') })), publish }));
    await act(async () => { await page.result.current.publish(); });
    expect(publish).toHaveBeenCalledWith({ draftId: 'd1', expectedPublishedId: null });
  });

  it('does nothing while there is nothing to publish', async () => {
    const publish = vi.fn();
    const page = await mountPage(fakeConsentPort({ publish }));
    await act(async () => { await page.result.current.publish(); });
    expect(publish).not.toHaveBeenCalled();
  });

  it('turns a stale publish (409) into the reload notice and stops autosave', async () => {
    const saveDraft = vi.fn(() => Promise.resolve(saved('d2')));
    const page = await mountPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), saveDraft, publish: () => Promise.reject(conflict()) }));
    await act(async () => { await page.result.current.publish(); });
    expect(page.result.current).toMatchObject({ saveState: 'conflict', publishError: null, publishing: false });
    act(() => page.result.current.onChange({ patch: { title: 'Again' } }));
    act(() => page.fire());
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('shows any other publish error and keeps the draft', async () => {
    const page = await mountPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), publish: () => Promise.reject(new ApiError('', 503)) }));
    await act(async () => { await page.result.current.publish(); });
    expect(page.result.current).toMatchObject({ publishError: "Couldn't publish.", hasUnpublished: true, saveState: 'idle' });
  });
});

describe('useConsentPreview', () => {
  const preview = (html: string): ConsentPreview => ({ html, blockingProblems: [], revisionId: null });

  it('renders nothing until there is a config', () => {
    const port = fakeConsentPort({ preview: vi.fn() });
    const { result } = renderHook(() => useConsentPreview({ port, config: null, t }));
    expect(result.current).toEqual({ html: null, problems: [], error: null });
    expect(port.preview).not.toHaveBeenCalled();
  });

  it('drops a response that arrives after a newer request was sent', async () => {
    const responses = [deferred<ConsentPreview>(), deferred<ConsentPreview>()];
    let call = 0;
    const port = fakeConsentPort({ preview: () => responses[call++]!.promise });
    const { result, rerender } = renderHook(({ config }) => useConsentPreview({ port, config, t }, { delayMs: 0 }), { initialProps: { config: CONSENT_CONFIG } });
    await waitFor(() => expect(call).toBe(1));
    rerender({ config: { ...CONSENT_CONFIG, title: 'Newer' } });
    await waitFor(() => expect(call).toBe(2));
    await act(async () => { responses[0]!.resolve(preview('<p>old</p>')); });
    expect(result.current.html).toBeNull();
    await act(async () => { responses[1]!.resolve(preview('<p>new</p>')); });
    expect(result.current.html).toBe('<p>new</p>');
  });

  it('keeps the last preview and reports a render failure', async () => {
    let fail = false;
    const port = fakeConsentPort({ preview: () => fail ? Promise.reject(new ApiError('', 500)) : Promise.resolve(preview('<p>ok</p>')) });
    const { result, rerender } = renderHook(({ config }) => useConsentPreview({ port, config, t }, { delayMs: 0 }), { initialProps: { config: CONSENT_CONFIG } });
    await waitFor(() => expect(result.current.html).toBe('<p>ok</p>'));
    fail = true;
    rerender({ config: { ...CONSENT_CONFIG, title: 'Broken' } });
    await waitFor(() => expect(result.current.error).toBe("Couldn't render the preview."));
    expect(result.current.html).toBe('<p>ok</p>');
  });

  it('drops a failure that arrives after a newer request was sent', async () => {
    const responses = [deferred<ConsentPreview>(), deferred<ConsentPreview>()];
    let call = 0;
    const port = fakeConsentPort({ preview: () => responses[call++]!.promise });
    const { result, rerender } = renderHook(({ config }) => useConsentPreview({ port, config, t }, { delayMs: 0 }), { initialProps: { config: CONSENT_CONFIG } });
    await waitFor(() => expect(call).toBe(1));
    rerender({ config: { ...CONSENT_CONFIG, title: 'Newer' } });
    await waitFor(() => expect(call).toBe(2));
    await act(async () => { responses[0]!.reject(new Error('late')); });
    expect(result.current.error).toBeNull();
  });

  it('waits half a second by default', async () => {
    vi.useFakeTimers();
    try {
      const port = fakeConsentPort({ preview: vi.fn(() => Promise.resolve(preview('<p>x</p>'))) });
      renderHook(() => useConsentPreview({ port, config: CONSENT_CONFIG, t }));
      act(() => { vi.advanceTimersByTime(499); });
      expect(port.preview).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1); });
      expect(port.preview).toHaveBeenCalledWith({ config: CONSENT_CONFIG });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useConsentReadiness', () => {
  const ready: ConsentReadiness = { ready: true, enabled: false, blockingProblems: [], detected: [], truncated: false, limitations: [] };

  it('loads readiness and reloads when `refresh` changes', async () => {
    const readiness = vi.fn(() => Promise.resolve(ready));
    const port = fakeConsentPort({ readiness });
    const { result, rerender } = renderHook(({ refresh }) => useConsentReadiness({ port, refresh, t }), { initialProps: { refresh: '0:' } });
    await waitFor(() => expect(result.current).toEqual({ readiness: ready, error: null }));
    rerender({ refresh: '1:' });
    await waitFor(() => expect(readiness).toHaveBeenCalledTimes(2));
  });

  it('reports a failed check', async () => {
    const port = fakeConsentPort({ readiness: () => Promise.reject(new ApiError('', 503)) });
    const { result } = renderHook(() => useConsentReadiness({ port, refresh: '', t }));
    await waitFor(() => expect(result.current).toEqual({ readiness: null, error: "Couldn't check readiness." }));
  });

  it('ignores a check that settles after unmount', async () => {
    const ok = deferred<ConsentReadiness>();
    const failed = deferred<ConsentReadiness>();
    const okPort = fakeConsentPort({ readiness: () => ok.promise });
    const failedPort = fakeConsentPort({ readiness: () => failed.promise });
    const first = renderHook(() => useConsentReadiness({ port: okPort, refresh: '', t }));
    const second = renderHook(() => useConsentReadiness({ port: failedPort, refresh: '', t }));
    first.unmount();
    second.unmount();
    await act(async () => { ok.resolve(ready); failed.reject(new Error('gone')); });
    expect(first.result.current.readiness).toBeNull();
    expect(second.result.current.error).toBeNull();
  });
});

describe('useConsentPreviewScale', () => {
  it('fits the desktop-width page to the observed pane, and stops observing a detached pane', () => {
    let notify: ((entries: { contentRect: { width: number } }[]) => void) | null = null;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('ResizeObserver', class { constructor(callback: typeof notify) { notify = callback; } observe = observe; disconnect = disconnect; });
    try {
      const { result } = renderHook(() => useConsentPreviewScale());
      expect(result.current.scale).toBe(1);
      const pane = document.createElement('div');
      act(() => result.current.ref(pane));
      expect(observe).toHaveBeenCalledWith(pane);
      act(() => notify!([{ contentRect: { width: 512 } }]));
      expect(result.current.scale).toBe(0.5);
      act(() => notify!([]));
      expect(result.current.scale).toBe(1);
      act(() => result.current.ref(null));
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the natural size where ResizeObserver does not exist', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    try {
      const { result } = renderHook(() => useConsentPreviewScale());
      act(() => result.current.ref(document.createElement('div')));
      expect(result.current.scale).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
