/**
 * @file The sites home window's Zoom In / Zoom Out / Actual Size (Cmd+Plus / Cmd+- / Cmd+0):
 * routing a command to whichever surface is actually on screen, and remembering a project tab's own
 * zoom level across reloads and relaunches.
 *
 * **Two different targets, same split `use-find-in-page.hooks.ts` documents at length for Find.**
 * When a project tab is the visible surface, its `<webview>` guest is the target — Electron's
 * `WebviewTag` exposes `getZoomLevel`/`setZoomLevel` directly on that DOM element, no IPC needed.
 * When the Projects screen itself is on screen, the target is the window's OWN top-level page,
 * reached through {@link ZoomBridge}'s `getZoomLevel`/`setZoomLevel` — synchronous calls into the
 * preload's own `webFrame`, not a main-process round trip (see the preload's own doc on why that
 * target needs no IPC here, unlike Find's). {@link resolveZoomTarget} is the one place that decides
 * which.
 *
 * **Per-site zoom persists in `localStorage`, keyed by project id.** A `<webview>`'s own zoom level
 * lives on its Chromium WebContents instance, which `key={workspace.reloadNonce}` (`App.tsx`)
 * discards and recreates on every recovery reload — so without this, a remembered zoom would reset
 * the moment a stalled site guest gets rebuilt, let alone across an app relaunch. `localStorage` is
 * the sites home window's OWN per-origin storage (a stable `file://` origin — `main.ts`'s
 * `openSitesHomeWindow` loads it via `loadFile`), so no new main-process store or IPC channel earns
 * its cost for ten bytes per site; {@link registerGuest} re-applies the stored level every time a
 * guest (re)registers, which covers both a tab switch back to an already-zoomed guest and a fresh
 * WebContents after a recovery reload — waiting on that guest's `dom-ready` when it is not attached
 * yet, since a ref callback fires at attach and every `<webview>` method throws until then
 * ({@link applyStoredZoom}). The window's own top-level zoom is deliberately NOT
 * persisted — it is shell chrome, not site content, and always starting a fresh session at 100% is
 * the same convention Chrome itself follows for its own UI zoom.
 */
import { useCallback, useEffect, useRef } from 'react';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import type { ZoomDirection } from '../contracts/zoom.js';

/** The slice of Electron's `<webview>` this file drives. A fake of it is what tests pass.
 *
 *  The two listener methods are spelled out for `'dom-ready'` alone rather than `Pick`ed like the
 *  rest: `HTMLWebViewElement`'s `addEventListener` is an OVERLOAD SET covering every webview event
 *  (`electron-webview.d.ts`), and picking it would oblige a fake to satisfy all of them. A real
 *  `<webview>` still satisfies this narrower pair, and it says exactly what zoom listens for —
 *  see {@link applyStoredZoom}. */
export type ZoomableGuest = Pick<HTMLWebViewElement, 'getZoomLevel' | 'setZoomLevel'> & {
  addEventListener(event: 'dom-ready', listener: (event: Event) => void): void;
  removeEventListener(event: 'dom-ready', listener: (event: Event) => void): void;
};

/** The slice of {@link RunnerInventoryBridge} this file drives. */
export type ZoomBridge = Pick<RunnerInventoryBridge, 'onZoomCommand' | 'getZoomLevel' | 'setZoomLevel'>;

/** The slice of `Storage` this file drives — narrow enough that a plain object satisfies it in
 *  tests, and permissive about a call that throws (a private window, or storage disabled). */
export type ZoomStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Electron's own zoom-level step (`webContents.zoomIn`/`zoomOut`'s default), kept identical so
 *  this shell's custom Zoom menu (`zoom-menu.ts`) feels like the built-in one it replaces. Each
 *  step is roughly a 20% factor change; see Electron's own `WebContents.zoomLevel` doc. */
const ZOOM_STEP = 0.5;

/** `localStorage` key for one project's remembered zoom level. */
function zoomStorageKey(projectId: string): string {
  return `tovu:zoom:${projectId}`;
}

