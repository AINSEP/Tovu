import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * @file `SeeMore`'s collapse/expand state and overflow-measurement logic, split out of the
 * component so it can be swapped for a fake via the `useClamp` prop on `SeeMoreProps` — see that
 * prop's doc comment in `SeeMore.tsx`. Same split `ConfirmDialog`/`ConfirmDialog.hooks.tsx` uses in
 * `@jini-ai/admin`: this file owns every `useState`/`useRef`/`useLayoutEffect`/`useEffect` call,
 * `SeeMore.tsx` stays props-and-JSX only.
 */

/** Sub-pixel line-height rounding can leave `scrollHeight` a hair above `clientHeight` on text that
 * visibly fits. Without this margin the toggle appears on single-line strings — the case the
 * overflow check exists to prevent in the first place. */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * Owns `SeeMore`'s collapse/expand state and overflow detection: whether the clamped text actually
 * overflows its `lines` limit (and so needs a toggle at all), kept in sync via a layout-effect
 * measurement on every render plus a `ResizeObserver` for width-driven reflow. Split out from the
 * component so the measurement effects can be driven directly with `renderHook` against a mocked
 * `textRef.current`, rather than only indirectly through a full DOM render.
 *
 * @param input.lines - Rounded/floored to the same `lineCount` the clamp CSS uses (see call site).
 * @param input.children - Passed through only to sit in the layout effect's dependency array, so a
 *   content change is measured like a genuine resize — see the effect's own comment.
 * @returns `expanded`/`setExpanded` (collapsed by default, per the request that created this
 *   component), `overflows` (whether the toggle should render), `textRef` (attach to the clamped
 *   element), `regionId` (stable id for `aria-controls`), and `lineCount`.
 * @example
 * const { expanded, setExpanded, overflows, textRef, regionId, lineCount } = useSeeMoreClamp({
 *   lines: 2,
 *   children,
 * });
 */
export function useSeeMoreClamp({ lines, children }: { lines: number; children: React.ReactNode }) {
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

  return { expanded, setExpanded, overflows, textRef, regionId, lineCount };
}
