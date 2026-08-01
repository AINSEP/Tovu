import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * @file Draggable position for the assistant `ChatFab` (MSG-09).
 *
 * Own hook, not inline state in `ChatFab.tsx` — the same reasoning as `useSidebarRail`: this is
 * real, testable-on-its-own behavior (persistence, clamping, edge-snap), and `apps/admin/INFO.md`'s
 * hook convention is where it lives. No `-port.hooks.ts` / `-dependencies.hooks.ts` pair, for the
 * same reason as `useSidebarRail`: the only outside dependency is `localStorage`, a browser
 * built-in, not a swappable backend worth a fake-port seam.
 *
 * Position is persisted as **edge + a fraction of viewport height**, never raw pixels — the same
 * class of bug as the pre-existing `.chat-fab-dock-open { right: calc(380px + 20px) }` rule this
 * replaces (see `styles/assistant.css`'s old comment): a pixel position that is valid at the
 * viewport it was set on can be off-screen at a different one (window resized, phone rotated). A
 * side (`"left" | "right"`) plus a 0–1 fraction of `innerHeight` from the bottom is
 * resolution-independent by construction — re-deriving pixels on every render/resize instead of
 * trusting a stored pixel value is what actually fixes the class of bug, not just this one
 * instance of it.
 */

const STORAGE_KEY = "tovu-admin-fab-position";
/** Keeps the FAB's edge margin and the sheet-avoidance gap in one place instead of duplicating
 *  the literal in both this file and `styles.css`. */
export const FAB_EDGE_MARGIN = 20;
/** Below this many pixels of net pointer movement, a pointerdown/up pair is treated as a click,
 *  not a drag — small enough that an intentional drag is never mistaken for a tap, large enough
 *  that a tap's inevitable few pixels of finger movement never gets misread as a drag and eaten. */
const DRAG_THRESHOLD_PX = 5;
/** Matches `.chat-fab`'s own `width`/`height` in `styles/assistant.css` — used only to keep a
 *  dragged position from clamping the FAB half off-screen; if that CSS size ever changes, update
 *  both together (there is no single source of truth to read the rendered size from here without
 *  a layout measurement on every drag frame, which is not worth it for a constant that changes
 *  approximately never). */
const FAB_SIZE_PX = 56;

export type FabSide = "left" | "right";

interface StoredFabPosition {
  side: FabSide;
  /** Fraction of `window.innerHeight`, measured from the bottom edge, in `[0, 1]`. */
  bottomFraction: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readPersisted(): StoredFabPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFabPosition>;
    if ((parsed.side !== "left" && parsed.side !== "right") || typeof parsed.bottomFraction !== "number") return null;
    return { side: parsed.side, bottomFraction: clamp(parsed.bottomFraction, 0, 1) };
  } catch {
    return null;
  }
}

function writePersisted(position: StoredFabPosition): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Best-effort, same reasoning as `useSidebarRail`'s `writePersisted` — a user who cannot
    // persist the position still gets a working, draggable FAB for the current tab.
  }
}

/** A safe default before the first drag — bottom-right corner, matching the FAB's original
 *  hard-coded `right: 20px; bottom: 20px`. */
const DEFAULT_POSITION: StoredFabPosition = { side: "right", bottomFraction: 0 };

