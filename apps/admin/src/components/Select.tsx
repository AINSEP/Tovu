import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/select.css";

/**
 * @file `Select` — a small self-contained searchable dropdown standing in for a native `<select>`
 * wherever the OS-drawn option list (unstylable, no room for a search field) doesn't meet the
 * design (`WidgetPickerDialog.tsx`'s two selects, per the dispatch that created this component).
 * Plain React + CSS, no listbox library added — `styles/select.css`'s own header explains why the
 * floating panel is a real `document.body` portal rather than an in-place absolutely-positioned
 * child.
 *
 * Deliberately narrow in intended use: this replaces exactly the two `<select>`s named in that
 * dispatch, not every `<select>` in the admin — every other native select in this app keeps its OS
 * chrome on purpose (see `styles.css`'s own `select` rule comment on why faking a listbox
 * generally trades one set of a11y/behavior bugs for another). That tradeoff is worth it here
 * specifically because the design calls for an in-panel search field a native select cannot host;
 * it is not a blanket "native selects are wrong" verdict.
 *
 * Colocated + self-imports its own stylesheet the same way `AssistantDock.tsx` imports
 * `assistant.css` directly (see that file's header for the established precedent) rather than
 * adding a line to `main.tsx` — component and styles are meant to move together into
 * `@jini-ai/admin` later, per the dispatch that created this.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
}

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

export function focusableInDomOrder(exclude: HTMLElement | null): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !exclude || !exclude.contains(el)
  );
}

interface PanelPosition {
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
 * Owns every piece of `Select`'s open/search/highlight/position state, its outside-click,
 * scroll/resize, and keyboard-driven effects, and the handlers the trigger/panel JSX wires up to —
 * everything except the inert rendering itself. Split out so the branch combinations below (search
 * visibility, highlight wraparound, upward/downward placement, the outside-viewport auto-close)
 * are exercisable directly with `renderHook`, not only by driving the full portaled DOM tree.
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
  const [position, setPosition] = useState<PanelPosition | null>(null);

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
  // it's open — `.widget-picker-body`'s own new `overflow-y: auto` (this same dispatch's Task 1)
  // made this a real, live scenario rather than a hypothetical one. `scroll` needs the capture
  // phase: an inner element's own scroll does not bubble to `window` in the bubble phase.
  //
  // Found live in a real browser, not by this component's own test suite: scrolling a host's
  // scrolling ancestor far enough that the trigger scrolls out of its own visible clip still leaves
  // this effect happily recomputing a mathematically-correct `position` for it — the panel just
  // ends up following the trigger to an off-screen (or behind-the-header, obscured) spot, floating
  // there indefinitely, nominally still "open" with no visible way to tell. A native `<select>`'s
  // OS popup does not survive its trigger leaving view; this closes the panel instead of chasing a
  // trigger nobody can see, the same idea. `elementFromPoint` at the trigger's own center is the
  // generic check (works for any clipping ancestor, not just `.widget-picker-body` specifically) —
  // it asks "is my trigger actually the thing rendered at its own center point", which is false
  // once a clipping ancestor (or the viewport edge) has hidden it.
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const outOfViewport = rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth;
      if (outOfViewport) {
        closePanel({ refocusTrigger: false });
        return;
      }
      // Guarded, not assumed available: some environments (older WebViews, this app's own jsdom
      // test harness) don't implement `elementFromPoint` at all. Where it exists, it also catches
      // the narrower case of a clipping ancestor hiding the trigger without pushing it past the
      // viewport edge (e.g. scrolled up behind a dialog's own fixed header) — where it doesn't,
      // this degrades to the viewport-edge check above only, rather than throwing.
      if (typeof document.elementFromPoint === "function") {
        const topmostAtCenter = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const obscured = !topmostAtCenter || !(el.contains(topmostAtCenter) || topmostAtCenter.contains(el));
        if (obscured) {
          closePanel({ refocusTrigger: false });
          return;
        }
      }
      setPosition(computePosition(el));
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      closePanel({ refocusTrigger: false });
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The previously-highlighted option may not even be in `filtered` once the search narrows the
  // list, so re-anchor the highlight to the top match every time the query changes.
  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(filtered.length ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Found live in a real browser, not by this component's own test suite until added just now: a
  // list longer than the panel's own `max-height` (`styles/select.css`) moved the LOGICAL highlight
  // correctly via ArrowUp/ArrowDown (`aria-activedescendant`, the `.is-highlighted` class both
  // updated), but nothing ever scrolled `.select-list` to bring that row into view — keyboard-
  // navigating past the visible fold silently lost track of where the highlight even was.
  // `"nearest"` (not `"center"`) only scrolls the minimum needed, so it doesn't fight a user who has
  // manually scrolled partway through an unrelated portion of the list.
  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const el = optionRefs.current.get(highlightedIndex);
    // Guarded the same way as `document.elementFromPoint` above — this app's own jsdom test
    // harness doesn't implement `scrollIntoView` at all (not even as a no-op), so an unguarded call
    // throws inside the effect on every highlight change.
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);

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
        // See `focusableInDomOrder`'s own comment: walk the trigger's real DOM-order neighbours
        // rather than let native Tab handling run, since this event is bubbling from a panel
        // portaled to the end of `document.body`, not sitting next to the trigger in the DOM.
        const nodes = focusableInDomOrder(panelRef.current);
        const triggerIndex = triggerRef.current ? nodes.indexOf(triggerRef.current) : -1;
        e.preventDefault();
        closePanel({ refocusTrigger: false });
        if (triggerIndex >= 0) {
          const target = nodes[triggerIndex + (e.shiftKey ? -1 : 1)];
          target?.focus();
        }
        break;
      }
      default:
        break;
    }
  }

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

export function Select(props: SelectProps) {
  const { value, onChange, options, placeholder, id, disabled } = props;
  const ariaLabel = props["aria-label"];
  const ariaLabelledBy = props["aria-labelledby"];

  const {
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
  } = useSelectDropdown({ value, onChange, options, disabled });

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        className="select-trigger"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => (open ? closePanel({ refocusTrigger: false }) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={`select-trigger-label${selectedOption ? "" : " is-placeholder"}`}>
          {selectedOption ? selectedOption.label : (placeholder ?? "Select…")}
        </span>
        <span className="select-trigger-chevron" aria-hidden="true" />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              className="select-panel"
              style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
              tabIndex={-1}
              onKeyDown={handlePanelKeyDown}
            >
              {showSearch ? (
                <input
                  ref={searchInputRef}
                  type="text"
                  className="select-search"
                  aria-label="Search options"
                  placeholder="Search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              ) : null}
              <ul className="select-list" role="listbox" id={listboxId}>
                {filtered.length === 0 ? (
                  <li className="select-empty" role="presentation">
                    No matches
                  </li>
                ) : (
                  filtered.map((option, index) => {
                    const isSelected = option.value === value;
                    const isHighlighted = index === highlightedIndex;
                    return (
                      <li
                        key={option.value}
                        ref={(el) => {
                          if (el) optionRefs.current.set(index, el);
                          else optionRefs.current.delete(index);
                        }}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isSelected}
                        className={`select-option${isSelected ? " is-selected" : ""}${isHighlighted ? " is-highlighted" : ""}`}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => selectOption(option)}
                      >
                        <span className="select-option-label">{option.label}</span>
                        {isSelected ? (
                          <svg className="select-option-check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
