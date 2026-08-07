import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * @file `Select`'s open/search/highlight/position state, every effect that watches
 * scroll/resize/outside-click/keyboard, and the pure DOM helper functions that state calls
 * (`computePosition`, `buildOptionId`, `focusableInDomOrder`) — split out of the component so it
 * can be swapped for a fake via the `useDropdown` prop on `SelectProps` (see that prop's doc
 * comment in `Select.tsx`), the same seam `ConfirmDialog.hooks.tsx` documents for
 * `useConfirmDialog` in `@jini-ai/admin`.
 *
 * The three helpers below moved here rather than staying in `Select.tsx`: none of them touch JSX,
 * all three exist purely to serve this hook's own state (`position`, the `<li>` id scheme, the
 * Tab-handling DOM walk), and `Select.hooks.unit.test.tsx` exercises them directly rather than only
 * through the rendered component.
 *
 * **2026-08-06 complexity pass:** `useSelectDropdown` was, by a wide margin, the highest-complexity
 * symbol in the admin app — every effect, action, and keyboard handler it owns was declared inline
 * in its own body, so reviewing (or scoring) it meant holding all of that at once. The five private
 * hooks below (`usePanelPosition`, `useCloseOnOutsideClick`, `useResetHighlightOnQueryChange`,
 * `useScrollHighlightedIntoView`, `useSelectKeyboardHandlers`) are a LITERAL extraction, not a
 * rewrite: every effect/handler body is unchanged from before this pass, each is now called
 * unconditionally from `useSelectDropdown` in the same relative order the inline code used to run
 * in (Rules of Hooks — hooks calling hooks is ordinary React, not a new pattern), and
 * `useSelectDropdown`'s own exported signature and return shape are byte-identical to before, so
 * the `useDropdown` injectable seam on `SelectProps` and every existing test against it are
 * unaffected. `handlePanelKeyDown` specifically is untouched internally — same flat `switch`, no
 * lookup-table conversion (that would trade a genuinely-clear form for a lower number) — it simply
 * now lives inside the small `useSelectKeyboardHandlers` hook instead of the mega-hook's own body,
 * which is what "cut the nesting around it" meant for this pass.
 */

/** A search box over a handful of options looks silly (the design ask, not a guess) — below this
 * many options the panel is just the list, no search input at all. */
const SEARCH_VISIBILITY_THRESHOLD = 8;

/** Rough placement heuristic, not a hard limit — the panel still carries its own `max-height` +
 * `overflow-y` (`styles/select.css`); this only decides which side of the trigger to open toward,
 * so a trigger sitting near the bottom of the viewport doesn't open a panel that's mostly
 * off-screen. */
const ESTIMATED_PANEL_HEIGHT = 280;

/** Everything Tab could legitimately land on, in real DOM order. Used only to find the trigger's
 * own DOM-order neighbour (see `handlePanelKeyDown`'s `"Tab"` case) — the floating panel is
 * portaled to the end of `document.body` (`styles/select.css`'s header explains why), which would
 * otherwise put it last in document order and send a real Tab keypress to the browser chrome
 * instead of whatever naturally follows the trigger on screen. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface SelectOption {
  value: string;
  label: string;
}

export function focusableInDomOrder(exclude: HTMLElement | null): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !exclude || !exclude.contains(el)
  );
}

export interface PanelPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

/** `position: fixed` coordinates measured off the trigger's live `getBoundingClientRect()` —
 * viewport-relative, so the panel escapes any scrolling/overflow-hidden ancestor (see
 * `styles/select.css`) without needing to know anything about that ancestor. Opens upward when
 * there isn't `ESTIMATED_PANEL_HEIGHT` of room below AND there's more room above than below;
 * either way the returned `maxHeight` is the ACTUAL remaining space in that direction, not the
 * estimate, so the panel's own scroll (not the viewport edge) is what ever clips it. */
export function computePosition(trigger: HTMLElement): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUpward = spaceBelow < ESTIMATED_PANEL_HEIGHT && spaceAbove > spaceBelow;
  if (openUpward) {
    return { bottom: viewportHeight - rect.top + gap, left: rect.left, width: rect.width, maxHeight: Math.max(120, spaceAbove - gap * 2) };
  }
  return { top: rect.bottom + gap, left: rect.left, width: rect.width, maxHeight: Math.max(120, spaceBelow - gap * 2) };
}

