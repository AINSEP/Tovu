/**
 * @file Live site views: how many open project tabs keep a running `<webview>` guest at once.
 *
 * Every guest is a whole Chromium renderer process plus the site's admin bundle, so ten open tabs
 * used to mean ten of them, nine hidden. The limit (Settings menu "Live site views", default 2) is
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

export const DEFAULT_LIVE_VIEW_LIMIT = 2;
/** How long a hidden guest gets to answer the probe before it is kept as it is. */
export const RELEASE_PROBE_TIMEOUT_MS = 2000;
/** The admin's own scroll container (`.admin-content`, apps/admin `styles.css`): its window never
 *  scrolls, so `window.scrollY` alone would restore every admin page to the top. */
const INNER_SCROLLER = '.admin-content';

/** What a released guest leaves behind for its next mount: where it was, and how far scrolled. */
export interface ParkedView {
  readonly url: string;
  readonly x: number;
  readonly y: number;
  readonly innerY: number;
}

export type LiveGuest = Pick<HTMLWebViewElement, 'executeJavaScript'>;
export type ScrollGuest = Pick<HTMLWebViewElement, 'executeJavaScript' | 'addEventListener' | 'removeEventListener'>;

export interface ReleaseAnswer {
  readonly release: boolean;
  /** `null` when there was nothing worth restoring (no guest, or an error page). */
  readonly parked: ParkedView | null;
}

const KEEP: ReleaseAnswer = { release: false, parked: null };

/**
 * Runs in the GUEST, as a string: never built from a function's `toString()`, because a bundler's
 * helpers (esbuild's `__name`, say) would land inside it and throw in a page that has none.
 * `BeforeUnloadEvent` rather than a plain `Event` so a guard that only sets `returnValue` (or an
 * `onbeforeunload` that returns a string) counts as a veto too; the plain event is the fallback.
 */
