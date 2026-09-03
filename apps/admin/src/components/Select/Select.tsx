import { createPortal } from "react-dom";
import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
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
 *
 * ## Agent handles
 *
 * Given `agentHandle="widget-type"` this publishes, whenever the panel is actually open:
 *
 * | element | handle | role |
 * |---|---|---|
 * | the trigger button | `widget-type` | `button` |
 * | the search field (when shown) | `widget-type-search` | `field` |
 * | one option, keyed by the option's own `value` | `widget-type-option-<slug of value>` | `button` |
 *
 * `page.select_option` does not resolve this component: its DOM is a `<button>` plus a portaled
 * `<ul role="listbox">`, never a native `<select>` (see this file's own header for why), so an
 * agent picks a value the same way a pointer does — click the trigger to open, then click the
 * option's own handle. Options sit under their own `-option-` namespace via `@jini-ai/agentic`'s
 * `buildAgentListHandles`, the same "caller data cannot collide with this component's own literal
 * segments" reasoning `source-config-list/agent-handles.ts` documents for its own `-field-`/
 * `-item-` namespaces. `agentHandle` itself is NOT sanitized — the caller's own explicit choice of
 * name, which should fail loudly at first render if invalid rather than silently answer to a
 * handle never actually written. Omit `agentHandle` and no `data-agent-*` markup is emitted at all.
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
  /** This select's own base handle — see this file's "Agent handles" doc for the full scheme. Omit
   *  to leave it (and every option) untagged. */
  agentHandle?: string;
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
  agentHandle: optionHandle,
}: {
  option: SelectOption;
  index: number;
  isSelected: boolean;
  isHighlighted: boolean;
  optionId: string;
  setOptionRef: (index: number, el: HTMLLIElement | null) => void;
  onHighlight: (index: number) => void;
  onSelect: (option: SelectOption) => void;
  /** This row's own already-resolved handle, positionally aligned by the caller — see `Select`'s
   *  own "Agent handles" doc. `undefined` when the base `Select` published no handle at all. */
  agentHandle?: string;
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
      {...(optionHandle ? agentHandle(optionHandle, { role: "button", label: option.label }) : {})}
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
  searchHandle,
  optionHandles,
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
  /** The search input's own handle, or `undefined` when `Select` published no base handle. */
  searchHandle?: string;
  /** One handle per entry in `filtered`, positionally aligned — see `Select`'s own "Agent handles"
   *  doc. `undefined` (rather than an empty array) when `Select` published no base handle at all. */
  optionHandles?: readonly string[];
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
          {...(searchHandle ? agentHandle(searchHandle, { role: "field", label: "Search the option list" }) : {})}
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
              agentHandle={optionHandles?.[index]}
            />
          ))
        )}
      </ul>
    </div>
  );
}

/** The trigger button's derived label text + "is it showing a placeholder" className — pulled out
 *  of `Select`'s own render body as a top-level pure function under the tightened ≤9/≤9 pass, same
 *  extraction rule as `SelectPanel`/`SelectOptionRow` above. */
export function resolveSelectTriggerLabel(selectedOption: SelectOption | null, placeholder: string | undefined): { text: string; className: string } {
  if (selectedOption) return { text: selectedOption.label, className: "select-trigger-label" };
  return { text: placeholder ?? "Select…", className: "select-trigger-label is-placeholder" };
}

/** The trigger `<button>`'s `aria-activedescendant` — the currently highlighted option's id while
 *  open, `undefined` otherwise. Pulled out of `Select`'s own body for the same complexity-budget
 *  reason as `resolveSelectTriggerLabel` above; same value, same two-branch condition. */
function resolveSelectTriggerActiveDescendant(
  open: boolean,
  highlightedIndex: number,
  optionId: (index: number) => string,
): string | undefined {
  return open && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined;
}

/** The trigger `<button>`'s own `data-agent-*` spread — `{}` when `Select` published no base
 *  handle. Pulled out for the same reason as {@link resolveSelectTriggerActiveDescendant}: the
 *  `??` fallback chain for the handle's label lives here instead of in `Select`'s own scope. */
function resolveSelectTriggerHandleProps(
  base: string | undefined,
  ariaLabel: string | undefined,
  placeholder: string | undefined,
): Record<string, unknown> {
  return base ? agentHandle(base, { role: "button", label: ariaLabel ?? placeholder ?? "Select an option" }) : {};
}

export function Select(props: SelectProps) {
  const { value, onChange, options, placeholder, id, disabled, useDropdown = useSelectDropdown, agentHandle: base } = props;
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

  const triggerLabel = resolveSelectTriggerLabel(selectedOption, placeholder);
  const activeDescendant = resolveSelectTriggerActiveDescendant(open, highlightedIndex, optionId);
  // One handle per FILTERED option, recomputed as the search query narrows the list — an option
  // dropped by the current query has no rendered row to attach a handle to, so it is simply absent
  // this render rather than holding a handle nothing resolves to. `undefined` (not an empty array)
  // when `base` itself is unset, so `SelectPanel` can tell "opted out" apart from "no options match".
  const optionHandles = base ? buildAgentListHandles(`${base}-option`, filtered.map((option) => option.value)) : undefined;

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
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => (open ? closePanel({ refocusTrigger: false }) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        {...resolveSelectTriggerHandleProps(base, ariaLabel, placeholder)}
      >
        <span className={triggerLabel.className}>{triggerLabel.text}</span>
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
              searchHandle={base ? `${base}-search` : undefined}
              optionHandles={optionHandles}
            />,
            document.body
          )
        : null}
    </>
  );
}
