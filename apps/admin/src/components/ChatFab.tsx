interface ChatFabProps {
  open: boolean;
  onToggle: () => void;
  label?: string;
}

/**
 * Floating toggle for the global assistant dock (ADR-049). Mirrors
 * `examples/reference-web/src/ChatFab.tsx`'s role in Jini's own reference app: a fixed-position
 * button that opens/closes the docked chat pane without ever unmounting it — see
 * `AssistantDock.tsx`'s module doc for why the dock itself uses `hidden`, not conditional render.
 */
export function ChatFab({ open, onToggle, label = "assistant" }: ChatFabProps) {
  return (
    <button
      type="button"
      className={`chat-fab${open ? " chat-fab-dock-open" : ""}`}
      onClick={onToggle}
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
