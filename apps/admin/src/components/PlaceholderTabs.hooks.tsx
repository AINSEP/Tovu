import type { SettingsDialogTab } from "@jini-ai/ui";
import type { PlaceholderTabSpec } from "./PlaceholderTabs";

/**
 * @file `PlaceholderTabs.tsx`'s own derived-data transform, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` pattern (admin TSX-logic-sweep, 2026-09-05) — this repo's rule
 * that a `.tsx` file carries no functions or derived logic of its own. `toSettingsDialogTabs` is
 * a pure `PlaceholderTabSpec[] -> SettingsDialogTab[]` mapping with no React state and no
 * rendering, so it moves here rather than staying a `.map()` in the component body.
 */

/** Maps this section's placeholder tab specs onto the shape `SettingsDialogShell` expects, filling
 *  in the per-tab header strings (`title`/`subtitle`) the shell renders above the tab strip — see
 *  `PlaceholderTabs.tsx`'s own file header for why those replaced a `ComingSoonNotice` panel.
 *  `panel` is always `null`: nothing renders below the header for a placeholder tab. */
export function toSettingsDialogTabs(tabs: readonly PlaceholderTabSpec[]): SettingsDialogTab[] {
  return tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    // Header strings, not panel content — the shell renders these above the tab strip (see the
    // component's file header for why this replaced a `ComingSoonNotice` mounted as the panel).
    // `subtitle` reuses `ComingSoonNotice`'s exact copy so the on-screen text is unchanged, only
    // its position.
    title: tab.label,
    subtitle: `${tab.label} is coming soon.`,
    // Nothing left to show below the divider: the header above already states the one fact this
    // tab has ("X is coming soon"), and a second copy of it in the body would be the same
    // duplicate-heading problem `.settings-ui-section`'s own comment in styles.css calls out for
    // stacking a second header above the shell's.
    panel: null,
  }));
}
