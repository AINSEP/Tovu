import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * @file Measures the theme preview pane's own rendered width so `ThemeExplorePreview`
 * (`ThemeExplore.tsx`) can scale a fixed-device-width iframe down to fit it — the same mechanism
 * `PageEditor.tsx`'s own `PagePreview` uses.
 *
 * Split out of `ThemeExplorePreview`'s render body (2026-08-14 DI migration pass) so the raw
 * `useState`/`useEffect`/`useRef` trio doesn't sit directly inside a component, without hoisting it
 * into the screen-level `use-theme-explore.hooks.ts`: the `ResizeObserver` here has to track
 * `ThemeExplorePreview`'s OWN mount/unmount lifecycle (it unmounts every time the operator switches
 * to the HTML tab or selects a file with nothing to preview), not `ThemeExplore`'s. Hoisting it to
 * the screen-level hook would freeze the observer to whatever DOM node existed the moment
 * `ThemeExplore` itself first mounted — usually `null`, since the preview pane isn't rendered yet at
 * that point — and it would never reattach on a later remount. No port: this is pure DOM
 * measurement, no I/O, so per the DI-migration ground rule a hook with nothing to inject gets no
 * port.
 */
export interface ThemeExplorePreviewFrame {
  /** Attach to the wrapping element whose rendered width should be tracked. */
  frameRef: RefObject<HTMLDivElement | null>;
  /** The frame's last-measured width in px. Starts at `880` — the pane's approximate width before
   *  the first real measurement lands — so the first paint has a sane scale instead of
   *  `Infinity`/`NaN` from a zero-width ref. */
  paneWidth: number;
}

/**
 * @param void — no arguments; this hook owns and returns its own ref.
 * @returns The ref to attach and the pane's last-measured width.
 * @complexity Time/space: O(1) per resize callback — `ResizeObserver` reports at most one entry for
 * the single element this hook observes.
 */
export function useThemeExplorePreviewFrame(): ThemeExplorePreviewFrame {
  const frameRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(880);

  useEffect(() => {
    const el = frameRef.current;
    // jsdom implements no `ResizeObserver` at all (`__tests__/setup.ts`'s own comment — deliberately
    // left unstubbed, so a test can't pass without the measurement ever happening) — guarded exactly
    // like `SeeMore.hooks.tsx`'s own `typeof ResizeObserver !== "function"` check, so the component
    // using this hook still renders (at the `880` default) in every existing/new unit test.
    if (!el || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setPaneWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { frameRef, paneWidth };
}