export interface FabPositionResult {
  /** Inline `style` for the FAB button — `right`/`left` and `bottom`, in px, always resolved
   *  against the *current* viewport (never a stale stored pixel value). */
  style: { right?: number; left?: number; bottom: number };
  /** Attach to the FAB's `onPointerDown`. */
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /**
   * Call from the FAB's `onClick`, in place of the toggle callback directly — returns `true` if
   * the click should be treated as a real activation (fire the toggle) and `false` if it is the
   * tail end of a drag and should be swallowed.
   *
   * Deliberately NOT the `isDragging` boolean below checked inline at the call site: `pointerup`
   * (which ends the drag) and `click` (which this guards) are two different events, dispatched
   * back-to-back by the browser, and by the time `click` fires React may not have re-rendered
   * with `isDragging`'s new value yet — reading a piece of React state that was *just* set a
   * moment earlier in the same synchronous sequence is exactly the kind of timing this project's
   * conventions call out as unreliable (see `use-settings-slice.hooks.ts`'s "read at run time, not
   * schedule time" refrain, one level down in raw event timing rather than async scheduling).
   * `consumeDragFlag` reads and clears a ref instead, which has no such lag.
   */
  consumeDragFlag: () => boolean;
  /** For UI feedback only (e.g. suppressing the hover/press transition while dragging) — not to
   *  be used to decide whether to swallow a click; use `consumeDragFlag` for that. */
  isDragging: boolean;
}

/**
 * @param options.dockOpen When the assistant dock/sheet is open, the FAB has to move off its
 *   dragged resting spot so it never sits over the dock's own composer/close controls — this
 *   mirrors what the old hard-coded `.chat-fab-dock-open` rule did for the desktop-docked panel,
 *   generalized to the dragged position and to the mobile sheet's own (viewport-fraction) height.
 * @param options.avoidBottomPx Extra clearance to hold above the bottom edge while `dockOpen` —
 *   the caller passes the mobile sheet's current height here (0 at desktop, where the dock sits
 *   to the *side*, not below, so no bottom clearance is needed there — see `App.tsx`).
 *
 * @complexity O(1) per pointer event — no work scales with anything caller-controlled.
 */
