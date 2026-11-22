/**
 * @file Live site views: how many open project tabs keep a running `<webview>` guest at once.
 *
 * Every guest is a whole Chromium renderer process plus the site's admin bundle, so ten open tabs
 * used to mean ten of them, nine hidden. The limit (Settings "Loaded sites", 1–5, default 1) is
 * SOFT: the tab on screen always mounts its guest, and only then does this hook look for a hidden
 * one to release, least recently focused first. A guest is released only when it agrees to be.
 *
 * **The release probe.** `webview.executeJavaScript` dispatches a cancelable `beforeunload` and a
 * cancelable `jini:release-check` on the guest's `window`, then reads whether either was prevented.
 * `beforeunload` is what every editor's dirty guard (`useDirtyGuard`) already answers, so a post
 * with unsaved edits keeps its guest without any new code; `jini:release-check` is the composer's
 * and chat pane's own event (flush the draft, veto during an upload, unresolved send or running
 * reply) and the admin's route allowlist. Neither is prevented → the guest's route and scroll come
 * back in the same answer and the guest is unmounted. A guest that throws, rejects or never
 * answers is KEPT: a release is optional, discarding someone's work is not.
 *
 * If every hidden guest vetoes, the shell simply stays over the limit; the next focus change, tab
 * close or limit change tries again. There is no queue, no reservation and no polling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import { useSiteViewPreference } from './use-site-view-preference.hooks.js';
import { liveViewOrder, releaseCandidates, releaseExcessViews, RELEASE_PROBE_TIMEOUT_MS, type ParkedView, type LiveGuest } from '@jini-ai/ui/core';

/** The admin's own scroll container (`.admin-content`, apps/admin `styles.css`): its window never
 *  scrolls, so `window.scrollY` alone would restore every admin page to the top. */
export const INNER_SCROLLER = '.admin-content';

/**
 * Runs in the GUEST, as a string: never built from a function's `toString()`, because a bundler's
 * helpers (esbuild's `__name`, say) would land inside it and throw in a page that has none.
 * `BeforeUnloadEvent` rather than a plain `Event` so a guard that only sets `returnValue` (or an
 * `onbeforeunload` that returns a string) counts as a veto too; the plain event is the fallback.
 */
export const RELEASE_PROBE = `(() => {
  try {
    // Only the admin has audited release guards. Public forms and embedded widgets can own
    // unsaved state without listeners, so absence of a veto there is not consent to destruction.
    if (!/^\\/admin(?:\\/|$)/.test(window.location.pathname)) return { release: false };
    let unload;
    try { unload = document.createEvent('BeforeUnloadEvent'); unload.initEvent('beforeunload', false, true); }
    catch { unload = new window.Event('beforeunload', { cancelable: true }); }
    window.dispatchEvent(unload);
    const check = new window.CustomEvent('jini:release-check', { cancelable: true });
    window.dispatchEvent(check);
    const prompted = typeof unload.returnValue === 'string' && unload.returnValue !== '';
    const kept = unload.defaultPrevented || prompted || check.defaultPrevented;
    const inner = document.querySelector(${JSON.stringify(INNER_SCROLLER)});
    return { release: !kept, url: window.location.href, x: window.scrollX, y: window.scrollY, innerY: inner ? inner.scrollTop : 0 };
  } catch { return { release: false }; }
})()`;

interface LiveViewsState {
  /** Live tabs, most recently focused first. */
  readonly order: readonly string[];
  readonly parked: Readonly<Record<string, ParkedView>>;
}

function sameIds({ a, b }: { a: readonly string[]; b: readonly string[] }, _options = {}): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Records a focus change and drops closed tabs, parked routes included; the same state if neither. */
function syncLiveViews({ state, focusedId, openIds }: { state: LiveViewsState; focusedId: string | null; openIds: readonly string[] }, _options = {}): LiveViewsState {
  const order = liveViewOrder({ order: state.order, focusedId, openIds });
  const open = new Set(openIds);
  const stale = Object.keys(state.parked).filter((id) => !open.has(id));
  if (sameIds({ a: order, b: state.order }) && stale.length === 0) return state;
  const parked = Object.fromEntries(Object.entries(state.parked).filter(([id]) => open.has(id)));
  return { order, parked };
}

function applyReleases({ state, released }: { state: LiveViewsState; released: readonly { id: string; parked: ParkedView | null }[] }, _options = {}): LiveViewsState {
  if (released.length === 0) return state;
  const gone = new Set(released.map(({ id }) => id));
  const parked = { ...state.parked };
  // No guest, no route: keep whatever an earlier release recorded rather than forgetting it.
  for (const entry of released) if (entry.parked !== null) parked[entry.id] = entry.parked;
  return { order: state.order.filter((id) => !gone.has(id)), parked };
}

export interface LiveViews {
  /** Whether this tab may mount its guest: the focused tab always may. */
  isLive: (input: { id: string }) => boolean;
  /** Each released tab's last route and scroll, for its next mount. */
  parked: Readonly<Record<string, ParkedView>>;
  /** The guest each tab mounted, so a probe can reach it. Stable across renders. */
  registerGuest: (id: string, node: LiveGuest | null) => void;
}

/**
 * Owns which open tabs keep their guest. `focusedId` is the tab on screen, `null` outside Websites
 * (every tab hidden, the last one focused still the most recent).
 */
export function useLiveViews({ openIds, focusedId }: { openIds: readonly string[]; focusedId: string | null }, {
  getBridge = runnerInventoryBridge,
  timeoutMs = RELEASE_PROBE_TIMEOUT_MS,
}: { getBridge?: () => RunnerInventoryBridge | undefined; timeoutMs?: number } = {}): LiveViews {
  const [state, setState] = useState<LiveViewsState>({ order: [], parked: {} });
  const { value: limit } = useSiteViewPreference({ getBridge });
  const guests = useRef(new Map<string, LiveGuest>());
  const registerGuest = useCallback((id: string, node: LiveGuest | null) => {
    if (node === null) guests.current.delete(id);
    else guests.current.set(id, node);
  }, []);
  // Keys, not arrays: the site list is a new array on every poll, and that alone is no change.
  const openKey = JSON.stringify(openIds);
  const order = liveViewOrder({ order: state.order, focusedId, openIds });
  const orderKey = JSON.stringify(order);

  useEffect(() => {
    const ids = JSON.parse(openKey) as string[];
    setState((current) => syncLiveViews({ state: current, focusedId, openIds: ids }));
  }, [focusedId, openKey]);

  useEffect(() => {
    // A newer focus, close or limit cancels this pass; its answers would be about a stale order.
    let active = true;
    const { candidates, excess } = releaseCandidates({ order: JSON.parse(orderKey) as string[], focusedId, limit });
    if (excess === 0) return undefined;
    void releaseExcessViews({ candidates, excess, script: RELEASE_PROBE, guestOf: ({ id }) => guests.current.get(id) ?? null }, { timeoutMs }).then((released) => {
      if (active) setState((current) => applyReleases({ state: current, released }));
    });
    return () => { active = false; };
  }, [orderKey, focusedId, limit, timeoutMs]);

  return { isLive: ({ id }) => order.includes(id), parked: state.parked, registerGuest };
}
