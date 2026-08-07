import { createPortal } from "react-dom";
import { useSelectDropdown, type PanelPosition, type SelectOption } from "./Select.hooks";
import "../../styles/select.css";

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
 *
 * Split into this file (props + JSX only) and `Select.hooks.tsx` (the open/search/highlight/
 * position state, its effects, and the DOM helper functions that state calls), per the
 * `@jini-ai/admin` extraction pattern (`ConfirmDialog.tsx`/`ConfirmDialog.hooks.tsx` in that
 * package). The `useDropdown` prop below is the same kind of injectable seam `ConfirmDialog`'s
 * `useDialog` prop is — it lets a test render this component's JSX against a fake without invoking
 * the real portal, `getBoundingClientRect`, or any of the scroll/resize/outside-click listeners.
 */

export type { SelectOption };

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
  /** Injectable seam for the dropdown's open/search/highlight/position state and its DOM effects.
   *  Defaults to the real {@link useSelectDropdown}; a test can pass a fake here to exercise
   *  `Select`'s rendering without driving the real positioning math, portal, or event listeners. */
  useDropdown?: typeof useSelectDropdown;
}

/** One row of the option list — the `isSelected`/`isHighlighted` derivation, the option's
 *  className chain, and the "show a checkmark" branch, pulled out of `SelectPanel`'s `.map()` as a
 *  top-level component per this pass's extraction rule (§2 of the complexity-ceiling brief: extract
 *  to a named function, never a closure nested inside the thing being measured). Purely
 *  presentational — every value it needs is a prop, nothing here reaches back into `useDropdown`'s
 *  state directly. */
function SelectOptionRow({
  option,
  index,
  isSelected,
  isHighlighted,
  optionId,
  setOptionRef,
  onHighlight,
  onSelect,
}: {
  option: SelectOption;
  index: number;
  isSelected: boolean;
  isHighlighted: boolean;
  optionId: string;
  setOptionRef: (index: number, el: HTMLLIElement | null) => void;
  onHighlight: (index: number) => void;
  onSelect: (option: SelectOption) => void;
}) {
  return (
    <li
      ref={(el) => setOptionRef(index, el)}
      id={optionId}
      role="option"
      aria-selected={isSelected}
      className={`select-option${isSelected ? " is-selected" : ""}${isHighlighted ? " is-highlighted" : ""}`}
      onMouseEnter={() => onHighlight(index)}
      onClick={() => onSelect(option)}
    >
      <span className="select-option-label">{option.label}</span>
      {isSelected ? (
        <svg className="select-option-check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </li>
  );
}

/** The floating panel's whole contents — search input, empty state, and option list — pulled out
 *  of `Select` as a top-level component (same extraction rule as `SelectOptionRow`, above). `Select`
 *  itself now only decides *whether* to portal this in; everything about what's inside the portal
 *  lives in this component's own scope instead of nested inside `Select`'s body. Rendered only when
 *  `open && position` (checked by the caller), so `position` here is never null. */
function SelectPanel({
  panelRef,
  position,
  showSearch,
  searchInputRef,
  query,
  setQuery,
  filtered,
  value,
  highlightedIndex,
  listboxId,
  optionId,
  setOptionRef,
  onHighlight,
  onSelect,
  onKeyDown,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  position: PanelPosition;
  showSearch: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (query: string) => void;
  filtered: SelectOption[];
  value: string;
  highlightedIndex: number;
  listboxId: string;
  optionId: (index: number) => string;
  setOptionRef: (index: number, el: HTMLLIElement | null) => void;
  onHighlight: (index: number) => void;
  onSelect: (option: SelectOption) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      ref={panelRef}
      className="select-panel"
      style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
      tabIndex={-1}
      onKeyDown={onKeyDown}
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
          filtered.map((option, index) => (
            <SelectOptionRow
              key={option.value}
              option={option}
              index={index}
              isSelected={option.value === value}
              isHighlighted={index === highlightedIndex}
              optionId={optionId(index)}
              setOptionRef={setOptionRef}
              onHighlight={onHighlight}
              onSelect={onSelect}
            />
          ))
        )}
      </ul>
    </div>
  );
}

export function Select(props: SelectProps) {
  const { value, onChange, options, placeholder, id, disabled, useDropdown = useSelectDropdown } = props;
  const ariaLabel = props["aria-label"];
  const ariaLabelledBy = props["aria-labelledby"];

  const {
    open,
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
    query,
    setQuery,
  } = useDropdown({ value, onChange, options, disabled });

  function setOptionRef(index: number, el: HTMLLIElement | null) {
    if (el) optionRefs.current.set(index, el);
    else optionRefs.current.delete(index);
  }

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
            <SelectPanel
              panelRef={panelRef}
              position={position}
              showSearch={showSearch}
              searchInputRef={searchInputRef}
              query={query}
              setQuery={setQuery}
              filtered={filtered}
              value={value}
              highlightedIndex={highlightedIndex}
              listboxId={listboxId}
              optionId={optionId}
              setOptionRef={setOptionRef}
              onHighlight={setHighlightedIndex}
              onSelect={selectOption}
              onKeyDown={handlePanelKeyDown}
            />,
            document.body
          )
        : null}
    </>
  );
}