/** Builds a listbox option's DOM `id`, shared between the `<li>` itself and the trigger's
 * `aria-activedescendant` — a small pure function pulled out of the hook below so the id scheme is
 * directly assertable without rendering anything. */
export function buildOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

/**
 * Owns the floating panel's `position` state: the measure-then-focus effect that computes it after
 * open, and the scroll/resize effect that keeps it anchored to the trigger (or reports the trigger
 * has left view / is obscured, via `onOutOfView`, rather than deciding what to do about that
 * itself — closing the panel is `useSelectDropdown`'s `closePanel`, not this hook's business).
 *
 * Extracted from `useSelectDropdown` verbatim — both effect bodies are unchanged from before this
 * pass; only the `closePanel({refocusTrigger:false})` calls became `onOutOfView()`.
 */
function usePanelPosition({
  open,
  triggerRef,
  panelRef,
  searchInputRef,
  showSearch,
  onOutOfView,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  showSearch: boolean;
  onOutOfView: () => void;
}) {
  const [position, setPosition] = useState<PanelPosition | null>(null);

  // Two phases, deliberately in one effect rather than two: (1) `position` starts `null` on every
  // open (`closePanel` resets it), so the panel/`createPortal` call below isn't rendered at all yet
  // — `panelRef`/`searchInputRef` are still unattached, so focusing them here would silently no-op.
  // Computing `position` schedules a state update; because this is a `useLayoutEffect`, React
  // re-renders and re-runs layout effects synchronously before the browser paints, rather than
  // waiting a frame. (2) On that second pass `position` is non-null, the portal now exists in the
  // DOM, and the refs are populated — only now is it correct to move focus into it. Found live via
  // this component's own tests: every keyboard-driven test failed until this was split out, because
  // `panelRef.current`/`searchInputRef.current` were both still `null` when focus was attempted in
  // the same pass that first computed the position.
  useLayoutEffect(() => {
    if (!open) return;
    if (!position) {
      if (triggerRef.current) setPosition(computePosition(triggerRef.current));
      return;
    }
    if (showSearch) {
      searchInputRef.current?.focus();
    } else {
      panelRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position]);

  // Keeps the panel anchored to the trigger if the surrounding page/dialog scrolls or resizes while
  // it's open — `.widget-picker-body`'s own `overflow-y: auto` made this a real, live scenario
  // rather than a hypothetical one. `scroll` needs the capture phase: an inner element's own scroll
  // does not bubble to `window` in the bubble phase. The decision logic itself is
  // `repositionOrClose`, above; this effect is only the DOM listener wiring.
  //
  // Found live in a real browser, not by this component's own test suite: scrolling a host's
  // scrolling ancestor far enough that the trigger scrolls out of its own visible clip used to leave
  // this effect happily recomputing a mathematically-correct `position` for it — the panel just
  // ended up following the trigger to an off-screen (or behind-the-header, obscured) spot, floating
  // there indefinitely, nominally still "open" with no visible way to tell.
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const el = triggerRef.current;
      if (!el) return;
      repositionOrClose(el, onOutOfView, setPosition);
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { position, setPosition };
}

/**
 * The scroll/resize repositioning decision — extracted from `usePanelPosition`'s effect as a
 * top-level function under the tightened ≤9/≤9 pass: a function declared inside a `useEffect` is
 * still a closure nested inside the hook that owns it, one level removed from the hook's own top
 * scope rather than zero, and it still doesn't lower the whole-hook view (§2 of the
 * complexity-ceiling brief). Takes the trigger element and the two callbacks it needs
 * (`onOutOfView`, `setPosition`) as parameters instead of closing over them, so it can be tested
 * without mounting anything.
 *
 * A native `<select>`'s OS popup does not survive its trigger leaving view; this closes the panel
 * instead of chasing a trigger nobody can see, the same idea. `elementFromPoint` at the trigger's
 * own center is the generic obscured-by-something check (works for any clipping ancestor, not just
 * one dialog's own `overflow-y`) — it asks "is my trigger actually the thing rendered at its own
 * center point", which is false once a clipping ancestor (or the viewport edge) has hidden it.
 * Guarded, not assumed available: some environments (older WebViews, this app's own jsdom test
 * harness) don't implement `elementFromPoint` at all — where it doesn't, this degrades to the
 * viewport-edge check alone rather than throwing.
 */
export function repositionOrClose(trigger: HTMLElement, onOutOfView: () => void, setPosition: (position: PanelPosition) => void) {
  const rect = trigger.getBoundingClientRect();
  const outOfViewport = rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth;
  if (outOfViewport) {
    onOutOfView();
    return;
  }
  if (typeof document.elementFromPoint === "function") {
    const topmostAtCenter = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const obscured = !topmostAtCenter || !(trigger.contains(topmostAtCenter) || topmostAtCenter.contains(trigger));
    if (obscured) {
      onOutOfView();
      return;
    }
  }
  setPosition(computePosition(trigger));
}

/** Closes the panel on an outside mousedown while it's open — extracted from `useSelectDropdown`
 *  verbatim (same effect body, `closePanel({refocusTrigger:false})` became `onOutside()`). */
function useCloseOnOutsideClick({
  open,
  triggerRef,
  panelRef,
  onOutside,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onOutside: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onOutside();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** The previously-highlighted option may not even be in `filtered` once the search narrows the
 *  list, so re-anchor the highlight to the top match every time the query changes — extracted from
 *  `useSelectDropdown` verbatim. */
function useResetHighlightOnQueryChange({
  open,
  query,
  hasMatches,
  setHighlightedIndex,
}: {
  open: boolean;
  query: string;
  hasMatches: boolean;
  setHighlightedIndex: (index: number) => void;
}) {
  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(hasMatches ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
}

/**
 * Found live in a real browser, not by this component's own test suite until added just now: a
 * list longer than the panel's own `max-height` (`styles/select.css`) moved the LOGICAL highlight
 * correctly via ArrowUp/ArrowDown (`aria-activedescendant`, the `.is-highlighted` class both
 * updated), but nothing ever scrolled `.select-list` to bring that row into view — keyboard-
 * navigating past the visible fold silently lost track of where the highlight even was.
 * `"nearest"` (not `"center"`) only scrolls the minimum needed, so it doesn't fight a user who has
 * manually scrolled partway through an unrelated portion of the list. Extracted from
 * `useSelectDropdown` verbatim.
 */
function useScrollHighlightedIntoView({
  open,
  highlightedIndex,
  optionRefs,
}: {
  open: boolean;
  highlightedIndex: number;
  optionRefs: React.RefObject<Map<number, HTMLLIElement>>;
}) {
  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const el = optionRefs.current.get(highlightedIndex);
    // Guarded the same way as `document.elementFromPoint` above — this app's own jsdom test
    // harness doesn't implement `scrollIntoView` at all (not even as a no-op), so an unguarded call
    // throws inside the effect on every highlight change.
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);
}

/** Resolves Tab's DOM-order neighbour of the trigger — the one piece of `handlePanelKeyDown`'s
 *  `"Tab"` case that wasn't a one-line action, and the reason that case scored high on cognitive
 *  complexity despite the switch itself staying flat (see this file's header, 2026-08-06 pass).
 *  Same `focusableInDomOrder` walk, same `indexOf`, same neighbour arithmetic as before — only
 *  moved out of the switch case so the case body is a single call plus two side effects. Returns
 *  `null` when the trigger can't be found among the focusable nodes (disabled mid-session — see
 *  `Select.unit.test.tsx`'s "Tab closes the panel without moving focus..." regression), which the
 *  caller reads as "don't move focus, just close." */
export function resolveTabTarget(
  panel: HTMLElement | null,
  trigger: HTMLElement | null,
  shiftKey: boolean
): HTMLElement | null {
  const nodes = focusableInDomOrder(panel);
  const triggerIndex = trigger ? nodes.indexOf(trigger) : -1;
  if (triggerIndex < 0) return null;
  return nodes[triggerIndex + (shiftKey ? -1 : 1)] ?? null;
}

/**
 * `Select`'s two keyboard handlers, extracted from `useSelectDropdown` verbatim — neither body
 * changed, including `handlePanelKeyDown`'s own flat `switch` over `e.key` (kept exactly as-is per
 * this pass's explicit guidance: a keyboard handler written as a flat switch is the clearest form
 * available, and converting the dispatch into a lookup table would trade that clarity for a lower
 * number). Pulled into its own hook purely so neither handler sits directly inside the much larger
 * `useSelectDropdown` body anymore. The `"Tab"` case's own focus-walking math is now
 * `resolveTabTarget`, above — the 2026-08-06 complexity pass's fix for the case that carried the
 * hook's actual complexity load (16/15): not the switch, the nested `if` + `indexOf` + `shiftKey`
 * ternary inside one of its cases.
 */
function useSelectKeyboardHandlers({
  disabled,
  open,
  openPanel,
  closePanel,
  moveHighlight,
  selectOption,
  highlightedIndex,
  setHighlightedIndex,
  filtered,
  triggerRef,
  panelRef,
}: {
  disabled: boolean | undefined;
  open: boolean;
  openPanel: () => void;
  closePanel: (opts: { refocusTrigger: boolean }) => void;
  moveHighlight: (delta: 1 | -1) => void;
  selectOption: (option: SelectOption) => void;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  filtered: SelectOption[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled || open) return;
    switch (e.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        openPanel();
        break;
      default:
        break;
    }
  }

  /**
   * @complexity 13 cyclomatic / 8 cognitive, measured after the 2026-08-06 `resolveTabTarget`
   * extraction dropped cognitive from 15 to 8 (the nested `if`/`indexOf`/ternary that used to sit in
   * the `"Tab"` case is gone from this body). Cyclomatic exceeds both the ≤10 ceiling this pass
   * started under and the ≤9/≤9 bar it was later tightened to — under either bar, for the same
   * reason: ESLint's `complexity` rule charges one branch per `case` label, so the 13 is a count of
   * the seven keys this handler answers to (Escape/ArrowDown/ArrowUp/Home/End/Enter/Tab) plus the
   * `Enter` case's own `if`/`&&` — not nested branching, which is what cognitive complexity models
   * and which stays at 8, under both bars. Tried: moving the `"Tab"` case body out (done, above) —
   * it lowered cognitive but a switch's cyclomatic score doesn't fall by moving case *bodies*
   * elsewhere, only by removing cases. The remaining way to lower it is to stop being a switch —
   * collapse it into a key -> handler lookup table — which both this file's header and this pass's
   * own dispatch brief reject explicitly for this function: "a keyboard handler written as a flat
   * switch is the clearest form available, and converting the dispatch into a lookup table would
   * trade that clarity for a lower number." Documented exemption under this pass's acceptance
   * criterion (≤9/≤9 OR a documented reason, tightened 2026-08-06 from the original ≤10/≤10), not an
   * oversight.
   */
  function handlePanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "Escape":
        // Must not bubble: a host dialog (`WidgetPickerDialog`) listens for Escape on `document`
        // to cancel the whole modal. Without stopping propagation here, closing just this dropdown
        // would also close the dialog underneath it — the regression `Select.unit.test.tsx` pins.
        e.preventDefault();
        e.stopPropagation();
        closePanel({ refocusTrigger: true });
        break;
      case "ArrowDown":
        e.preventDefault();
        moveHighlight(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveHighlight(-1);
        break;
      case "Home":
        e.preventDefault();
        setHighlightedIndex(filtered.length ? 0 : -1);
        break;
      case "End":
        e.preventDefault();
        setHighlightedIndex(filtered.length ? filtered.length - 1 : -1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) selectOption(filtered[highlightedIndex]);
        break;
      case "Tab": {
        // See `resolveTabTarget`'s own comment: walk the trigger's real DOM-order neighbours rather
        // than let native Tab handling run, since this event is bubbling from a panel portaled to
        // the end of `document.body`, not sitting next to the trigger in the DOM.
        const target = resolveTabTarget(panelRef.current, triggerRef.current, e.shiftKey);
        e.preventDefault();
        closePanel({ refocusTrigger: false });
        target?.focus();
        break;
      }
      default:
        break;
    }
  }

  return { handleTriggerKeyDown, handlePanelKeyDown };
}

/**
 * Owns every piece of `Select`'s open/search/highlight/position state, its outside-click,
 * scroll/resize, and keyboard-driven effects, and the handlers the trigger/panel JSX wires up to —
 * everything except the inert rendering itself. Split out so the branch combinations below (search
 * visibility, highlight wraparound, upward/downward placement, the outside-viewport auto-close)
 * are exercisable directly with `renderHook`, not only by driving the full portaled DOM tree.
 *
 * Composed from five smaller private hooks (`usePanelPosition`, `useCloseOnOutsideClick`,
 * `useResetHighlightOnQueryChange`, `useScrollHighlightedIntoView`, `useSelectKeyboardHandlers`) as
 * of the 2026-08-06 complexity pass — see this file's header for why. Its own return shape and
 * every field on it are unchanged from before that pass.
 *
 * @param input.value - The currently selected option's value (may not match any option).
 * @param input.onChange - Called with the newly selected option's value.
 * @param input.options - The full option list; `filtered` narrows this by the live search query.
 * @param input.disabled - When true, `openPanel` and the trigger's own key handler both no-op.
 * @returns Everything `Select`'s JSX reads or calls: open/search/highlight state and their
 *   setters, the trigger/panel/search-input/option refs, `listboxId`, `showSearch`, `filtered`,
 *   `selectedOption`, the `openPanel`/`closePanel`/`selectOption` actions, the trigger/panel
 *   keydown handlers, and `optionId` (bound to this hook's own `listboxId`).
 * @example
 * const { open, filtered, handleTriggerKeyDown } = useSelectDropdown({ value, onChange, options });
 */
export function useSelectDropdown({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Index -> `<li>` node, so the highlight-follow effect below can scroll the right row into view
  // without an id-based `querySelector` (this component's ids come from `useId()`, which can
  // contain characters — `:`, in React's own scheme — that need escaping in a CSS selector; a
  // direct ref avoids that entirely). Populated by each option's own ref callback below.
  const optionRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const listboxId = useId();

  const showSearch = options.length >= SEARCH_VISIBILITY_THRESHOLD;
  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, showSearch]);

  const selectedOption = options.find((o) => o.value === value) ?? null;

  function openPanel() {
    if (disabled) return;
    const initialIndex = options.findIndex((o) => o.value === value);
    setQuery("");
    setOpen(true);
    setHighlightedIndex(initialIndex >= 0 ? initialIndex : options.length ? 0 : -1);
  }

  function closePanel(opts: { refocusTrigger: boolean }) {
    setOpen(false);
    setPosition(null); // forces the effect below through its "measure, then focus" two-phase sequence again on the next open, rather than focusing at a stale, pre-close position
    if (opts.refocusTrigger) triggerRef.current?.focus();
  }

  function selectOption(option: SelectOption) {
    onChange(option.value);
    closePanel({ refocusTrigger: true });
  }

  function moveHighlight(delta: 1 | -1) {
    setHighlightedIndex((current) => {
      if (filtered.length === 0) return -1;
      return (current + delta + filtered.length) % filtered.length;
    });
  }

  const { position, setPosition } = usePanelPosition({
    open,
    triggerRef,
    panelRef,
    searchInputRef,
    showSearch,
    onOutOfView: () => closePanel({ refocusTrigger: false }),
  });

  useCloseOnOutsideClick({
    open,
    triggerRef,
    panelRef,
    onOutside: () => closePanel({ refocusTrigger: false }),
  });

  useResetHighlightOnQueryChange({ open, query, hasMatches: filtered.length > 0, setHighlightedIndex });

  useScrollHighlightedIntoView({ open, highlightedIndex, optionRefs });

  const { handleTriggerKeyDown, handlePanelKeyDown } = useSelectKeyboardHandlers({
    disabled,
    open,
    openPanel,
    closePanel,
    moveHighlight,
    selectOption,
    highlightedIndex,
    setHighlightedIndex,
    filtered,
    triggerRef,
    panelRef,
  });

  const optionId = (index: number) => buildOptionId(listboxId, index);

  return {
    open,
    query,
    setQuery,
    highlightedIndex,
    setHighlightedIndex,
    position,
    triggerRef,
    panelRef,
    searchInputRef,
    optionRefs,
    listboxId,
    showSearch,
    filtered,
    selectedOption,
    openPanel,
    closePanel,
    selectOption,
    handleTriggerKeyDown,
    handlePanelKeyDown,
    optionId,
  };
}
