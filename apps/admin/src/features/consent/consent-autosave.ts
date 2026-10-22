import type { ConsentSettingsView } from '@jini-ai/admin/consent/react';
import { isConsentConflict } from './rules';
import type { ConsentDraftSaved, ConsentRevisionsPort } from './settings.hooks';

/**
 * @file Serialized, debounced draft autosave. One PUT at a time, each carrying the draft id the
 * previous one returned, always sending the newest edits. A 409 means another editor (or the
 * assistant) saved in between: autosave stops for good and never retries over their work; the page
 * asks the owner to reload instead.
 */

export interface ConsentAutosaveEvents {
  onSaving(): void;
  /** `settled` is false when newer edits are already waiting to be saved after this one. */
  onSaved(required: { result: ConsentDraftSaved; settled: boolean }): void;
  onConflict(): void;
  onError(required: { error: unknown }): void;
}

export interface ConsentTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ConsentAutosave {
  change(required: { config: ConsentSettingsView }): void;
  /** Saves queued edits now; resolves after this save (and any edits queued behind it) settles. */
  flush(): Promise<void>;
  stop(): void;
  draftId(): string | null;
}

const browserTimers: ConsentTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** @complexity O(1) per edit; at most one request in flight and one queued. */
export function createConsentAutosave(
  { port, draftId, events }: { port: Pick<ConsentRevisionsPort, 'saveDraft'>; draftId: string | null; events: ConsentAutosaveEvents },
  { delayMs = 800, timers = browserTimers }: { delayMs?: number; timers?: ConsentTimers } = {},
): ConsentAutosave {
  let latest: ConsentSettingsView | null = null;
  let lastDraftId = draftId;
  let timer: unknown = null;
  let running: Promise<void> | null = null;
  let queued = false;
  let stopped = false;

  /** One PUT; edits that arrived meanwhile are saved right after it, with its new draft id. */
  async function saveOnce(): Promise<void> {
    queued = false;
    const config = latest!;
    events.onSaving();
    try {
      const result = await port.saveDraft({ config, expectedDraftId: lastDraftId });
      lastDraftId = result.revision.id;
      events.onSaved({ result, settled: !queued && timer === null });
    } catch (error) {
      if (isConsentConflict({ error })) { stopped = true; events.onConflict(); return; }
      events.onError({ error });
    }
    if (queued && !stopped) await saveOnce();
  }

  function flush(): Promise<void> {
    timers.clearTimeout(timer);
    timer = null;
    if (stopped || latest === null) return Promise.resolve();
    if (running) { queued = true; return running; }
    running = saveOnce().finally(() => { running = null; });
    return running;
  }

  return {
    change({ config }) {
      if (stopped) return;
      latest = config;
      timers.clearTimeout(timer);
      timer = timers.setTimeout(() => { void flush(); }, delayMs);
    },
    flush,
    stop() { stopped = true; timers.clearTimeout(timer); },
    draftId: () => lastDraftId,
  };
}