/** Which surface a zoom command should run against right now. Mirrors `use-find-in-page.hooks.ts`'s
 *  `FindTarget`, one target kind narrower: there is no `'none'` project id to carry for `'guest'`
 *  here, so the element itself doubles as its own key via the caller's own `projectId`. */
export type ZoomTarget = { kind: 'guest'; element: ZoomableGuest; projectId: string } | { kind: 'top' } | { kind: 'none' };

/**
 * Decides {@link ZoomTarget}: the visible project tab's guest when one is on screen and its element
 * has actually mounted, otherwise the window's own top-level page — as long as a bridge exists to
 * reach it (never true outside a real desktop window). `'none'` only when neither is available.
 *
 * @complexity O(1) — one `Map.get`.
 */
export function resolveZoomTarget(input: {
  activeGuestId: string | null;
  guests: ReadonlyMap<string, ZoomableGuest>;
  bridge: ZoomBridge | undefined;
}): ZoomTarget {
  if (input.activeGuestId !== null) {
    const element = input.guests.get(input.activeGuestId);
    if (element) return { kind: 'guest', element, projectId: input.activeGuestId };
  }
  return input.bridge ? { kind: 'top' } : { kind: 'none' };
}

/** One command's new zoom level. `'reset'` returns to 0 (100%) outright; `'in'`/`'out'` step by
 *  {@link ZOOM_STEP} from `current`. Chromium itself clamps the result to its own zoom range, so
 *  this does not — a cap here could only ever be looser or stricter than the real one underneath. */
export function nextZoomLevel(current: number, direction: ZoomDirection): number {
  if (direction === 'reset') return 0;
  return direction === 'in' ? current + ZOOM_STEP : current - ZOOM_STEP;
}

/** Reads a persisted per-project zoom level, defaulting to 0 (100%) for an unset, corrupt, or
 *  unreadable entry — never throws, since a lost preference is a cosmetic regression and a thrown
 *  read must not be.
 *  @complexity O(1). */
