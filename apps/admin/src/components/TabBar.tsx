import type { ReactNode } from "react";
import { agentHandle } from "@jini-ai/agentic";
import { tabHandleProps } from "./TabBar.hooks";

/**
 * @file A generic horizontal tab row — id/label pairs, an active id, a change callback. No routing,
 * no persistence, no per-tab panel contract (unlike `@jini-ai/ui`'s `SettingsDialogShell`, which
 * bundles a vertical sidebar of tabs with its own kicker/title/subtitle header and dialog/inline
 * presentation modes). Built local because neither `@jini-ai/ui` nor `@jini-ai/admin/react` exports
 * a standalone tab-bar outside that dialog shell — see `features/themes/Themes.tsx` and
 * `features/pages/Pages.tsx`, the two full-page list screens this backs.
 *
 * Same `role="tablist"`/`role="tab"`/`aria-selected` shape `features/media/Media.tsx`'s inline tab
 * markup already uses, so a screen reader sees the same semantics everywhere in this app that has
 * tabs — but with real CSS (`.tab-bar`/`.tab-bar-item` in `styles.css`), since that markup had none
 * at the time this was written.
 *
 * `containerHandle`/`TabBarTab.handle` (added for the Deployment panel's agentHandle pass) are both
 * optional and additive: `Themes.tsx`/`Pages.tsx` set neither and render exactly as before, since
 * `agentHandle()` is only spread onto an element when its handle is present.
 */
export interface TabBarTab {
  readonly id: string;
  readonly label: string;
  /** An inline icon rendered before {@link label} — same slot Settings' own wrapped icon-tab row
   *  uses for its 13 tabs (`SettingsUi.tsx`'s `TabIcon`-wrapped SVGs), added here so Deployment,
   *  Security, and Source Control's Providers tab can match that look without adopting
   *  `SettingsDialogShell` itself (see those files' own headers for why not). Always `aria-hidden`
   *  — every icon here sits directly beside the text label that already says the same thing, same
   *  reasoning `deployment-visuals.tsx`'s own icon set documents for its icons. Optional and
   *  additive: a caller that never sets it (`Themes.tsx`, `Pages.tsx`, `ThemeExplore.tsx`, `Media.tsx`)
   *  renders exactly as before — nothing here changes `TabBarButton`'s layout when `icon` is absent. */
  readonly icon?: ReactNode;
  /** Shown next to the label when present (e.g. a theme count per tier). Omit to show none. */
  readonly count?: number;
  /**
   * Renders this tab greyed out and non-interactive: no `onChange` call, not part of the tab
   * order (native `disabled`), `aria-disabled` set for assistive tech. For scaffolding a future
   * tab (e.g. a "Marketplace (soon)" placeholder with no real destination yet) that should be
   * visibly present without inviting a click into nothing.
   */
  readonly disabled?: boolean;
  /** Publishes this tab button as agent-addressable via `agentHandle()` (`@jini-ai/agentic`). Omit
   *  to leave the tab untagged. */
  readonly handle?: string;
  /** Plain-English description of what switching to this tab does, paired with {@link handle}.
   *  Defaults to `label` (untranslated tab labels, e.g. Deployment's, still read fine as a
   *  description; a caller with a translated `label` should pass its own). Ignored if `handle` is
   *  omitted. */
  readonly handleLabel?: string;
  /**
   * Renders a small filled dot before this tab's label — a compact "this one has something
   * configured" signifier for a tab bar whose panels don't all show on screen at once. Built for
   * the Deployment panel's publish-target picker (`StaticSiteTab.tsx`): collapsing that picker to
   * showing one provider's credential row at a time (2026-08-16) removed the only place a reader
   * could previously see which providers already had a saved credential without clicking through
   * every tab — this restores that at-a-glance fact to the tab row itself, and unlike the old "all
   * four rows, all the time" layout it scales to a fifth provider without getting denser.
   *
   * Meaning is carried by the dot's PRESENCE, not by which color it happens to render in — the
   * absence of a dot is itself legible (nothing to report), which is a shape/presence distinction
   * rather than a same-shape color-only one (`frontend-accessibility`: "color is not the only means
   * of conveying information", same reasoning `CapabilityMark`'s own doc in `deployment-visuals.tsx`
   * gives for using distinct check/cross glyphs rather than one glyph in two colors). The dot is
   * still `aria-hidden` — {@link dotLabel} is what a screen reader actually gets, appended to this
   * tab's own accessible name via visually-hidden text, same pattern `CopyLine`'s own
   * `copyAccessibleName` documents for keeping a visual-only cue out of the accessible name entirely
   * unless a text equivalent is supplied alongside it.
   */
  readonly dot?: boolean;
  /** Visually-hidden text appended to this tab's accessible name when {@link dot} is set — e.g.
   *  "Connected". Required whenever `dot` is true; ignored otherwise. */
  readonly dotLabel?: string;
}

