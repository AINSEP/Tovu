import { useCallback, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

/**
 * @file A preview's full-screen button that the operator can drag out of the way (owner,
 * 2026-10-05: the fixed top-right button covered page content). The button sits inside the
 * preview stage; dragging moves it anywhere within that stage, a plain click still toggles full
 * screen, and the chosen spot is remembered for the browser session.
 *
 * Generic — nothing here knows about Pages or Tovu. A candidate for Jini (`@jini-ai/ui`) if a second
 * product ever needs it; kept here until then.
 */

/** Distance, in px, from the containing stage's top and right edges. */
export type FabOffset = { top: number; right: number };

export const DEFAULT_FAB_OFFSET: FabOffset = { top: 10, right: 10 };

/** Pointer travel below this is a click, at or above it a drag. Small enough to feel immediate,
 *  large enough that a trackpad tap's jitter never turns a click into a no-op drag. */
export const FAB_DRAG_THRESHOLD_PX = 4;

/** Session-scoped, so a reload keeps the spot but a new session starts from the corner again. */
export const FAB_OFFSET_STORAGE_KEY = "tovu.preview-fab-offset";

/** The button's own width and height — must match `.page-preview-fab` in `styles/pages.css`. */
export const FAB_SIZE_CSS = "2.25rem";

type FabStorage = Pick<Storage, "getItem" | "setItem">;

/** @complexity O(1). */
export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= FAB_DRAG_THRESHOLD_PX;
}

/**
 * Keeps the button fully inside the stage. `stage` and `fab` are the measured box sizes; a stage
 * smaller than the button pins it to the top-right corner rather than going negative.
 *
 * @complexity O(1).
 */
export function clampFabOffset(
  offset: FabOffset,
  boxes: { stage: { width: number; height: number }; fab: { width: number; height: number } },
): FabOffset {
  const maxRight = Math.max(0, boxes.stage.width - boxes.fab.width);
  const maxTop = Math.max(0, boxes.stage.height - boxes.fab.height);
  return {
    top: Math.min(Math.max(0, offset.top), maxTop),
    right: Math.min(Math.max(0, offset.right), maxRight),
  };
}

/**
 * Inline position for the button. `min(...)` against the stage's own size re-clamps in CSS when the
 * stage shrinks after the drag (collapsing full screen, a narrower pane), with no re-measuring.
 *
 * @complexity O(1).
 */
export function fabPositionStyle(offset: FabOffset): CSSProperties {
  return {
    top: `min(${offset.top}px, calc(100% - ${FAB_SIZE_CSS}))`,
    right: `min(${offset.right}px, calc(100% - ${FAB_SIZE_CSS}))`,
  };
}

/**
 * Which side the hint should open towards so it stays inside the stage: leftwards (anchored to the
 * button's right edge) unless the button sits in the stage's left half.
 *
 * @complexity O(1).
 */
export function fabTipSide(offset: FabOffset, stageWidth: number): "left" | "right" {
  return stageWidth > 0 && offset.right > stageWidth / 2 ? "right" : "left";
}

function isFabOffset(value: unknown): value is FabOffset {
  if (typeof value !== "object" || value === null) return false;
  const { top, right } = value as Record<string, unknown>;
  return Number.isFinite(top) && Number.isFinite(right);
}

/** Browser storage can be missing or throw (private mode, blocked site data); both mean "corner". */
export function readStoredFabOffset(storage: FabStorage | null): FabOffset {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(FAB_OFFSET_STORAGE_KEY) ?? "null");
    return isFabOffset(parsed) ? parsed : DEFAULT_FAB_OFFSET;
  } catch {
    return DEFAULT_FAB_OFFSET;
  }
}

function writeStoredFabOffset(storage: FabStorage | null, offset: FabOffset): void {
  try {
    storage?.setItem(FAB_OFFSET_STORAGE_KEY, JSON.stringify(offset));
  } catch {
    // Remembering the spot is a convenience; failing to is not an error worth surfacing.
  }
}

function defaultSessionStorage(): FabStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

type DragStart = {
  pointerId: number;
  x: number;
  y: number;
  offset: FabOffset;
  boxes: { stage: { width: number; height: number }; fab: { width: number; height: number } };
  moved: boolean;
};

function measure(button: HTMLElement): DragStart["boxes"] {
  const stage = (button.offsetParent ?? button.parentElement)?.getBoundingClientRect();
  const fab = button.getBoundingClientRect();
  return { stage: { width: stage?.width ?? 0, height: stage?.height ?? 0 }, fab: { width: fab.width, height: fab.height } };
}

export type DraggablePreviewFab = {
  style: CSSProperties;
  tipSide: "left" | "right";
  dragging: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
};

/**
 * Drag-or-click behavior for the preview's full-screen button. Pointer capture keeps the drag
 * tracking even while the pointer crosses the preview iframe, which would otherwise swallow the
 * moves. A drag that ended suppresses exactly the one `click` the browser fires after it, so moving
 * the button never also toggles full screen; keyboard activation (Enter/Space) has no pointer drag
 * and always toggles.
 *
 * @complexity O(1) per event.
 */
export function useDraggablePreviewFab(
  { onToggle }: { onToggle: () => void },
  { storage = defaultSessionStorage() }: { storage?: FabStorage | null } = {},
): DraggablePreviewFab {
  const [offset, setOffset] = useState<FabOffset>(() => readStoredFabOffset(storage));
  const [tipSide, setTipSide] = useState<"left" | "right">("left");
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<DragStart | null>(null);
  // The latest dragged-to offset, read when the drag ends to persist it without a stale closure.
  const latestRef = useRef(offset);
  const suppressClickRef = useRef(false);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const button = event.currentTarget;
    startRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset, boxes: measure(button), moved: false };
    button.setPointerCapture?.(event.pointerId);
  }, [offset]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && !exceedsDragThreshold(dx, dy)) return;
    if (!start.moved) setDragging(true);
    start.moved = true;
    const next = clampFabOffset({ top: start.offset.top + dy, right: start.offset.right - dx }, start.boxes);
    latestRef.current = next;
    setOffset(next);
    setTipSide(fabTipSide(next, start.boxes.stage.width));
  }, []);

  const endDrag = useCallback((event: PointerEvent<HTMLElement>, commit: boolean) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    startRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!start.moved) return;
    setDragging(false);
    suppressClickRef.current = commit;
    if (commit) writeStoredFabOffset(storage, latestRef.current);
  }, [storage]);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => endDrag(event, true), [endDrag]);
  const onPointerCancel = useCallback((event: PointerEvent<HTMLElement>) => endDrag(event, false), [endDrag]);

  const onClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      return;
    }
    onToggle();
  }, [onToggle]);

  return { style: fabPositionStyle(offset), tipSide, dragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick };
}
