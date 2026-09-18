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
 * WebContents after a recovery reload. The window's own top-level zoom is deliberately NOT
 * persisted — it is shell chrome, not site content, and always starting a fresh session at 100% is
 * the same convention Chrome itself follows for its own UI zoom.
 */
import { useCallback, useEffect, useRef } from 'react';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import type { ZoomDirection } from '../contracts/zoom.js';

/** The slice of Electron's `<webview>` this file drives. A fake of it is what tests pass. */
export type ZoomableGuest = Pick<HTMLWebViewElement, 'getZoomLevel' | 'setZoomLevel'>;

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

/**
 * Runs one zoom command against `target`, persisting the result when the target is a guest.
 *
 * @complexity O(1).
 */
export function applyZoomCommand(target: ZoomTarget, bridge: ZoomBridge | undefined, direction: ZoomDirection, storage: ZoomStorage): void {
  if (target.kind === 'guest') {
    const level = nextZoomLevel(target.element.getZoomLevel(), direction);
    target.element.setZoomLevel(level);
    writeStoredZoom(storage, target.projectId, level);
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
        element.setZoomLevel(readStoredZoom(window.localStorage, projectId));
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