export function readStoredZoom(storage: ZoomStorage, projectId: string): number {
  try {
    const raw = storage.getItem(zoomStorageKey(projectId));
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

/** Persists one project's zoom level. Best-effort: a full or disabled store must not break zooming
 *  for the rest of the session, only the memory of it.
 *  @complexity O(1). */
export function writeStoredZoom(storage: ZoomStorage, projectId: string, level: number): void {
  try {
    storage.setItem(zoomStorageKey(projectId), String(level));
  } catch {
    // Storage full, disabled, or a private window with no persistence — zoom still applies this
    // session; there is nothing more useful to do with the failure.
  }
}

/** Sets a guest's zoom level, reporting whether it landed rather than throwing when it did not.
 *  Electron's `<webview>` throws from EVERY method until the guest is attached to the DOM and has
 *  emitted `dom-ready` — the same tolerance `use-find-in-page.hooks.ts` and
 *  `use-site-workspace.hooks.ts` already wrap their own guest calls in. */
function setGuestZoom(element: ZoomableGuest, level: number): boolean {
  try {
    element.setZoomLevel(level);
    return true;
  } catch {
    return false;
  }
}

/** A guest's current zoom level, or `null` when it cannot answer yet — same not-attached-yet gate
 *  as {@link setGuestZoom}. */
function readGuestZoom(element: ZoomableGuest): number | null {
  try {
    return element.getZoomLevel();
  } catch {
    return null;
  }
}

/**
 * Applies a project's remembered zoom to a guest that has just (re)registered, deferring to the
 * guest's `dom-ready` when it is not attached yet.
 *
 * **This runs inside a React ref callback, so it must not throw.** A `<webview>` is attached to the
 * DOM before it is usable, and the ref fires at attach — every method on it throws until
 * `dom-ready`, and a throw escaping a ref callback unmounts the tree, blanking the whole sites home
 * window the moment a project tab mounts. Swallowing alone would not do, either: the ref is the
 * ONLY moment a registration happens, so a swallowed first attempt would quietly retire per-site
 * zoom memory altogether. Hence the one-shot `dom-ready` wait — the level is deferred, not lost.
 *
 * @complexity O(1). At most one listener per registration, removed the first time it fires.
 */
export function applyStoredZoom(element: ZoomableGuest, projectId: string, storage: ZoomStorage): void {
  const level = readStoredZoom(storage, projectId);
  if (setGuestZoom(element, level)) return;
  const onReady = () => {
    element.removeEventListener('dom-ready', onReady);
    setGuestZoom(element, level);
  };
  element.addEventListener('dom-ready', onReady);
}

/**
 * Runs one zoom command against `target`, persisting the result when the target is a guest.
 *
 * @complexity O(1).
 */
export function applyZoomCommand(target: ZoomTarget, bridge: ZoomBridge | undefined, direction: ZoomDirection, storage: ZoomStorage): void {
  if (target.kind === 'guest') {
    // A command that arrives before the guest is attached does nothing — see {@link setGuestZoom}.
    // Nothing is persisted in that case either: a remembered level the guest never took would be
    // re-applied on its next registration and silently shift the site under the owner.
    const current = readGuestZoom(target.element);
    if (current === null) return;
    const level = nextZoomLevel(current, direction);
    if (setGuestZoom(target.element, level)) writeStoredZoom(storage, target.projectId, level);
    return;
  }
  if (target.kind === 'top' && bridge) {
    bridge.setZoomLevel(nextZoomLevel(bridge.getZoomLevel(), direction));
  }
}

export interface UseZoom {
  /** Wired into every mounted project tab's `<webview>` ref, composed with the tab's own `guestRef`
   *  and Find's `registerGuest` the same way `useComposedGuestRef` already composes those two — see
   *  `App.tsx`'s `SiteWorkspace`. `null` deregisters (the tab closed or its guest remounted); a
   *  non-null registration immediately re-applies that project's stored zoom, which is what makes a
   *  remembered zoom survive a recovery reload's fresh `<webview>` instance. */
  registerGuest: (projectId: string, element: ZoomableGuest | null) => void;
}

/**
 * The Zoom feature's whole runtime behaviour: subscribing to the app menu's command and routing it
 * to whichever surface is on screen, plus re-applying a project's remembered zoom whenever its guest
 * (re)mounts.
 *
 * @param activeGuestId the visible project tab's id, or `null` when the Projects screen itself is on
 *   screen (`App`'s `showSiteTab ? visibleWorkspaceId : null` — identical argument to
 *   `useFindInPage`'s).
 * @complexity O(1) per command, beyond `applyZoomCommand`'s own cost.
 */
export function useZoom(activeGuestId: string | null): UseZoom {
  const bridge = runnerInventoryBridge();
  // A ref, not state, for the same reason `useFindInPage`'s own `guests` map is: registering a
  // guest must never itself trigger a render, and the map's contents are only ever read at the
  // moment a command actually runs.
  const guests = useRef(new Map<string, ZoomableGuest>()).current;

  const registerGuest = useCallback(
    (projectId: string, element: ZoomableGuest | null) => {
      if (element) {
        guests.set(projectId, element);
        applyStoredZoom(element, projectId, window.localStorage);
      } else {
        guests.delete(projectId);
      }
    },
    [guests],
  );

  // The app menu's Zoom In / Zoom Out / Actual Size: resolve the live target at the moment the
  // command fires (not when this effect was set up), so a tab switch since the last render is
  // still honored.
  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.onZoomCommand((direction) => {
      const target = resolveZoomTarget({ activeGuestId, guests, bridge });
      applyZoomCommand(target, bridge, direction, window.localStorage);
    });
    // `guests` is a ref (stable identity, never itself a trigger); `activeGuestId` is what actually
    // changes which entry a fired command should resolve to.
  }, [bridge, activeGuestId, guests]);

  return { registerGuest };
}
