import { useFabPosition } from "../hooks/use-fab-position.hooks";

interface ChatFabProps {
  open: boolean;
  onToggle: () => void;
  label?: string;
  /**
   * Bottom clearance (px) to hold above while `open` — the mobile sheet's current rendered
   * height, or `0` at desktop, where the assistant docks to the *side* of `.admin-content`
   * rather than below it, so there is nothing at the bottom edge to avoid. See `App.tsx`, which
   * measures the actual sheet element rather than assuming a fixed height.
   */
  avoidBottomPx: number;
  ref?: React.Ref<HTMLButtonElement>;
}

/**
 * Floating toggle for the global assistant dock (ADR-049), and — per MSG-09 — draggable to
 * wherever the operator wants it out of the way. Mirrors
 * `examples/reference-web/src/ChatFab.tsx`'s role in Jini's own reference app: a fixed-position
 * button that opens/closes the docked chat pane without ever unmounting it — see
 * `AssistantDock.tsx`'s module doc for why the dock itself uses `hidden`, not conditional render.
 *
 * The drag itself is `useFabPosition`'s job entirely; this component only wires its `style`/
 * `onPointerDown` onto the button and guards `onClick` with `consumeDragFlag()` so a drag's
 * release does not also fire a toggle (see that function's own doc for why a plain `isDragging`
 * check at this call site would be timing-unsafe).
 */
export function ChatFab({ open, onToggle, label = "assistant", avoidBottomPx, ref }: ChatFabProps) {
  const fab = useFabPosition({ dockOpen: open, avoidBottomPx });

  return (
    <button
      ref={ref}
      type="button"
      className={`chat-fab${open ? " chat-fab-dock-open" : ""}${fab.isDragging ? " chat-fab-dragging" : ""}`}
      style={fab.style}
      onPointerDown={fab.onPointerDown}
      onClick={() => {
        if (fab.consumeDragFlag()) return;
        onToggle();
      }}
      aria-expanded={open}
      aria-label={open ? `Close ${label}` : `Open ${label}`}
      title={open ? `Close ${label}` : `Open ${label}`}
    >
      {open ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="50" height="50" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M9 1.8 10.6 6 15 7.2 10.6 8.4 9 12.6 7.4 8.4 3 7.2 7.4 6Z" fill="currentColor" />
          <circle cx="14" cy="13.5" r="1.7" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