export interface TabBarProps {
  tabs: readonly TabBarTab[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** Publishes the tablist container itself as agent-addressable. Omit to leave it untagged. */
  containerHandle?: string;
}

/** The visually-hidden accessible-name SUFFIX {@link TabBarTab.dot} adds — e.g. "GitHub Pages,
 *  Connected", never "Connected GitHub Pages". Deliberately its own function rather than folded into
 *  the visual dot span rendered before the label (`TabBarButton` below): the visual dot is
 *  `aria-hidden` and belongs immediately before the label, where a leading bullet reads naturally,
 *  but the ACCESSIBLE text has to come AFTER the label text in DOM order for the tab's accessible
 *  name (label + this suffix, concatenated in DOM order) to read as a sentence rather than a
 *  fragment stitched on backwards. Split out for the same complexity-gate reason {@link
 *  TabBarButton}'s own doc gives. */
function tabDotAccessibleSuffix(tab: TabBarTab) {
  if (!tab.dot || !tab.dotLabel) return null;
  return <span className="visually-hidden">, {tab.dotLabel}</span>;
}

/** One tab button — split out of {@link TabBar}'s own `.map()` purely for the complexity gate: this
 *  repo's `apps/admin` ESLint gate is a hard 9/9 cyclomatic/cognitive ceiling
 *  (`eslint.config.mjs`'s own `F06 option B` block), and `sonarjs/cognitive-complexity` scores a
 *  branch INSIDE an inline `.map()` callback with a nesting penalty on top of the branch itself —
 *  adding the {@link TabBarTab.dot}/`dotLabel` rendering (two more conditionals) is what pushed
 *  `TabBar` from 9 over budget. A named top-level component has no enclosing function to nest
 *  inside, so its own branches are scored on their own, same reasoning this app's other per-row
 *  extractions give (e.g. `StaticSiteTab.tsx`'s `ProviderCliRow`, split out of `GettingItOnlineCard`'s
 *  own `.map()` for the identical reason) — `tabHandleProps` (now in `TabBar.hooks.tsx`, per the
 *  admin TSX-logic-sweep, 2026-09-05: it returns a plain props object, no JSX) and
 *  {@link tabDotAccessibleSuffix} below take the same treatment one level further, since even this
 *  component alone still counted over budget with every branch inlined. No behavior moved, only
 *  where the branches are counted. */
function TabBarButton({ tab, active, onChange }: { tab: TabBarTab; active: boolean; onChange: (id: string) => void }) {
  return (
    <button
      type="button"
      role="tab"
      className="tab-bar-item"
      aria-selected={active}
      aria-disabled={tab.disabled || undefined}
      disabled={tab.disabled}
      onClick={tab.disabled ? undefined : () => onChange(tab.id)}
      {...tabHandleProps(tab)}
    >
      {tab.dot ? <span className="tab-bar-dot" aria-hidden="true" /> : null}
      {tab.icon ? (
        <span className="tab-bar-icon" aria-hidden="true">
          {tab.icon}
        </span>
      ) : null}
      {tab.label}
      {tabDotAccessibleSuffix(tab)}
      {tab.count !== undefined ? <span className="tab-bar-count">{tab.count}</span> : null}
    </button>
  );
}

export function TabBar({ tabs, activeId, onChange, ariaLabel, containerHandle }: TabBarProps) {
  return (
    <div
      className="tab-bar"
      role="tablist"
      aria-label={ariaLabel}
      {...(containerHandle ? agentHandle(containerHandle, { role: "region", label: ariaLabel }) : {})}
    >
      {tabs.map((tab) => (
        <TabBarButton key={tab.id} tab={tab} active={activeId === tab.id} onChange={onChange} />
      ))}
    </div>
  );
}
