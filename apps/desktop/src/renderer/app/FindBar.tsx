import type { FindInPage } from '../use-find-in-page.hooks.js';

/**
 * Cmd+F's own bar: a query input, the "N of M" counter, previous/next, and a close button that
 * stops the search and clears its highlights. Always mounted (see `App`'s root), hidden with a
 * plain early return rather than being conditionally rendered out of the tree — the input DOM node
 * only exists while `find.open`, so its `inputRef` has nothing to attach to when closed either way,
 * and there is no state here worth preserving across a close (`useFindInPage`'s `close` already
 * resets it).
 *
 * Floats over whichever surface is on screen — the Projects grid or a project tab's own bar — top
 * right, the same corner Chrome puts its own in.
 */
export function FindBar({ find }: { find: FindInPage }) {
  if (!find.open) return null;
  return (
    <div className="findbar" role="search">
      <input
        ref={find.inputRef}
        type="text"
        className="findbar__input"
        value={find.query}
        onChange={(event) => find.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            find.close();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) find.previous();
            else find.next();
          }
        }}
        placeholder="Find in page"
        aria-label="Find in page"
      />
      <span className="findbar__count" aria-live="polite">{find.countLabel}</span>
      <button
        type="button"
        className="findbar__act"
        onClick={find.previous}
        disabled={find.query === ''}
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className="findbar__act"
        onClick={find.next}
        disabled={find.query === ''}
        title="Next match (Enter)"
        aria-label="Next match"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" className="findbar__act findbar__close" onClick={find.close} title="Close (Esc)" aria-label="Close find bar">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