export function useFabPosition(options: { dockOpen: boolean; avoidBottomPx: number }): FabPositionResult {
  const { dockOpen, avoidBottomPx } = options;
  const [persisted, setPersisted] = useState<StoredFabPosition>(() => readPersisted() ?? DEFAULT_POSITION);
  const [isDragging, setIsDragging] = useState(false);

  /**
   * All the mutable drag bookkeeping lives in refs, not state, and is read/written only inside
   * the `pointermove`/`pointerup` handlers below.
   *
   * This is deliberate, not an optimization: `document.addEventListener("pointermove", handler)`
   * binds to whatever `handler` closure existed at `pointerdown` time and is never re-subscribed
   * mid-drag. If this logic instead branched on the REACT STATE `isDragging` — which is exactly
   * what an earlier version of this hook did — every handler invoked after the first `pointermove`
   * would still see the `isDragging=false` closure captured at `pointerdown`, because the state
   * update that flips it to `true` doesn't re-create (and re-attach) the listener. Concretely,
   * that made `handlePointerUp`'s `if (isDragging)` check always false, so a real drag's end
   * position was silently never persisted. Refs have no such staleness — they are the same
   * mutable cell on every read regardless of which render's closure is doing the reading.
   */
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);
  const liveRef = useRef<{ right: number; bottom: number } | null>(null);
  const dragStart = useRef<{ pointerId: number; startX: number; startY: number; startRight: number; startBottom: number } | null>(null);

  /** Bumped to force a re-render on every pointermove and on resize — `liveRef`/`window.innerWidth`
   *  are read directly in `style`'s `useMemo` below, neither of which React tracks as a reactive
   *  dependency on its own, so without this counter in that hook's dependency array the memo
   *  would never invalidate and the FAB would visually freeze mid-drag. */
  const [renderTick, forceRender] = useState(0);

  // Re-clamp on resize/orientationchange — a `bottomFraction` is already resolution-independent
  // for the vertical axis, but this still forces a re-render so any consumer computing pixels
  // from `window.innerHeight` (this hook included, in `style` below) recomputes rather than
  // holding a value measured against the previous viewport.
  useEffect(() => {
    function onResize() {
      forceRender((n) => n + 1);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Stable identities (empty dep arrays) — see the `draggingRef` doc above for why these must
  // never depend on state that would force a re-subscribe mid-gesture.
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;
    const dx = e.clientX - start.startX;
    const dy = e.clientY - start.startY;
    if (!draggingRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      draggingRef.current = true;
      didDragRef.current = true;
      setIsDragging(true);
    }
    if (draggingRef.current) {
      // Dragging moves the FAB's bottom-right-anchored box: moving the pointer right shrinks
      // `right` (px from the right edge); moving it down shrinks `bottom`.
      liveRef.current = { right: start.startRight - dx, bottom: start.startBottom - dy };
      forceRender((n) => n + 1);
    }
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;
    (e.target as Element).releasePointerCapture?.(start.pointerId);
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.removeEventListener("pointercancel", handlePointerUp);

    const live = liveRef.current;
    const wasDragging = draggingRef.current;
    dragStart.current = null;
    liveRef.current = null;
    draggingRef.current = false;

    if (live && wasDragging) {
      // Snap to whichever edge the drop point is nearer — the standard resting behavior for an
      // edge-anchored FAB, and it keeps the persisted state in the same "edge + fraction" shape
      // regardless of which side the drag ended on.
      const centerX = window.innerWidth - live.right - FAB_SIZE_PX / 2;
      const side: FabSide = centerX > window.innerWidth / 2 ? "right" : "left";
      const bottomFraction = clamp(live.bottom / window.innerHeight, 0, 1);
      const next: StoredFabPosition = { side, bottomFraction };
      setPersisted(next);
      writePersisted(next);
    }
    setIsDragging(false);
    // `didDragRef` is intentionally NOT cleared here — `consumeDragFlag` (called from `onClick`,
    // which fires after this handler) is what clears it, once. Clearing it here would defeat the
    // whole point: `click` always follows `pointerup`, so the flag has to survive until then.
  }, [handlePointerMove]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Right-button/non-primary pointers don't start a drag — a right-click should still be
      // able to open a context menu, not get captured as a failed drag gesture.
      if (e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      dragStart.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startRight: window.innerWidth - rect.right,
        startBottom: window.innerHeight - rect.bottom,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  const consumeDragFlag = useCallback((): boolean => {
    const dragged = didDragRef.current;
    didDragRef.current = false;
    return dragged;
  }, []);

  const style = useMemo(() => {
    const live = liveRef.current;
    if (draggingRef.current && live) {
      // Clamped live so a fast drag can't throw the FAB fully off-screen mid-gesture, only to
      // have it snap back on release — the same margin used for the resting position below.
      return {
        right: clamp(live.right, FAB_EDGE_MARGIN, window.innerWidth - FAB_EDGE_MARGIN - FAB_SIZE_PX),
        bottom: clamp(live.bottom, FAB_EDGE_MARGIN, window.innerHeight - FAB_EDGE_MARGIN - FAB_SIZE_PX),
      };
    }
    const bottomPx = clamp(
      persisted.bottomFraction * window.innerHeight,
      FAB_EDGE_MARGIN,
      window.innerHeight - FAB_EDGE_MARGIN - FAB_SIZE_PX,
    );
    // While the dock/sheet is open, hold above it regardless of the dragged resting spot — this
    // is what `.chat-fab-dock-open`'s hard-coded `calc(380px + 20px)` used to do for exactly one
    // case (desktop, docked); `avoidBottomPx` generalizes it to whatever the caller's current
    // dock chrome actually measures.
    const effectiveBottom = dockOpen ? Math.max(bottomPx, avoidBottomPx + FAB_EDGE_MARGIN) : bottomPx;
    return persisted.side === "right"
      ? { right: FAB_EDGE_MARGIN, bottom: effectiveBottom }
      : { left: FAB_EDGE_MARGIN, bottom: effectiveBottom };
    // `renderTick`/`isDragging` are read only to force recomputation while dragging (their values
    // are not otherwise used in the body — the live position comes from `liveRef`/`draggingRef`
    // directly, per the staleness note above) — expected extra deps, not a lint miss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted, dockOpen, avoidBottomPx, renderTick, isDragging]);

  return { style, onPointerDown, consumeDragFlag, isDragging };
}
