/**
 * @file A generic horizontal tab row — id/label pairs, an active id, a change callback. No routing,
 * no persistence, no per-tab panel contract (unlike `@jini-ai/ui`'s `SettingsDialogShell`, which
 * bundles a vertical sidebar of tabs with its own kicker/title/subtitle header and dialog/inline
 * presentation modes). Built local because neither `@jini-ai/ui` nor `@jini-ai/admin/react` exports
 * a standalone tab-bar outside that dialog shell — see `features/appearance/Appearance.tsx` and
 * `features/pages/Pages.tsx`, the two full-page list screens this backs.
 *
 * Same `role="tablist"`/`role="tab"`/`aria-selected` shape `features/media/Media.tsx`'s inline tab
 * markup already uses, so a screen reader sees the same semantics everywhere in this app that has
 * tabs — but with real CSS (`.tab-bar`/`.tab-bar-item` in `styles.css`), since that markup had none
 * at the time this was written.
 */
export interface TabBarTab {
  readonly id: string;
  readonly label: string;
  /** Shown next to the label when present (e.g. a theme count per tier). Omit to show none. */
  readonly count?: number;
  /**
   * Renders this tab greyed out and non-interactive: no `onChange` call, not part of the tab
   * order (native `disabled`), `aria-disabled` set for assistive tech. For scaffolding a future
   * tab (e.g. a "Marketplace (soon)" placeholder with no real destination yet) that should be
   * visibly present without inviting a click into nothing.
   */
  readonly disabled?: boolean;
}

export interface TabBarProps {
  tabs: readonly TabBarTab[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}

export function TabBar({ tabs, activeId, onChange, ariaLabel }: TabBarProps) {
  return (
    <div className="tab-bar" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tab-bar-item"
          aria-selected={activeId === tab.id}
          aria-disabled={tab.disabled || undefined}
          disabled={tab.disabled}
          onClick={tab.disabled ? undefined : () => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="tab-bar-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