export const RELEASE_PROBE = `(() => {
  try {
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

/** A positive whole number from the bridge, or the default for anything else. */
export function liveViewLimit({ value }: { value: unknown }, _options = {}): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : DEFAULT_LIVE_VIEW_LIMIT;
}

/**
 * The live tabs, most recently focused first: the focused tab leads, closed tabs drop out.
 * @complexity O(n²) over open tabs, which number in the tens.
 */
export function liveViewOrder({ order, focusedId, openIds }: {
  order: readonly string[];
  focusedId: string | null;
  openIds: readonly string[];
}, _options = {}): string[] {
  const open = new Set(openIds);
  const next = focusedId !== null && open.has(focusedId) ? [focusedId] : [];
  for (const id of order) if (open.has(id) && !next.includes(id)) next.push(id);
  return next;
}

/** Hidden live tabs to offer for release, least recently focused first, and how many must go. */
export function releaseCandidates({ order, focusedId, limit }: {
  order: readonly string[];
  focusedId: string | null;
  limit: number;
}, _options = {}): { candidates: string[]; excess: number } {
  const excess = order.length - limit;
  if (excess <= 0) return { candidates: [], excess: 0 };
  return { candidates: order.filter((id) => id !== focusedId).reverse(), excess };
}

function finite({ value }: { value: unknown }, _options = {}): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function webUrl({ value }: { value: unknown }, _options = {}): string | null {
  if (typeof value !== 'string') return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:' ? value : null;
  } catch { return null; }
}

/** Reads the guest's answer. Anything but an explicit `release: true` keeps the guest. */
export function parseReleaseProbe({ value }: { value: unknown }, _options = {}): ReleaseAnswer {
  if (typeof value !== 'object' || value === null) return KEEP;
  const answer = value as Record<string, unknown>;
  if (answer.release !== true) return KEEP;
  const url = webUrl({ value: answer.url });
  const parked = url === null ? null : { url, x: finite({ value: answer.x }), y: finite({ value: answer.y }), innerY: finite({ value: answer.innerY }) };
  return { release: true, parked };
}

/**
 * Asks one hidden guest whether it may go. A tab with no guest (its site stopped or failed) has
 * nothing to lose and is released at once.
 */
export async function probeRelease(
  { guest }: { guest: LiveGuest | null },
  { timeoutMs = RELEASE_PROBE_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<ReleaseAnswer> {
  if (guest === null) return { release: true, parked: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<unknown>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
  try {
    // Electron throws synchronously from a guest that is not attached yet; the `catch` keeps it.
    return parseReleaseProbe({ value: await Promise.race([guest.executeJavaScript(RELEASE_PROBE), timeout]) });
  } catch {
    return KEEP;
  } finally {
    clearTimeout(timer);
  }
}

/** Probes candidates in order until `excess` of them agreed; a veto just moves on to the next. */
export async function releaseExcessViews({ candidates, excess, guestOf }: {
  candidates: readonly string[];
  excess: number;
  guestOf: (id: string) => LiveGuest | null;
}, { timeoutMs }: { timeoutMs?: number } = {}): Promise<{ id: string; parked: ParkedView | null }[]> {
  const released: { id: string; parked: ParkedView | null }[] = [];
  for (const id of candidates) {
    if (released.length >= excess) break;
    const answer = await probeRelease({ guest: guestOf(id) }, { timeoutMs });
    if (answer.release) released.push({ id, parked: answer.parked });
  }
  return released;
}

/** The guest script that puts a restored page's scroll back. Numbers only, so nothing is injected.
 *  It retries for ~3 s because the admin renders its list after its own data arrives. */
export function scrollScript({ parked }: { parked: ParkedView }, _options = {}): string {
  const x = finite({ value: parked.x });
  const y = finite({ value: parked.y });
  const innerY = finite({ value: parked.innerY });
  return `(() => {
  let tries = 0;
  const step = () => {
    const inner = document.querySelector(${JSON.stringify(INNER_SCROLLER)});
    window.scrollTo(${x}, ${y});
    if (inner) inner.scrollTop = ${innerY};
    const done = window.scrollY >= ${y} - 1 && (${innerY} === 0 || (inner !== null && inner.scrollTop >= ${innerY} - 1));
    if (!done && ++tries < 30) setTimeout(step, 100);
  };
  step();
})()`;
}

/**
 * Once a restored guest's first load finishes, puts its scroll back. Once per guest: a later reload
 * is the operator's own and starts wherever the page does.
 * @returns the teardown, or `undefined` when there is nothing to restore.
 */
export function restoreParkedScroll({ guest, parked }: {
  guest: ScrollGuest | null;
  parked: ParkedView | undefined;
}, _options = {}): (() => void) | undefined {
  if (guest === null || parked === undefined) return undefined;
  const target: ScrollGuest = guest;
  const script = scrollScript({ parked });
  const onLoad = () => {
    detach();
    try { void target.executeJavaScript(script).catch(() => undefined); } catch { /* Guest gone. */ }
  };
  const detach = () => { try { target.removeEventListener('did-finish-load', onLoad); } catch { /* Guest already gone. */ } };
  try { target.addEventListener('did-finish-load', onLoad); } catch { return undefined; }
  return detach;
}

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

/** The menu's limit, read once and then followed. An older preload leaves the default. */
function useLiveViewLimit({ getBridge }: { getBridge: () => RunnerInventoryBridge | undefined }, _options = {}): number {
  const [limit, setLimit] = useState(DEFAULT_LIVE_VIEW_LIMIT);
  useEffect(() => {
    const bridge = getBridge();
    let changed = false;
    let active = true;
    void bridge?.getMaximumLiveSiteViews?.().then(
      (value) => { if (active && !changed) setLimit(liveViewLimit({ value })); },
      () => undefined,
    );
    const off = bridge?.onMaximumLiveSiteViewsChanged?.((value) => { changed = true; setLimit(liveViewLimit({ value })); });
    return () => { active = false; off?.(); };
  }, [getBridge]);
  return limit;
}

export interface LiveViews {
  /** Whether this tab may mount its guest: the focused tab always may. */
  isLive: (id: string) => boolean;
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
  const limit = useLiveViewLimit({ getBridge });
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
    void releaseExcessViews({ candidates, excess, guestOf: (id) => guests.current.get(id) ?? null }, { timeoutMs }).then((released) => {
      if (active) setState((current) => applyReleases({ state: current, released }));
    });
    return () => { active = false; };
  }, [orderKey, focusedId, limit, timeoutMs]);

  return { isLive: (id) => order.includes(id), parked: state.parked, registerGuest };
}
