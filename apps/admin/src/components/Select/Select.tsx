import "../../styles/select.css";
import { Select as PackageSelect, resolveSelectTriggerLabel as resolvePackageLabel, type SelectOption, type SelectProps as PackageProps } from "@jini-ai/ui/admin-widgets";
import type { useSelectDropdown } from "./Select.hooks";
import type { Translate } from "../../lib/dictionary-translator";

export type { SelectOption } from "@jini-ai/ui/admin-widgets";

export type SelectProps = Omit<PackageProps, "useDropdown"> & {
  useDropdown?: typeof useSelectDropdown;
};

/** Preserve the host's injectable hook props while the package owns rendering and live effects.
 *
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
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
 *
 *  Injectable seam for the dropdown's open/search/highlight/position state and its DOM effects.
 *  Defaults to the real {@link useSelectDropdown}; a test can pass a fake here to exercise
 *  `Select`'s rendering without driving the real positioning math, portal, or event listeners.
 *
 *  This select's own base handle — see this file's "Agent handles" doc for the full scheme. Omit
 *  to leave it (and every option) untagged.
 *
 *  Translates this component's own static copy (`"Search options"`, `"Search…"`, `"No matches"`,
 *  the default `"Select…"` placeholder) — `components/shared-components-i18n.ts`'s dictionary,
 *  bound to a locale by the caller's own wired hook (see `WidgetPickerDialog.hooks.tsx`'s `t`).
 *  Defaults to an identity passthrough, so a caller that has no locale to give (or a test) renders
 *  the English source strings unchanged.
 *
 *  One row of the option list — the `isSelected`/`isHighlighted` derivation, the option's
 *  className chain, and the "show a checkmark" branch, pulled out of `SelectPanel`'s `.map()` as a
 *  top-level component per this pass's extraction rule (§2 of the complexity-ceiling brief: extract
 *  to a named function, never a closure nested inside the thing being measured). Purely
 *  presentational — every value it needs is a prop, nothing here reaches back into `useDropdown`'s
 *  state directly.
 *
 *  This row's own already-resolved handle, positionally aligned by the caller — see `Select`'s
 *  own "Agent handles" doc. `undefined` when the base `Select` published no handle at all.
 *
 *  The floating panel's whole contents — search input, empty state, and option list — pulled out
 *  of `Select` as a top-level component (same extraction rule as `SelectOptionRow`, above). `Select`
 *  itself now only decides *whether* to portal this in; everything about what's inside the portal
 *  lives in this component's own scope instead of nested inside `Select`'s body. Rendered only when
 *  `open && position` (checked by the caller), so `position` here is never null.
 *
 *  The search input's own handle, or `undefined` when `Select` published no base handle.
 *
 *  One handle per entry in `filtered`, positionally aligned — see `Select`'s own "Agent handles"
 *  doc. `undefined` (rather than an empty array) when `Select` published no base handle at all.
 *
 *  Already-bound translator for this panel's own static copy — see `SelectProps.t`.
 *
 *  The trigger button's derived label text + "is it showing a placeholder" className — pulled out
 *  of `Select`'s own render body as a top-level pure function under the tightened ≤9/≤9 pass, same
 *  extraction rule as `SelectPanel`/`SelectOptionRow` above.
 *
 *  The trigger `<button>`'s `aria-activedescendant` — the currently highlighted option's id while
 *  open, `undefined` otherwise. Pulled out of `Select`'s own body for the same complexity-budget
 *  reason as `resolveSelectTriggerLabel` above; same value, same two-branch condition.
 *
 *  The trigger `<button>`'s own `data-agent-*` spread — `{}` when `Select` published no base
 *  handle. Pulled out for the same reason as {@link resolveSelectTriggerActiveDescendant}: the
 *  `??` fallback chain for the handle's label lives here instead of in `Select`'s own scope.
 *
 * One handle per FILTERED option, recomputed as the search query narrows the list — an option
 * dropped by the current query has no rendered row to attach a handle to, so it is simply absent
 * this render rather than holding a handle nothing resolves to. `undefined` (not an empty array)
 * when `base` itself is unset, so `SelectPanel` can tell "opted out" apart from "no options match".
 */
export function Select({ useDropdown, ...props }: SelectProps) {
  const useHostDropdown: PackageProps["useDropdown"] = useDropdown
    ? (required, optional = {}) => useDropdown({ ...required, ...optional })
    : undefined;
  return <PackageSelect {...props} useDropdown={useHostDropdown} />;
}

/** Keep the host's helper contract while Jini resolves translated trigger copy. */
export function resolveSelectTriggerLabel(selectedOption: SelectOption | null, placeholder: string | undefined, t: Translate = (key) => key) {
  return resolvePackageLabel({ selectedOption, placeholder }, { t });
}
// Search/listbox rationale: Jini/packages/ui/src/features/admin-widgets/components/Select/Select.tsx.
