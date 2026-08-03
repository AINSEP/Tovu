import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import "../styles/see-more.css";

/**
 * @file `SeeMore` — clamps its children to the first N rendered lines and offers a "See more" /
 * "See less" toggle. Built as a reusable component rather than a one-off truncation in its first
 * caller (`FormEditor.tsx`'s field-attributes modal, whose allowlist explainer wrapped to 5 lines
 * — 98px of a 389px dialog, measured, not eyeballed — and dominated the two inputs it describes),
 * because the admin has other long `.field-hint` copy with the same problem.
 *
 * **Clamping, not conditional rendering.** The hidden text stays in the DOM at all times — that is
 * the entire reason to clamp rather than slice the string. Collapsed text remains findable by the
 * browser's own in-page search and readable by a screen reader that walks the region directly,
 * neither of which is true of text React never rendered. Do not "optimize" this into a substring.
 *
 * Colocated + self-imports its own stylesheet, the precedent `Select.tsx` → `styles/select.css` and
 * `AssistantDock.tsx` → `styles/assistant.css` establish, rather than a line in `main.tsx` —
 * component and styles are meant to move into `@jini-ai/admin` together. See `styles/see-more.css`'s
 * own header for why every rule there is written at two-class specificity rather than trusting
 * stylesheet order; that is a hard requirement for surviving that move, not a style preference.
 */

export interface SeeMoreProps {
  children: React.ReactNode;
  /** Lines to show while collapsed. Any integer ≥ 1; values below 1 are raised to 1. */
  lines?: number;
  moreLabel?: string;
  lessLabel?: string;
  /** Applied to the wrapper, alongside `see-more`. */
  className?: string;
  /**
   * Applied to the clamped region, alongside `see-more-text`. This is where a caller keeps its own
   * typography — `see-more.css` deliberately sets no color/size/line-height, only clamp mechanics,
   * so a caller class here wins on every property that isn't the clamp itself.
   */
  textClassName?: string;
  /** Applied to the toggle button, alongside `see-more-toggle`. */
  toggleClassName?: string;
  /**
   * Accessible name for the toggle, when the visible "See more" would be ambiguous — e.g. several
   * of these on one screen, which a screen reader's button list renders as N identical entries.
   * `aria-expanded` + `aria-controls` are always set regardless.
   */
  toggleAriaLabel?: string;
}

const DEFAULT_LINES = 2;

/** Sub-pixel line-height rounding can leave `scrollHeight` a hair above `clientHeight` on text that
 * visibly fits. Without this margin the toggle appears on single-line strings — the case the
 * overflow check exists to prevent in the first place. */
const OVERFLOW_TOLERANCE_PX = 1;

export function SeeMore(props: SeeMoreProps) {
  const {
    children,
    lines = DEFAULT_LINES,
    moreLabel = "See more",
    lessLabel = "See less",
    className,
    textClassName,
    toggleClassName,
    toggleAriaLabel,
  } = props;

  // Collapsed by default, per the request that created this component.
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);
  const regionId = useId();

  const lineCount = Math.max(1, Math.round(lines));

  /** Only meaningful while the clamp is actually applied — see both callers below. */
  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + OVERFLOW_TOLERANCE_PX);
  }, []);

  // Both measuring effects bail while expanded, and that is the whole design rather than an
  // oversight: expanding removes the clamp, at which point `scrollHeight === clientHeight` by
  // definition and the check would report "does not overflow" for text that plainly does — which
  // would unmount the toggle and strand the user in the expanded state with no way back. So
  // `overflows` deliberately goes stale while expanded and is re-measured the moment it collapses.
  // The visible consequence is narrow and self-correcting: if the children change while expanded so
  // that they no longer overflow, the toggle lingers until the next collapse, then disappears with
  // the (now fully visible) text.
  //
  // `useLayoutEffect` so the toggle's presence is settled before paint — a `useEffect` here shows
  // one frame of clamped text with no way to expand it, then pops the button in.
  useLayoutEffect(() => {
    if (expanded) return;
    measure();
    // `children` is a fresh object on every parent render, so this re-runs whenever the host
    // re-renders (the first caller is a dialog that re-renders on each keystroke). That is two DOM
    // reads, deliberately accepted: the alternative is missing a genuine content change. The
    // `ResizeObserver` below is the expensive thing, and it is kept out of this dependency list.
  }, [expanded, lineCount, children, measure]);

  useEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    // Guarded rather than assumed, the same way `Select.tsx` guards `elementFromPoint` and
    // `scrollIntoView`: this app's jsdom test harness implements no `ResizeObserver` at all, so an
    // unguarded `new ResizeObserver` throws on mount in every test that renders this component.
    // Where it is missing, the layout effect above still measures on mount and on content change —
    // only reflow-from-width-change goes unnoticed, which jsdom has no layout engine to produce.
    if (!el || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, measure]);

  return (
    <div className={className ? `see-more ${className}` : "see-more"}>
      <div
        ref={textRef}
        id={regionId}
        className={`see-more-text${expanded ? " is-expanded" : ""}${textClassName ? ` ${textClassName}` : ""}`}
        // The line count rides a custom property rather than a class-per-N (`.see-more-text--3`),
        // so `lines` can be any integer a caller needs without this file growing a rule for each.
        style={{ "--see-more-lines": lineCount } as React.CSSProperties}
      >
        {children}
      </div>
      {overflows ? (
        <button
          type="button"
          className={toggleClassName ? `see-more-toggle ${toggleClassName}` : "see-more-toggle"}
          aria-expanded={expanded}
          aria-controls={regionId}
          aria-label={toggleAriaLabel}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  );
}
